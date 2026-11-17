import { AuthService } from '../backend/services/authService';
import { TradingService } from '../backend/services/tradingService';
import { SurveillanceService } from '../backend/services/surveillanceService';
import { getDatabase } from '../database/db';

async function runTests() {
  console.log('=== MERIDIAN END-TO-END INTEGRATION TEST SUITE ===\n');

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

  // Re-seed user password hashes for test predictability
  await db.query(
    `UPDATE users SET password_hash = '$2b$10$7QlrqW9o3nnVMyXBeI82WesAjib/ACpDAjyrykCtpMvZmDZFG.9DK', failed_logins = 0, locked_until = NULL`
  );

  // Test 1: User Registration
  let testUserId = 0;
  let testAccountId = 0;
  let traderToken = '';
  await test('User Registration & Automatic Account Provisioning', async () => {
    const email = `test_trader_${Date.now()}@meridian.internal`;
    const username = `trader_${Date.now()}`;
    const res = await AuthService.register({
      email,
      username,
      password: 'SecurePassword123!',
      role: 'TRADER'
    });

    if (!res.user.user_id || !res.token || !res.accountId) {
      throw new Error('Registration did not return user, token, and accountId');
    }
    testUserId = res.user.user_id;
    testAccountId = res.accountId;
    traderToken = res.token;

    // Verify account and risk limits exist in DB
    const acc = await db.query('SELECT * FROM accounts WHERE account_id = $1', [testAccountId]);
    if (acc.rows.length === 0) throw new Error('Account was not created in DB');

    const rl = await db.query('SELECT * FROM risk_limits WHERE account_id = $1', [testAccountId]);
    if (rl.rows.length === 0) throw new Error('Risk limits were not created in DB');
  });

  // Test 2: User Login & Session Invalidation Check
  await test('User Login & Session Invalidation Check', async () => {
    const loginRes = await AuthService.login({
      identifier: 'prasanna_trader',
      password: 'Password123!'
    });

    if (!loginRes.token || loginRes.user.role !== 'TRADER') {
      throw new Error('Login failed for seeded user');
    }

    const sessions = await db.query('SELECT * FROM sessions WHERE user_id = $1', [loginRes.user.user_id]);
    if (sessions.rows.length === 0) throw new Error('No session recorded in DB');
  });

  // Test 3: Pre-Trade Risk Limits Enforcement
  await test('Pre-Trade Risk Limit Enforcement (Exceeding max_order_qty)', async () => {
    let errorCaught = false;
    try {
      await TradingService.submitOrder({
        accountId: testAccountId,
        instrumentId: 1, // RELIANCE
        side: 'BUY',
        orderType: 'LIMIT',
        price: 1400.0,
        quantity: 50000 // Exceeds limit of 1000
      });
    } catch (e: any) {
      errorCaught = true;
      if (!e.message.includes('exceeds account maximum order quantity limit')) {
        throw new Error(`Unexpected error message: ${e.message}`);
      }
    }
    if (!errorCaught) throw new Error('Expected risk limit rejection but order succeeded');
  });

  // Test 4: Pre-Trade Price Collar Check
  await test('Pre-Trade Price Collar Rejection (Deviating > 5%)', async () => {
    let errorCaught = false;
    try {
      await TradingService.submitOrder({
        accountId: testAccountId,
        instrumentId: 1, // RELIANCE (Ref price 1400)
        side: 'BUY',
        orderType: 'LIMIT',
        price: 1600.0, // > 14% deviation
        quantity: 10
      });
    } catch (e: any) {
      errorCaught = true;
      if (!e.message.includes('exceeding the 5% price collar')) {
        throw new Error(`Unexpected error message: ${e.message}`);
      }
    }
    if (!errorCaught) throw new Error('Expected price collar rejection but order succeeded');
  });

  // Test 5: Order Submission, Matching & Side-Specific Fills
  let tradeExecutedId = 0;
  await test('Order Matching & Side-Specific Fill Generation (1 BUY & 1 SELL)', async () => {
    // 1. Trader A (Account 1001) places Resting Sell Limit: 50 @ 1400.00
    const sellOrder = await TradingService.submitOrder({
      accountId: 1001,
      instrumentId: 1,
      side: 'SELL',
      orderType: 'LIMIT',
      price: 1400.0,
      quantity: 50
    });

    // 2. Trader B (testAccountId) places Aggressive Buy Limit: 50 @ 1400.00
    const buyOrder = await TradingService.submitOrder({
      accountId: testAccountId,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1400.0,
      quantity: 50
    });

    if (buyOrder.trades.length === 0) {
      throw new Error('Expected trade execution on matching prices');
    }

    const trade = buyOrder.trades[0];
    tradeExecutedId = trade.trade_id;

    if (parseInt(trade.quantity as any, 10) !== 50 || parseFloat(trade.price as any) !== 1400.0) {
      throw new Error(`Trade executed with wrong parameters: qty ${trade.quantity}, price ${trade.price}`);
    }

    // Verify exactly two fills exist for this trade
    const fills = await db.query('SELECT * FROM fills WHERE trade_id = $1 ORDER BY side ASC', [trade.trade_id]);
    if (fills.rows.length !== 2) {
      throw new Error(`Expected exactly 2 fills, got ${fills.rows.length}`);
    }

    const buyFill = fills.rows.find(f => f.side === 'BUY');
    const sellFill = fills.rows.find(f => f.side === 'SELL');

    if (!buyFill || !sellFill) {
      throw new Error('Missing either BUY or SELL fill');
    }

    if (parseFloat(buyFill.cash_delta) >= 0 || parseFloat(sellFill.cash_delta) <= 0) {
      throw new Error('Cash deltas must be negative for buyer and positive for seller');
    }
  });

  // Test 6: Trigger Verification (Position & Balance Recalculation)
  await test('Database Trigger Verification (Position Update on Fill)', async () => {
    const pos = await db.query(
      'SELECT * FROM positions WHERE account_id = $1 AND instrument_id = 1',
      [testAccountId]
    );

    if (pos.rows.length === 0) {
      throw new Error('Position row was not generated for buyer');
    }

    if (parseInt(pos.rows[0].net_qty, 10) !== 50) {
      throw new Error(`Expected position net_qty = 50, got ${pos.rows[0].net_qty}`);
    }
  });

  // Test 7: Order Placement and Order Cancellation
  await test('Order Placement and Order Cancellation', async () => {
    const orderRes = await TradingService.submitOrder({
      accountId: testAccountId,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1395.0, // Non-crossing
      quantity: 10
    });

    if (orderRes.order.status !== 'OPEN') {
      throw new Error(`Expected OPEN status, got ${orderRes.order.status}`);
    }

    const cancelled = await TradingService.cancelOrder(orderRes.order.order_id, testAccountId);
    if (cancelled.status !== 'CANCELLED') {
      throw new Error(`Expected CANCELLED status, got ${cancelled.status}`);
    }
  });

  // Test 8: Surveillance Metric Aggregation & Cosine Similarity Pattern Matching
  let generatedAlertId = 0;
  await test('Surveillance Evaluation & Cosine Vector Pattern Matching', async () => {
    // Generate abusive order pattern: 6 rapid placements and cancellations
    for (let i = 0; i < 6; i++) {
      const o = await TradingService.submitOrder({
        accountId: testAccountId,
        instrumentId: 1,
        side: 'BUY',
        orderType: 'LIMIT',
        price: 1390.0,
        quantity: 15
      });
      await TradingService.cancelOrder(o.order.order_id, testAccountId);
    }

    const evalResult = await SurveillanceService.evaluateSessionWindow({
      accountId: testAccountId,
      instrumentId: 1
    });

    if (!evalResult.session) throw new Error('Surveillance session not created');
    if (!evalResult.matchedPattern) throw new Error('No pattern matched');

    if (evalResult.session.order_cancel_ratio < 0.5) {
      throw new Error(`Expected high cancel ratio, got ${evalResult.session.order_cancel_ratio}`);
    }

    if (evalResult.alert) {
      generatedAlertId = evalResult.alert.alert_id;
    }
  });

  // Test 9: Alert Triage & Full-Text Search on Notes
  await test('Alert Investigation Workflow & Full-Text Search (tsvector)', async () => {
    const alertId = generatedAlertId || 8001;

    // Assign to analyst
    const assigned = await SurveillanceService.assignAlert(alertId, 102);
    if (assigned.status !== 'IN_REVIEW' || assigned.assigned_to !== 102) {
      throw new Error('Alert was not assigned properly');
    }

    // Add note
    const noteText = 'Analyst audit confirms algorithmic rapid cancellation spoofing probe on instrument RELIANCE.';
    const note = await SurveillanceService.addNote(alertId, 102, noteText);
    if (!note.note_id) throw new Error('Note was not inserted');

    // Full-Text Search for "spoofing"
    const searchResults = await SurveillanceService.searchNotes('spoofing');
    if (searchResults.length === 0) {
      throw new Error('Full-text search for "spoofing" returned 0 results');
    }
  });

  console.log(`\n================================================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`================================================================\n`);

  await db.close();
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('[FATAL] Test runner crashed:', err);
  process.exit(1);
});
