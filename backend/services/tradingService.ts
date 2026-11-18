import { randomUUID } from 'crypto';
import { getDatabase, IDatabase, ITransactionClient } from '../../database/db';
import { Order, OrderSide, OrderType, TimeInForce, Trade } from '../types';
import { broadcastMarketData } from '../websocket';

export interface PlaceOrderInput {
  accountId: number;
  instrumentId: number;
  side: OrderSide;
  orderType: OrderType;
  timeInForce?: TimeInForce;
  price: number;
  quantity: number;
  clientOrderId?: string;
}

/**
 * Sequential execution mutex to guarantee strict deterministic order matching,
 * atomic transaction isolation, and eliminate race conditions on sequence generation.
 */
class ExecutionMutex {
  private queue: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void;
    const ticket = new Promise<void>(resolve => {
      release = resolve;
    });
    const previous = this.queue;
    this.queue = ticket;

    await previous;
    try {
      return await fn();
    } finally {
      release!();
    }
  }
}

const matchingMutex = new ExecutionMutex();

function normalizeOrder(order: Order): Order {
  return {
    ...order,
    order_id: Number(order.order_id),
    account_id: Number(order.account_id),
    instrument_id: Number(order.instrument_id),
    price: parseFloat(String(order.price)),
    quantity: Number(order.quantity),
    filled_qty: Number(order.filled_qty)
  };
}

function normalizeTrades(trades: Trade[]): Trade[] {
  return trades.map(t => ({
    ...t,
    trade_id: Number(t.trade_id),
    engine_seq: Number(t.engine_seq),
    instrument_id: Number(t.instrument_id),
    price: parseFloat(String(t.price)),
    quantity: Number(t.quantity),
    buy_order_id: Number(t.buy_order_id),
    sell_order_id: Number(t.sell_order_id),
    buyer_account_id: Number(t.buyer_account_id),
    seller_account_id: Number(t.seller_account_id)
  }));
}

export class TradingService {
  /**
   * Pre-trade Risk Filter & Validation
   */
  static async validateRiskLimits(params: PlaceOrderInput, executor?: IDatabase | ITransactionClient): Promise<void> {
    const db = executor || await getDatabase();

    // 1. Verify Instrument
    const instRes = await db.query(
      `SELECT instrument_id, symbol, is_active, min_price, max_price, reference_price, tick_size, lot_size
       FROM instruments WHERE instrument_id = $1`,
      [params.instrumentId]
    );

    if (instRes.rows.length === 0) {
      throw new Error(`Instrument ${params.instrumentId} does not exist`);
    }

    const inst = instRes.rows[0];
    if (!inst.is_active) {
      throw new Error(`Trading is currently halted for ${inst.symbol}`);
    }

    const lotSize = parseInt(inst.lot_size || '1', 10);
    if (params.quantity % lotSize !== 0) {
      throw new Error(`Order quantity ${params.quantity} must be an integer multiple of lot size ${lotSize}`);
    }

    const tickSize = parseFloat(inst.tick_size || '0.01');
    // Price checks for Limit orders
    if (params.orderType !== 'MARKET') {
      if (params.price < parseFloat(inst.min_price) || params.price > parseFloat(inst.max_price)) {
        throw new Error(
          `Price ${params.price} is outside allowed instrument range [${inst.min_price}, ${inst.max_price}]`
        );
      }

      // Check tick size alignment (round to 6 decimal places to prevent floating point remainder issues)
      const remainder = Math.round((params.price / tickSize) * 1e6) % Math.round(1e6);
      if (remainder !== 0) {
        throw new Error(`Order price ${params.price} is not a valid multiple of tick size ${tickSize}`);
      }
    }

    // 2. Fetch Account & Risk Limits
    const accRes = await db.query(
      `SELECT a.account_id, a.cash_balance,
              rl.max_order_qty, rl.max_order_notional, rl.max_position_qty, rl.max_open_orders, rl.price_collar_pct
       FROM accounts a
       LEFT JOIN risk_limits rl ON rl.account_id = a.account_id
       WHERE a.account_id = $1`,
      [params.accountId]
    );

    if (accRes.rows.length === 0) {
      throw new Error(`Trading account ${params.accountId} not found`);
    }

    const acc = accRes.rows[0];
    const refPrice = parseFloat(inst.reference_price);
    const collarPct = acc.price_collar_pct ? parseFloat(acc.price_collar_pct) : 5.0;
    // Market orders calculate purchasing power commitment using protected upper price collar bound
    const effectivePrice = params.orderType === 'MARKET' ? (refPrice * (1 + collarPct / 100)) : params.price;
    const notional = effectivePrice * params.quantity;

    if (acc.max_order_qty && params.quantity > parseInt(acc.max_order_qty, 10)) {
      throw new Error(`Order quantity ${params.quantity} exceeds account maximum order quantity limit of ${acc.max_order_qty}`);
    }

    if (acc.max_order_notional && notional > parseFloat(acc.max_order_notional)) {
      throw new Error(`Order notional value ${notional.toFixed(2)} exceeds account max notional limit of ${acc.max_order_notional}`);
    }

    // Max Net Position Quantity Check
    if (acc.max_position_qty) {
      const maxPos = parseInt(acc.max_position_qty, 10);
      const posRes = await db.query(
        `SELECT net_qty FROM positions WHERE account_id = $1 AND instrument_id = $2`,
        [params.accountId, params.instrumentId]
      );
      const currentNet = posRes.rows.length > 0 ? parseInt(posRes.rows[0].net_qty, 10) : 0;
      const projectedNet = params.side === 'BUY' ? (currentNet + params.quantity) : (currentNet - params.quantity);
      if (Math.abs(projectedNet) > maxPos) {
        throw new Error(
          `Projected position (${projectedNet}) exceeds account maximum position limit of ${maxPos}`
        );
      }
    }

    // Price Collar Check
    if (params.orderType !== 'MARKET' && acc.price_collar_pct) {
      const diffPct = Math.abs((params.price - refPrice) / refPrice) * 100;
      if (diffPct > collarPct) {
        throw new Error(
          `Order price ${params.price} deviates by ${diffPct.toFixed(2)}% from reference price ${refPrice}, exceeding the ${collarPct}% price collar`
        );
      }
    }

    // Open Orders Count Limit Check
    if (acc.max_open_orders) {
      const openCountRes = await db.query(
        `SELECT COUNT(*)::INT AS count FROM orders WHERE account_id = $1 AND status IN ('OPEN', 'PARTIALLY_FILLED')`,
        [params.accountId]
      );
      const currentOpen = openCountRes.rows[0].count;
      if (currentOpen >= parseInt(acc.max_open_orders, 10)) {
        throw new Error(`Account has reached maximum open order limit of ${acc.max_open_orders}`);
      }
    }

    // Cash check for BUY orders with reserved purchasing power calculation
    if (params.side === 'BUY') {
      const reservedRes = await db.query(
        `SELECT COALESCE(SUM((quantity - filled_qty) * price), 0) AS reserved_cash
         FROM orders
         WHERE account_id = $1 AND side = 'BUY' AND status IN ('OPEN', 'PARTIALLY_FILLED')`,
        [params.accountId]
      );
      const reservedCash = parseFloat(reservedRes.rows[0].reserved_cash || '0');
      const cash = parseFloat(acc.cash_balance);
      const availableCash = cash - reservedCash;
      if (availableCash < notional) {
        throw new Error(
          `Insufficient available cash (${availableCash.toFixed(2)}, reserved in open orders: ${reservedCash.toFixed(2)}) for order notional of ${notional.toFixed(2)}`
        );
      }
    }

    // Sell position commitment and short exposure check
    if (params.side === 'SELL') {
      const posRes = await db.query(
        `SELECT net_qty FROM positions WHERE account_id = $1 AND instrument_id = $2`,
        [params.accountId, params.instrumentId]
      );
      const currentNet = posRes.rows.length > 0 ? parseInt(posRes.rows[0].net_qty, 10) : 0;
      const openSellsRes = await db.query(
        `SELECT COALESCE(SUM(quantity - filled_qty), 0) AS committed_qty
         FROM orders
         WHERE account_id = $1 AND instrument_id = $2 AND side = 'SELL' AND status IN ('OPEN', 'PARTIALLY_FILLED')`,
        [params.accountId, params.instrumentId]
      );
      const committedQty = parseInt(openSellsRes.rows[0].committed_qty, 10);
      const maxPos = acc.max_position_qty ? parseInt(acc.max_position_qty, 10) : 5000;
      const totalShortExposure = Math.abs(currentNet - committedQty - params.quantity);
      if (totalShortExposure > maxPos) {
        throw new Error(
          `Projected short exposure (${totalShortExposure}) exceeds account maximum position limit of ${maxPos} (Current net: ${currentNet}, Open sell commitments: ${committedQty})`
        );
      }
    }
  }

  /**
   * Submit and Match Order (Atomic Transaction with Row-Level Locking and Guaranteed Connection Affinity)
   */
  static async submitOrder(input: PlaceOrderInput): Promise<{ order: Order; trades: Trade[] }> {
    return matchingMutex.runExclusive(async () => {
      const db = await getDatabase();
      const clientOrderId = input.clientOrderId || randomUUID();

      // Fast-path idempotency check: outside transaction to avoid connection holding
      const existingRes = await db.query<Order>(
        `SELECT * FROM orders WHERE client_order_id = $1`,
        [clientOrderId]
      );

      if (existingRes.rows.length > 0) {
        const existing = existingRes.rows[0];
        // Verify account ownership
        if (Number(existing.account_id) !== Number(input.accountId)) {
          const err = new Error('Forbidden: clientOrderId belongs to another account');
          (err as unknown as { statusCode: number }).statusCode = 403;
          throw err;
        }

        // Verify payload parameters match
        const expectedTif = input.timeInForce || (input.orderType === 'IOC' ? 'IOC' : 'DAY');
        const priceMatches = Math.abs(parseFloat(String(existing.price)) - input.price) < 0.0001;
        const qtyMatches = Number(existing.quantity) === Number(input.quantity);
        const sideMatches = existing.side === input.side;
        const typeMatches = existing.order_type === input.orderType;
        const instMatches = Number(existing.instrument_id) === Number(input.instrumentId);
        const tifMatches = existing.time_in_force === expectedTif;

        if (!priceMatches || !qtyMatches || !sideMatches || !typeMatches || !instMatches || !tifMatches) {
          const err = new Error('Idempotency key reused with differing order parameters');
          (err as unknown as { statusCode: number }).statusCode = 409;
          throw err;
        }

        // Legitimate retry: return existing order and its executed trades
        const existingTradesRes = await db.query<Trade>(
          `SELECT * FROM trades WHERE buy_order_id = $1 OR sell_order_id = $1 ORDER BY trade_id ASC`,
          [existing.order_id]
        );

        return { order: normalizeOrder(existing), trades: normalizeTrades(existingTradesRes.rows) };
      }

      let activeOrder: Order | null = null;
      const trades: Trade[] = [];

      try {
        await db.transaction(async (tx) => {
          // Transaction-scoped per-instrument advisory lock guaranteeing cross-process engine serialization
          await tx.query('SELECT pg_advisory_xact_lock($1)', [input.instrumentId]);

          // Pre-trade risk validation inside the transaction boundary
          await this.validateRiskLimits(input, tx);

          // Atomic sequence allocation for Order ID
          const oidRes = await tx.query(`SELECT nextval('order_id_seq') AS next_id`);
          const orderId = parseInt(oidRes.rows[0].next_id, 10);

          const tif = input.timeInForce || (input.orderType === 'IOC' ? 'IOC' : 'DAY');

          // Insert Order as OPEN
          const orderRes = await tx.query<Order>(
            `INSERT INTO orders (
               order_id, client_order_id, account_id, instrument_id, side, order_type, time_in_force,
               price, quantity, filled_qty, status, submitted_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 'OPEN', NOW(), NOW())
             RETURNING *`,
            [
              orderId,
              clientOrderId,
              input.accountId,
              input.instrumentId,
              input.side,
              input.orderType,
              tif,
              input.price,
              input.quantity
            ]
          );

          activeOrder = orderRes.rows[0];

          // Order Matching Engine Logic
          const oppositeSide: OrderSide = input.side === 'BUY' ? 'SELL' : 'BUY';
          const sortOrder = input.side === 'BUY' ? 'ASC' : 'DESC';

          let candidateSql: string;
          let candidateParams: (string | number)[];

          if (input.orderType === 'MARKET') {
            candidateSql = `
              SELECT order_id, account_id, price, quantity, filled_qty, (quantity - filled_qty) AS leaves_qty
              FROM orders
              WHERE instrument_id = $1 AND side = $2 AND account_id <> $3 AND status IN ('OPEN', 'PARTIALLY_FILLED') AND (quantity - filled_qty) > 0
              ORDER BY price ${sortOrder}, submitted_at ASC, order_id ASC
              FOR UPDATE
            `;
            candidateParams = [input.instrumentId, oppositeSide, input.accountId];
          } else {
            const priceCondition = input.side === 'BUY' ? 'AND price <= $4' : 'AND price >= $4';
            candidateSql = `
              SELECT order_id, account_id, price, quantity, filled_qty, (quantity - filled_qty) AS leaves_qty
              FROM orders
              WHERE instrument_id = $1 AND side = $2 AND account_id <> $3 AND status IN ('OPEN', 'PARTIALLY_FILLED') AND (quantity - filled_qty) > 0
              ${priceCondition}
              ORDER BY price ${sortOrder}, submitted_at ASC, order_id ASC
              FOR UPDATE
            `;
            candidateParams = [input.instrumentId, oppositeSide, input.accountId, input.price];
          }

          const candidates = await tx.query(candidateSql, candidateParams);

          const activeTotalQty = parseInt(String(activeOrder.quantity), 10);
          let remainingQty = activeTotalQty;

          // Fill-Or-Kill (FOK) All-Or-None Validation
          if (tif === 'FOK') {
            const availableLiquidity = candidates.rows.reduce(
              (sum, r) => sum + parseInt(String(r.leaves_qty), 10),
              0
            );
            if (availableLiquidity < activeTotalQty) {
              const updatedActiveRes = await tx.query<Order>(
                `UPDATE orders SET status = 'CANCELLED', status_reason = 'FOK_UNFILLED_INSUFFICIENT_LIQUIDITY', updated_at = NOW()
                 WHERE order_id = $1 RETURNING *`,
                [activeOrder.order_id]
              );
              activeOrder = updatedActiveRes.rows[0];
              return;
            }
          }

          for (const resting of candidates.rows) {
            if (remainingQty <= 0) break;

            const restingLeaves = parseInt(String(resting.leaves_qty), 10);
            if (restingLeaves <= 0) continue;

            const matchPrice = parseFloat(String(resting.price)); // Passive resting order price

            // Market Order Price Collar Protection (5% deviation limit from reference price)
            if (input.orderType === 'MARKET') {
              const instRefRes = await tx.query(`SELECT reference_price FROM instruments WHERE instrument_id = $1`, [input.instrumentId]);
              const refPrice = parseFloat(instRefRes.rows[0].reference_price);
              const collarLimit = refPrice * 0.05;
              if (input.side === 'BUY' && matchPrice > refPrice + collarLimit) {
                break;
              } else if (input.side === 'SELL' && matchPrice < refPrice - collarLimit) {
                break;
              }
            }

            const matchQty = Math.min(remainingQty, restingLeaves);
            if (matchQty <= 0) continue;

            const buyOrderId = input.side === 'BUY' ? activeOrder.order_id : resting.order_id;
            const sellOrderId = input.side === 'SELL' ? activeOrder.order_id : resting.order_id;
            const buyerAccountId = input.side === 'BUY' ? activeOrder.account_id : resting.account_id;
            const sellerAccountId = input.side === 'SELL' ? activeOrder.account_id : resting.account_id;

            // Deadlock Prevention: Deterministic ascending lock ordering on counterparty accounts
            const [firstAcc, secondAcc] = buyerAccountId < sellerAccountId
              ? [buyerAccountId, sellerAccountId]
              : [sellerAccountId, buyerAccountId];
            await tx.query(
              `SELECT account_id FROM accounts WHERE account_id IN ($1, $2) ORDER BY account_id FOR UPDATE`,
              [firstAcc, secondAcc]
            );

            // Generate Trade with atomic sequences
            const tidRes = await tx.query(`SELECT nextval('trade_id_seq') AS next_tid`);
            const seqRes = await tx.query(`SELECT nextval('engine_seq_gen') AS next_seq`);
            const nextTradeId = parseInt(tidRes.rows[0].next_tid, 10);
            const nextSeq = parseInt(seqRes.rows[0].next_seq, 10);

            const tradeRes = await tx.query<Trade>(
              `INSERT INTO trades (
                 trade_id, engine_seq, instrument_id, executed_at, price, quantity,
                 buy_order_id, sell_order_id, buyer_account_id, seller_account_id, aggressor_side
               ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)
               RETURNING *`,
              [
                nextTradeId,
                nextSeq,
                input.instrumentId,
                matchPrice,
                matchQty,
                buyOrderId,
                sellOrderId,
                buyerAccountId,
                sellerAccountId,
                input.side
              ]
            );
            const trade = tradeRes.rows[0];
            trades.push(trade);

            // Generate Fills with atomic sequences (1 Buyer Fill and 1 Seller Fill)
            const fidRes1 = await tx.query(`SELECT nextval('fill_id_seq') AS next_fid`);
            const fidRes2 = await tx.query(`SELECT nextval('fill_id_seq') AS next_fid`);
            const fillId1 = parseInt(fidRes1.rows[0].next_fid, 10);
            const fillId2 = parseInt(fidRes2.rows[0].next_fid, 10);

            // Buyer Fill
            await tx.query(
              `INSERT INTO fills (fill_id, trade_id, order_id, account_id, instrument_id, side, price, quantity, cash_delta, realized_pnl, executed_at)
               VALUES ($1, $2, $3, $4, $5, 'BUY', $6, $7, $8, 0, NOW())`,
              [fillId1, trade.trade_id, buyOrderId, buyerAccountId, input.instrumentId, matchPrice, matchQty, -(matchPrice * matchQty)]
            );

            // Seller Fill
            await tx.query(
              `INSERT INTO fills (fill_id, trade_id, order_id, account_id, instrument_id, side, price, quantity, cash_delta, realized_pnl, executed_at)
               VALUES ($1, $2, $3, $4, $5, 'SELL', $6, $7, $8, 0, NOW())`,
              [fillId2, trade.trade_id, sellOrderId, sellerAccountId, input.instrumentId, matchPrice, matchQty, (matchPrice * matchQty)]
            );

            // Update resting order
            const restingQty = parseInt(String(resting.quantity), 10);
            const newRestingFilled = parseInt(String(resting.filled_qty), 10) + matchQty;
            const newRestingStatus = newRestingFilled >= restingQty ? 'FILLED' : 'PARTIALLY_FILLED';
            await tx.query(
              `UPDATE orders SET filled_qty = $1, status = $2, updated_at = NOW() WHERE order_id = $3`,
              [newRestingFilled, newRestingStatus, resting.order_id]
            );

            remainingQty -= matchQty;
          }

          // Finalize incoming active order status
          const totalFilled = activeTotalQty - remainingQty;
          let finalStatus = activeOrder.status;
          let statusReason: string | null = null;

          if (totalFilled === activeTotalQty) {
            finalStatus = 'FILLED';
          } else if (totalFilled > 0) {
            if (tif === 'IOC' || input.orderType === 'IOC' || input.orderType === 'MARKET') {
              finalStatus = 'CANCELLED';
              statusReason = 'IOC_RESIDUAL_CANCELLED';
            } else {
              finalStatus = 'PARTIALLY_FILLED';
            }
          } else {
            if (tif === 'IOC' || input.orderType === 'IOC' || input.orderType === 'MARKET') {
              finalStatus = 'CANCELLED';
              statusReason = 'IOC_UNFILLED';
            } else {
              finalStatus = 'OPEN';
            }
          }

          const updatedActiveRes = await tx.query<Order>(
            `UPDATE orders SET filled_qty = $1, status = $2, status_reason = $3, updated_at = NOW() WHERE order_id = $4 RETURNING *`,
            [totalFilled, finalStatus, statusReason, activeOrder.order_id]
          );

          activeOrder = updatedActiveRes.rows[0];
        });
      } catch (err: unknown) {
        // Check if duplicate client_order_id was inserted concurrently
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
          const concurrentRes = await db.query<Order>(
            `SELECT * FROM orders WHERE client_order_id = $1`,
            [clientOrderId]
          );
          if (concurrentRes.rows.length > 0) {
            const existing = concurrentRes.rows[0];
            const expectedTif = input.timeInForce || (input.orderType === 'IOC' ? 'IOC' : 'DAY');
            const priceMatches = Math.abs(parseFloat(String(existing.price)) - input.price) < 0.0001;
            const qtyMatches = Number(existing.quantity) === Number(input.quantity);
            const sideMatches = existing.side === input.side;
            const typeMatches = existing.order_type === input.orderType;
            const instMatches = Number(existing.instrument_id) === Number(input.instrumentId);
            const tifMatches = existing.time_in_force === expectedTif;

            if (priceMatches && qtyMatches && sideMatches && typeMatches && instMatches && tifMatches) {
              const concurrentTrades = await db.query<Trade>(
                `SELECT * FROM trades WHERE buy_order_id = $1 OR sell_order_id = $1 ORDER BY trade_id ASC`,
                [existing.order_id]
              );
              return { order: normalizeOrder(existing), trades: normalizeTrades(concurrentTrades.rows) };
            } else {
              const conflictErr = new Error('Idempotency key reused with differing order parameters');
              (conflictErr as unknown as { statusCode: number }).statusCode = 409;
              throw conflictErr;
            }
          }
        }
        throw err;
      }

      // Asynchronous Real-Time Market Broadcasts (after commit)
      if (activeOrder) {
        try {
          const snapshot = await this.getOrderBookSnapshot(input.instrumentId, 10);
          broadcastMarketData({
            type: 'BOOK_UPDATE',
            data: { instrumentId: input.instrumentId, snapshot },
            timestamp: new Date().toISOString()
          });

          for (const t of trades) {
            broadcastMarketData({
              type: 'TRADE_TICK',
              data: t,
              timestamp: new Date().toISOString()
            });
          }
        } catch (wsErr) {
          console.warn('[WS_BROADCAST] Market broadcast error:', wsErr);
        }
      }

      return { order: normalizeOrder(activeOrder!), trades: normalizeTrades(trades) };
    });
  }

  /**
   * Cancel Order (Atomic Transaction with Guaranteed Connection Affinity)
   */
  static async cancelOrder(orderId: number, accountId: number): Promise<Order> {
    return matchingMutex.runExclusive(async () => {
      const db = await getDatabase();
      let cancelledOrder: Order | null = null;

      await db.transaction(async (tx) => {
        const orderRes = await tx.query<Order>(
          `SELECT * FROM orders WHERE order_id = $1 AND account_id = $2 FOR UPDATE`,
          [orderId, accountId]
        );

        if (orderRes.rows.length === 0) {
          throw new Error(`Order ${orderId} not found or unauthorized`);
        }

        const order = orderRes.rows[0];
        if (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED') {
          throw new Error(`Order ${orderId} cannot be cancelled in state ${order.status}`);
        }

        const updated = await tx.query<Order>(
          `UPDATE orders SET status = 'CANCELLED', cancel_requested_at = NOW(), updated_at = NOW()
           WHERE order_id = $1 RETURNING *`,
          [orderId]
        );

        cancelledOrder = updated.rows[0];
      });

      // Real-time Order Book depth update after cancellation (after commit)
      if (cancelledOrder) {
        try {
          const snapshot = await this.getOrderBookSnapshot((cancelledOrder as Order).instrument_id, 10);
          broadcastMarketData({
            type: 'BOOK_UPDATE',
            data: { instrumentId: (cancelledOrder as Order).instrument_id, snapshot },
            timestamp: new Date().toISOString()
          });
        } catch (wsErr) {
          console.warn('[WS_BROADCAST] Cancel market broadcast error:', wsErr);
        }
      }

      return normalizeOrder(cancelledOrder!);
    });
  }

  /**
   * Get Live Order Book Depth Snapshot
   */
  static async getOrderBookSnapshot(instrumentId: number, depth: number = 10) {
    const db = await getDatabase();

    const bidsRes = await db.query(
      `SELECT price, SUM(quantity - filled_qty)::BIGINT AS total_qty, COUNT(*)::INT AS order_count
       FROM orders
       WHERE instrument_id = $1 AND side = 'BUY' AND status IN ('OPEN', 'PARTIALLY_FILLED')
       GROUP BY price
       ORDER BY price DESC
       LIMIT $2`,
      [instrumentId, depth]
    );

    const asksRes = await db.query(
      `SELECT price, SUM(quantity - filled_qty)::BIGINT AS total_qty, COUNT(*)::INT AS order_count
       FROM orders
       WHERE instrument_id = $1 AND side = 'SELL' AND status IN ('OPEN', 'PARTIALLY_FILLED')
       GROUP BY price
       ORDER BY price ASC
       LIMIT $2`,
      [instrumentId, depth]
    );

    return {
      instrumentId,
      timestamp: new Date().toISOString(),
      bids: bidsRes.rows.map(r => ({ price: parseFloat(r.price), quantity: parseInt(r.total_qty, 10), count: r.order_count })),
      asks: asksRes.rows.map(r => ({ price: parseFloat(r.price), quantity: parseInt(r.total_qty, 10), count: r.order_count }))
    };
  }

  /**
   * Get Account Positions & Portfolio Mark-to-Market
   */
  static async getPortfolio(accountId: number) {
    const db = await getDatabase();
    const res = await db.query(
      `SELECT * FROM v_portfolio_summary WHERE account_id = $1`,
      [accountId]
    );
    return res.rows;
  }
}
