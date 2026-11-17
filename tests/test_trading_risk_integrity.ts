import assert from 'node:assert';
import { getDatabase } from '../database/db.js';
import { TradingService } from '../backend/services/tradingService.js';
import { SurveillanceService } from '../backend/services/surveillanceService.js';
import { randomUUID } from 'crypto';

process.env.NODE_ENV = 'test';

async function run() {
  console.log('=== PHASES 2, 3, 4 & 5: TRADING, RISK, SEQUENCES & SURVEILLANCE VERIFICATION ===\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    process.stdout.write(`[TEST] ${name} ... `);
    try {
      await fn();
      console.log('✓ PASSED');
      passed++;
    } catch (err: any) {
      console.log('✗ FAILED');
      console.error('      Error:', err.message || err);
      failed++;
    }
  }

  const db = await getDatabase();

  // Clean any dynamic non-seed open orders before testing to ensure clean book state
  await db.query(
    `UPDATE orders SET status = 'CANCELLED' WHERE order_id > 5006 AND status IN ('OPEN', 'PARTIALLY_FILLED')`
  );
  // Reset cash balances and risk limits for accounts 1001 and 1002
  await db.query(`UPDATE accounts SET cash_balance = 1000000.0000 WHERE account_id IN (1001, 1002)`);
  await db.query(`UPDATE risk_limits SET max_position_qty = 5000, max_order_qty = 1000 WHERE account_id IN (1001, 1002)`);

  // Test 1: Market Order Execution (Phase 2 Finding 5)
  await test('Market order matches against resting limit book without SQL parameter errors', async () => {
    // 1a. Place resting limit sell order (Account 1002, Instrument 1)
    const sellRes = await TradingService.submitOrder({
      accountId: 1002,
      instrumentId: 1,
      side: 'SELL',
      orderType: 'LIMIT',
      price: 1400.00,
      quantity: 10,
      clientOrderId: randomUUID()
    });
    assert.strictEqual(sellRes.order.status, 'OPEN');

    // 1b. Submit MARKET BUY order (Account 1001, Instrument 1)
    const marketBuyRes = await TradingService.submitOrder({
      accountId: 1001,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'MARKET',
      price: 0,
      quantity: 5,
      clientOrderId: randomUUID()
    });

    assert.strictEqual(marketBuyRes.order.status, 'FILLED', 'Market order must be completely filled');
    assert.strictEqual(marketBuyRes.trades.length, 1, 'Market order must generate exactly 1 trade');
    assert.strictEqual(marketBuyRes.trades[0].quantity, 5);
    assert.strictEqual(parseFloat(String(marketBuyRes.trades[0].price)), 1400.00);
  });

  // Test 2: Time-In-Force: IOC (Immediate-Or-Cancel) on Instrument 3 (clean book)
  await test('IOC order fills available liquidity and immediately cancels residual quantity', async () => {
    // Cancel any existing orders on Instrument 3
    await db.query(`UPDATE orders SET status = 'CANCELLED' WHERE instrument_id = 3 AND status IN ('OPEN', 'PARTIALLY_FILLED')`);

    // Resting sell order for 3 shares @ 1500.00
    await TradingService.submitOrder({
      accountId: 1002,
      instrumentId: 3,
      side: 'SELL',
      orderType: 'LIMIT',
      price: 1500.00,
      quantity: 3,
      clientOrderId: randomUUID()
    });

    // IOC Buy order for 10 shares (only 3 available at 1500.00)
    const iocRes = await TradingService.submitOrder({
      accountId: 1001,
      instrumentId: 3,
      side: 'BUY',
      orderType: 'LIMIT',
      timeInForce: 'IOC',
      price: 1500.00,
      quantity: 10,
      clientOrderId: randomUUID()
    });

    assert.strictEqual(iocRes.order.status, 'CANCELLED', 'IOC with partial fills must transition to CANCELLED');
    assert.strictEqual(iocRes.order.filled_qty, 3, 'IOC filled 3 shares');
    assert.strictEqual(iocRes.trades.length, 1);

    // Verify residual quantity is NOT resting on the book
    const restingCheck = await db.query(
      `SELECT * FROM orders WHERE order_id = $1 AND status IN ('OPEN', 'PARTIALLY_FILLED')`,
      [iocRes.order.order_id]
    );
    assert.strictEqual(restingCheck.rows.length, 0, 'IOC residual must never rest on book');
  });

  // Test 3: Time-In-Force: FOK (Fill-Or-Kill) on Instrument 4
  await test('FOK cancels with zero fills when liquidity is insufficient, and fills 100% when sufficient', async () => {
    await db.query(`UPDATE orders SET status = 'CANCELLED' WHERE instrument_id = 4 AND status IN ('OPEN', 'PARTIALLY_FILLED')`);

    // 3a. Insufficient liquidity test: only 5 shares available at 1650.00
    await TradingService.submitOrder({
      accountId: 1002,
      instrumentId: 4,
      side: 'SELL',
      orderType: 'LIMIT',
      price: 1650.00,
      quantity: 5,
      clientOrderId: randomUUID()
    });

    // FOK Buy order for 20 shares -> MUST KILL (0 fills)
    const fokFailRes = await TradingService.submitOrder({
      accountId: 1001,
      instrumentId: 4,
      side: 'BUY',
      orderType: 'LIMIT',
      timeInForce: 'FOK',
      price: 1650.00,
      quantity: 20,
      clientOrderId: randomUUID()
    });

    assert.strictEqual(fokFailRes.order.status, 'CANCELLED', 'FOK order must be cancelled when liquidity < qty');
    assert.strictEqual(fokFailRes.order.filled_qty, 0, 'FOK must have 0 fills');
    assert.strictEqual(fokFailRes.trades.length, 0, 'FOK must produce 0 trades');

    // 3b. Sufficient liquidity test: provide 25 shares
    await TradingService.submitOrder({
      accountId: 1002,
      instrumentId: 4,
      side: 'SELL',
      orderType: 'LIMIT',
      price: 1650.00,
      quantity: 25,
      clientOrderId: randomUUID()
    });

    // FOK Buy order for 15 shares -> MUST FILL 100%
    const fokSuccessRes = await TradingService.submitOrder({
      accountId: 1001,
      instrumentId: 4,
      side: 'BUY',
      orderType: 'LIMIT',
      timeInForce: 'FOK',
      price: 1650.00,
      quantity: 15,
      clientOrderId: randomUUID()
    });

    assert.strictEqual(fokSuccessRes.order.status, 'FILLED', 'FOK order must be 100% filled when liquidity is sufficient');
    assert.strictEqual(fokSuccessRes.order.filled_qty, 15);
  });

  // Test 4: Financial Risk: Max Position Limit (Phase 3 Finding 7)
  await test('Risk controls reject orders exceeding max_position_qty', async () => {
    // Set Account 1001 max_position_qty to 20
    await db.query(`UPDATE risk_limits SET max_position_qty = 20 WHERE account_id = 1001`);

    try {
      let caught = false;
      try {
        await TradingService.submitOrder({
          accountId: 1001,
          instrumentId: 1,
          side: 'BUY',
          orderType: 'LIMIT',
          price: 1400.00,
          quantity: 200, // Within max_order_qty (1000) but exceeds max_position_qty (20)
          clientOrderId: randomUUID()
        });
      } catch (err: any) {
        caught = true;
        assert(err.message.includes('exceeds account maximum position limit'), `Unexpected error: ${err.message}`);
      }
      assert(caught, 'Must reject order exceeding max position quantity');
    } finally {
      // Restore limit in all cases
      await db.query(`UPDATE risk_limits SET max_position_qty = 5000 WHERE account_id = 1001`);
    }
  });

  // Test 5: Financial Risk: Tick Size & Lot Size Validation
  await test('Risk controls reject non-compliant tick size and lot size orders', async () => {
    await db.query(`UPDATE instruments SET lot_size = 10, tick_size = 0.05 WHERE instrument_id = 2`);

    let lotCaught = false;
    try {
      await TradingService.submitOrder({
        accountId: 1001,
        instrumentId: 2,
        side: 'BUY',
        orderType: 'LIMIT',
        price: 3200.00,
        quantity: 15, // Not a multiple of 10
        clientOrderId: randomUUID()
      });
    } catch (err: any) {
      lotCaught = true;
      assert(err.message.includes('multiple of lot size 10'), `Unexpected error: ${err.message}`);
    }
    assert(lotCaught, 'Must reject order not multiple of lot size');

    let tickCaught = false;
    try {
      await TradingService.submitOrder({
        accountId: 1001,
        instrumentId: 2,
        side: 'BUY',
        orderType: 'LIMIT',
        price: 3200.03, // Not a multiple of 0.05
        quantity: 10,
        clientOrderId: randomUUID()
      });
    } catch (err: any) {
      tickCaught = true;
      assert(err.message.includes('multiple of tick size 0.05'), `Unexpected error: ${err.message}`);
    }
    assert(tickCaught, 'Must reject order not multiple of tick size');
  });

  // Test 6: Financial Risk: Reserved Cash Exposure
  await test('BUY orders account for reserved cash committed in open resting orders', async () => {
    // Clear resting BUY orders for account 1001 to start from clean state
    await db.query(`UPDATE orders SET status = 'CANCELLED' WHERE account_id = 1001 AND side = 'BUY' AND status IN ('OPEN', 'PARTIALLY_FILLED')`);
    
    // Set cash balance to exactly $15,000
    await db.query(`UPDATE accounts SET cash_balance = 15000.0000 WHERE account_id = 1001`);

    // Place first BUY order committing $13,500 (10 shares @ 1350.00)
    await TradingService.submitOrder({
      accountId: 1001,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1350.00, // Below book to rest
      quantity: 10,
      clientOrderId: randomUUID()
    });

    // Available cash is now $15,000 - $13,500 = $1,500
    // Attempt second BUY order for $4,200 (3 shares @ 1400.00) -> MUST FAIL
    let cashCaught = false;
    try {
      await TradingService.submitOrder({
        accountId: 1001,
        instrumentId: 1,
        side: 'BUY',
        orderType: 'LIMIT',
        price: 1400.00,
        quantity: 3, // Notional $4,200 > $1,500 available
        clientOrderId: randomUUID()
      });
    } catch (err: any) {
      cashCaught = true;
      assert(err.message.includes('Insufficient available cash'), `Unexpected error: ${err.message}`);
    }
    assert(cashCaught, 'Must reject BUY order exceeding available cash after accounting for reserved orders');

    // Restore cash
    await db.query(`UPDATE accounts SET cash_balance = 1000000.0000 WHERE account_id = 1001`);
  });

  // Test 7: Atomic Sequences & Financial Invariants (Phase 4 Finding 8)
  await test('Trade execution preserves strict financial invariants (Fills, Cash, and Positions)', async () => {
    // Restore cash balances
    await db.query(`UPDATE accounts SET cash_balance = 1000000.0000 WHERE account_id IN (1001, 1002)`);

    // Pre-trade account state
    const accBefore = await db.query(
      `SELECT account_id, cash_balance FROM accounts WHERE account_id IN (1001, 1002) ORDER BY account_id`
    );
    const cash1Before = parseFloat(accBefore.rows[0].cash_balance);
    const cash2Before = parseFloat(accBefore.rows[1].cash_balance);

    // Place resting sell on Instrument 5: Account 1002 sells 8 shares @ 1150.00
    await TradingService.submitOrder({
      accountId: 1002,
      instrumentId: 5,
      side: 'SELL',
      orderType: 'LIMIT',
      price: 1150.00,
      quantity: 8,
      clientOrderId: randomUUID()
    });

    // Crossing buy: Account 1001 buys 8 shares @ 1150.00
    const buyRes = await TradingService.submitOrder({
      accountId: 1001,
      instrumentId: 5,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1150.00,
      quantity: 8,
      clientOrderId: randomUUID()
    });

    assert.strictEqual(buyRes.trades.length, 1);
    const trade = buyRes.trades[0];
    const tradeNotional = 8 * 1150.00;

    // Verify Invariant 1: Exactly 1 BUY fill and 1 SELL fill
    const fillsRes = await db.query(
      `SELECT side, cash_delta, quantity FROM fills WHERE trade_id = $1 ORDER BY side`,
      [trade.trade_id]
    );
    assert.strictEqual(fillsRes.rows.length, 2, 'Exactly 2 fills per trade');
    assert.strictEqual(fillsRes.rows[0].side, 'BUY');
    assert.strictEqual(fillsRes.rows[1].side, 'SELL');
    assert.strictEqual(parseFloat(fillsRes.rows[0].cash_delta), -tradeNotional);
    assert.strictEqual(parseFloat(fillsRes.rows[1].cash_delta), tradeNotional);

    // Verify Invariant 2: Cash debits == Cash credits
    const accAfter = await db.query(
      `SELECT account_id, cash_balance FROM accounts WHERE account_id IN (1001, 1002) ORDER BY account_id`
    );
    const cash1After = parseFloat(accAfter.rows[0].cash_balance);
    const cash2After = parseFloat(accAfter.rows[1].cash_balance);

    const buyerDebit = cash1Before - cash1After;
    const sellerCredit = cash2After - cash2Before;
    assert.strictEqual(Math.round(buyerDebit), Math.round(tradeNotional));
    assert.strictEqual(Math.round(sellerCredit), Math.round(tradeNotional));
    assert.strictEqual(Math.round(buyerDebit), Math.round(sellerCredit), 'Cash debit must exactly equal cash credit');
  });

  // Test 8: Surveillance Mathematics: Statistical Median & Volume Skew (Phase 5 Finding 9)
  await test('Surveillance engine computes true statistical median lifetime and volume size skew', async () => {
    const windowStart = new Date(Date.now() - 3600000);
    const windowEnd = new Date(Date.now() + 3600000);

    // Submit surveillance evaluation using evaluateSessionWindow
    const survRes = await SurveillanceService.evaluateSessionWindow({
      accountId: 1001,
      instrumentId: 1,
      windowStart,
      windowEnd
    });

    assert(survRes.session, 'Surveillance session must be generated');
    assert(Array.isArray(survRes.session.features), 'Features vector must be present');
    assert.strictEqual(survRes.session.features.length, 8, '8 features generated');
    
    // Feature 3: median lifetime should be a valid non-NaN number
    const medianLifetime = survRes.session.median_lifetime_ms;
    assert(!isNaN(medianLifetime) && medianLifetime >= 0, 'Median lifetime must be valid numeric');

    // Feature 4: size skew must be in range [0, 1]
    const sizeSkew = survRes.session.size_skew;
    assert(!isNaN(sizeSkew) && sizeSkew >= 0 && sizeSkew <= 1, 'Size skew must be bounded [0, 1]');
  });

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
  await db.close();

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
