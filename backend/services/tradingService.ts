import { randomUUID } from 'crypto';
import { getDatabase } from '../../database/db';
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
}

export class TradingService {
  /**
   * Pre-trade Risk Filter & Validation
   */
  static async validateRiskLimits(params: PlaceOrderInput): Promise<void> {
    const db = await getDatabase();

    // 1. Verify Instrument
    const instRes = await db.query(
      `SELECT instrument_id, symbol, is_active, min_price, max_price, reference_price, tick_size
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

    // Price checks for Limit orders
    if (params.orderType !== 'MARKET') {
      if (params.price < parseFloat(inst.min_price) || params.price > parseFloat(inst.max_price)) {
        throw new Error(
          `Price ${params.price} is outside allowed instrument range [${inst.min_price}, ${inst.max_price}]`
        );
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
    const effectivePrice = params.orderType === 'MARKET' ? refPrice : params.price;
    const notional = effectivePrice * params.quantity;

    if (acc.max_order_qty && params.quantity > parseInt(acc.max_order_qty, 10)) {
      throw new Error(`Order quantity ${params.quantity} exceeds account maximum order quantity limit of ${acc.max_order_qty}`);
    }

    if (acc.max_order_notional && notional > parseFloat(acc.max_order_notional)) {
      throw new Error(`Order notional value ${notional.toFixed(2)} exceeds account max notional limit of ${acc.max_order_notional}`);
    }

    // Price Collar Check
    if (params.orderType !== 'MARKET' && acc.price_collar_pct) {
      const collarPct = parseFloat(acc.price_collar_pct);
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

    // Cash check for BUY orders
    if (params.side === 'BUY') {
      const cash = parseFloat(acc.cash_balance);
      if (cash < notional) {
        throw new Error(`Insufficient cash balance (${cash.toFixed(2)}) for order notional of ${notional.toFixed(2)}`);
      }
    }
  }

  /**
   * Submit and Match Order (Atomic Transaction with Row-Level Locking)
   */
  static async submitOrder(input: PlaceOrderInput): Promise<{ order: Order; trades: Trade[] }> {
    await this.validateRiskLimits(input);

    const db = await getDatabase();
    await db.query('BEGIN');

    try {
      // Generate Order ID & Client Order ID
      const oidRes = await db.query('SELECT COALESCE(MAX(order_id), 5000) + 1 AS next_id FROM orders');
      const orderId = parseInt(oidRes.rows[0].next_id, 10);
      const clientOrderId = randomUUID();
      const tif = input.timeInForce || (input.orderType === 'IOC' ? 'IOC' : 'DAY');

      // Insert Order as OPEN
      const orderRes = await db.query<Order>(
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

      let activeOrder = orderRes.rows[0];
      const trades: Trade[] = [];

      // Order Matching Engine Logic
      // If incoming order is BUY, match against resting SELL orders (ordered by lowest price first, then oldest submitted_at)
      // If incoming order is SELL, match against resting BUY orders (ordered by highest price first, then oldest submitted_at)
      const oppositeSide: OrderSide = input.side === 'BUY' ? 'SELL' : 'BUY';
      const priceCondition = input.orderType === 'MARKET' ? '' :
        (input.side === 'BUY' ? 'AND price <= $3' : 'AND price >= $3');

      const sortOrder = input.side === 'BUY' ? 'ASC' : 'DESC';

      // Row-level lock (FOR UPDATE) prevents concurrent double-matching of leaves_qty
      const candidateSql = `
        SELECT order_id, account_id, price, quantity, filled_qty, (quantity - filled_qty) AS leaves_qty
        FROM orders
        WHERE instrument_id = $1 AND side = $2 AND status IN ('OPEN', 'PARTIALLY_FILLED') AND account_id <> $4
        ${priceCondition}
        ORDER BY price ${sortOrder}, submitted_at ASC
        FOR UPDATE
      `;

      const candidateParams = input.orderType === 'MARKET'
        ? [input.instrumentId, oppositeSide, input.accountId]
        : [input.instrumentId, oppositeSide, input.price, input.accountId];

      const candidates = await db.query(candidateSql, candidateParams);

      let remainingQty = activeOrder.quantity;

      for (const resting of candidates.rows) {
        if (remainingQty <= 0) break;

        const restingLeaves = parseInt(resting.leaves_qty, 10);
        const matchQty = Math.min(remainingQty, restingLeaves);
        const matchPrice = parseFloat(resting.price); // Passive resting order price

        // Generate Trade
        const tidRes = await db.query('SELECT COALESCE(MAX(trade_id), 9000) + 1 AS next_tid FROM trades');
        const seqRes = await db.query('SELECT COALESCE(MAX(engine_seq), 700000) + 1 AS next_seq FROM trades');
        const nextTradeId = parseInt(tidRes.rows[0].next_tid, 10);
        const nextSeq = parseInt(seqRes.rows[0].next_seq, 10);

        const buyOrderId = input.side === 'BUY' ? activeOrder.order_id : resting.order_id;
        const sellOrderId = input.side === 'SELL' ? activeOrder.order_id : resting.order_id;
        const buyerAccountId = input.side === 'BUY' ? activeOrder.account_id : resting.account_id;
        const sellerAccountId = input.side === 'SELL' ? activeOrder.account_id : resting.account_id;

        const tradeRes = await db.query<Trade>(
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

        // Generate Fills (1 Buyer Fill and 1 Seller Fill)
        const fidRes = await db.query('SELECT COALESCE(MAX(fill_id), 9100) + 1 AS next_fid FROM fills');
        const fillId1 = parseInt(fidRes.rows[0].next_fid, 10);
        const fillId2 = fillId1 + 1;

        // Buyer Fill
        await db.query(
          `INSERT INTO fills (fill_id, trade_id, order_id, account_id, instrument_id, side, price, quantity, cash_delta, realized_pnl, executed_at)
           VALUES ($1, $2, $3, $4, $5, 'BUY', $6, $7, $8, 0, NOW())`,
          [fillId1, trade.trade_id, buyOrderId, buyerAccountId, input.instrumentId, matchPrice, matchQty, -(matchPrice * matchQty)]
        );

        // Seller Fill
        await db.query(
          `INSERT INTO fills (fill_id, trade_id, order_id, account_id, instrument_id, side, price, quantity, cash_delta, realized_pnl, executed_at)
           VALUES ($1, $2, $3, $4, $5, 'SELL', $6, $7, $8, 0, NOW())`,
          [fillId2, trade.trade_id, sellOrderId, sellerAccountId, input.instrumentId, matchPrice, matchQty, (matchPrice * matchQty)]
        );

        // Update resting order
        const newRestingFilled = parseInt(resting.filled_qty, 10) + matchQty;
        const newRestingStatus = newRestingFilled >= parseInt(resting.quantity, 10) ? 'FILLED' : 'PARTIALLY_FILLED';
        await db.query(
          `UPDATE orders SET filled_qty = $1, status = $2, updated_at = NOW() WHERE order_id = $3`,
          [newRestingFilled, newRestingStatus, resting.order_id]
        );

        remainingQty -= matchQty;
      }

      // Finalize incoming active order status
      const totalFilled = activeOrder.quantity - remainingQty;
      let finalStatus = activeOrder.status;

      if (totalFilled === activeOrder.quantity) {
        finalStatus = 'FILLED';
      } else if (totalFilled > 0) {
        finalStatus = (input.orderType === 'IOC' || input.orderType === 'MARKET') ? 'CANCELLED' : 'PARTIALLY_FILLED';
      } else {
        finalStatus = (input.orderType === 'IOC' || input.orderType === 'MARKET') ? 'CANCELLED' : 'OPEN';
      }

      const updatedActiveRes = await db.query<Order>(
        `UPDATE orders SET filled_qty = $1, status = $2, updated_at = NOW() WHERE order_id = $3 RETURNING *`,
        [totalFilled, finalStatus, activeOrder.order_id]
      );

      activeOrder = updatedActiveRes.rows[0];

      await db.query('COMMIT');

      // Asynchronous Real-Time Market Broadcasts
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

      return { order: activeOrder, trades };
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }

  /**
   * Cancel Order (Atomic Transaction)
   */
  static async cancelOrder(orderId: number, accountId: number): Promise<Order> {
    const db = await getDatabase();
    await db.query('BEGIN');

    try {
      const orderRes = await db.query<Order>(
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

      const updated = await db.query<Order>(
        `UPDATE orders SET status = 'CANCELLED', cancel_requested_at = NOW(), updated_at = NOW()
         WHERE order_id = $1 RETURNING *`,
        [orderId]
      );

      await db.query('COMMIT');

      // Real-time Order Book depth update after cancellation
      try {
        const snapshot = await this.getOrderBookSnapshot(order.instrument_id, 10);
        broadcastMarketData({
          type: 'BOOK_UPDATE',
          data: { instrumentId: order.instrument_id, snapshot },
          timestamp: new Date().toISOString()
        });
      } catch (wsErr) {
        console.warn('[WS_BROADCAST] Cancel market broadcast error:', wsErr);
      }

      return updated.rows[0];
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
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
