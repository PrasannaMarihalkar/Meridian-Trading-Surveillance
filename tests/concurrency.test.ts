import { getDatabase } from '../database/db';
import { TradingService } from '../backend/services/tradingService';
import { randomUUID } from 'crypto';

async function runConcurrencyStressTest() {
  console.log('=== MERIDIAN DATABASE CONCURRENCY & FINANCIAL PARITY TEST ===\n');
  const db = await getDatabase();

  console.log('[SETUP] Initializing accounts and market for concurrency test...');
  // Ensure clean test instrument and accounts
  const buyerAccId = 7001;
  const sellerAccId = 7002;

  // Insert test accounts if not existing
  await db.query(
    `INSERT INTO users (user_id, username, email, password_hash, role)
     VALUES (701, 'conc_buyer', 'buyer@conc.test', 'hash', 'TRADER'),
            (702, 'conc_seller', 'seller@conc.test', 'hash', 'TRADER')
     ON CONFLICT (user_id) DO NOTHING`
  );

  // Clean up existing test data for these accounts
  await db.query(
    `DELETE FROM fills WHERE trade_id IN (
       SELECT trade_id FROM trades WHERE buyer_account_id IN ($1, $2) OR seller_account_id IN ($1, $2)
     ) OR account_id IN ($1, $2)`,
    [buyerAccId, sellerAccId]
  );
  await db.query(`DELETE FROM trades WHERE buyer_account_id IN ($1, $2) OR seller_account_id IN ($1, $2)`, [buyerAccId, sellerAccId]);
  await db.query(`DELETE FROM orders WHERE account_id IN ($1, $2)`, [buyerAccId, sellerAccId]);
  await db.query(`DELETE FROM positions WHERE account_id IN ($1, $2)`, [buyerAccId, sellerAccId]);

  await db.query(
    `INSERT INTO accounts (account_id, user_id, owner_role, cash_balance)
     VALUES ($1, 701, 'TRADER', 200000.00),
            ($2, 702, 'TRADER', 100000.00)
     ON CONFLICT (account_id) DO UPDATE SET cash_balance = EXCLUDED.cash_balance`,
    [buyerAccId, sellerAccId]
  );

  // Set generous risk limits for test
  await db.query(
    `INSERT INTO risk_limits (account_id, max_order_qty, max_order_notional, max_position_qty, max_open_orders, price_collar_pct)
     VALUES ($1, 100, 300000.00, 500, 50, 10.0),
            ($2, 100, 300000.00, 500, 50, 10.0)
     ON CONFLICT (account_id) DO NOTHING`,
    [buyerAccId, sellerAccId]
  );

  console.log('[STEP 1] Placing passive resting SELL order for 50 shares @ 1400.00...');
  const passiveSell = await TradingService.submitOrder({
    accountId: sellerAccId,
    instrumentId: 1,
    side: 'SELL',
    orderType: 'LIMIT',
    price: 1400.0,
    quantity: 50,
    clientOrderId: randomUUID()
  });

  if (passiveSell.order.status !== 'OPEN') {
    throw new Error(`Expected resting sell order to be OPEN, got ${passiveSell.order.status}`);
  }
  console.log('  ✓ Resting sell order placed with 50 shares liquidity.');

  console.log('[STEP 2] Firing 10 concurrent async BUY orders (10 shares each = 100 requested vs 50 available)...');
  const numWorkers = 10;
  const orderPromises: Promise<unknown>[] = [];

  for (let i = 0; i < numWorkers; i++) {
    const p = TradingService.submitOrder({
      accountId: buyerAccId,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1400.0,
      quantity: 10,
      clientOrderId: randomUUID()
    });
    orderPromises.push(p);
  }

  const results = await Promise.allSettled(orderPromises);
  const succeeded = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');

  console.log(`  ✓ All ${numWorkers} concurrent requests resolved: ${succeeded.length} succeeded, ${rejected.length} rejected.`);

  console.log('\n[STEP 3] Verifying Row-Level Lock & Execution Parity Invariants...');

  // 1. Check resting sell order state
  const sellCheck = await db.query(
    `SELECT * FROM orders WHERE order_id = $1`,
    [passiveSell.order.order_id]
  );
  const finalSell = sellCheck.rows[0];
  console.log(`  Resting sell order: status = ${finalSell.status}, filled = ${finalSell.filled_qty} / ${finalSell.quantity}`);

  if (Number(finalSell.filled_qty) !== 50) {
    throw new Error(`CRITICAL INVARIANT VIOLATION: Resting order filled_qty was ${finalSell.filled_qty}, expected EXACTLY 50! (Overfill/Underfill defect)`);
  }
  if (finalSell.status !== 'FILLED') {
    throw new Error(`Expected resting sell order status FILLED, got ${finalSell.status}`);
  }
  console.log('  ✓ Zero overfills: exactly 50 shares matched out of 50 resting shares.');

  // 2. Check total trade volume generated against this resting order
  const tradesRes = await db.query(
    `SELECT SUM(quantity)::BIGINT AS total_traded_qty, COUNT(*)::INT AS trade_count
     FROM trades
     WHERE sell_order_id = $1`,
    [passiveSell.order.order_id]
  );
  const totalTradedQty = parseInt(tradesRes.rows[0].total_traded_qty, 10);
  const tradeCount = tradesRes.rows[0].trade_count;
  console.log(`  Trades matched: count = ${tradeCount}, total volume = ${totalTradedQty} shares`);

  if (totalTradedQty !== 50) {
    throw new Error(`Total trade volume was ${totalTradedQty}, expected exactly 50`);
  }
  console.log('  ✓ Total matched trade volume equals exactly 50 shares.');

  // 3. Verify side-specific fills constraint (exactly 1 BUY fill and 1 SELL fill per trade)
  const fillsRes = await db.query(
    `SELECT f.trade_id, COUNT(*)::INT AS fill_count,
            COUNT(CASE WHEN f.side = 'BUY' THEN 1 END)::INT AS buy_fills,
            COUNT(CASE WHEN f.side = 'SELL' THEN 1 END)::INT AS sell_fills
     FROM fills f
     JOIN trades t ON t.trade_id = f.trade_id
     WHERE t.sell_order_id = $1
     GROUP BY f.trade_id`,
    [passiveSell.order.order_id]
  );

  for (const row of fillsRes.rows) {
    if (row.fill_count !== 2 || row.buy_fills !== 1 || row.sell_fills !== 1) {
      throw new Error(`Trade ${row.trade_id} has invalid fills distribution: ${JSON.stringify(row)}`);
    }
  }
  console.log(`  ✓ Side-specific fills invariant verified across all ${fillsRes.rows.length} trades.`);

  // 4. Verify Double-Entry Accounting Invariant:
  // Buyer cash debited = $70,000. Seller cash credited = $70,000.
  const buyerAcc = (await db.query(`SELECT cash_balance FROM accounts WHERE account_id = $1`, [buyerAccId])).rows[0];
  const sellerAcc = (await db.query(`SELECT cash_balance FROM accounts WHERE account_id = $1`, [sellerAccId])).rows[0];

  const expectedBuyerCash = 200000.00 - (1400.0 * 50); // 130,000.00
  const expectedSellerCash = 100000.00 + (1400.0 * 50); // 170,000.00

  const actualBuyerCash = parseFloat(buyerAcc.cash_balance);
  const actualSellerCash = parseFloat(sellerAcc.cash_balance);

  console.log(`  Buyer Cash:  Initial = 200,000.00 | Actual = ${actualBuyerCash.toFixed(2)} | Expected = ${expectedBuyerCash.toFixed(2)}`);
  console.log(`  Seller Cash: Initial = 100,000.00 | Actual = ${actualSellerCash.toFixed(2)} | Expected = ${expectedSellerCash.toFixed(2)}`);

  if (Math.abs(actualBuyerCash - expectedBuyerCash) > 0.01) {
    throw new Error(`Buyer cash balance discrepancy: got ${actualBuyerCash}, expected ${expectedBuyerCash}`);
  }
  if (Math.abs(actualSellerCash - expectedSellerCash) > 0.01) {
    throw new Error(`Seller cash balance discrepancy: got ${actualSellerCash}, expected ${expectedSellerCash}`);
  }
  console.log('  ✓ Double-entry cash balance conservation verified (Total Debits == Total Credits).');

  // 5. Verify Positions Invariant:
  // Buyer net position = +50. Seller net position = -50.
  const buyerPos = (await db.query(`SELECT net_qty FROM positions WHERE account_id = $1 AND instrument_id = 1`, [buyerAccId])).rows[0];
  const sellerPos = (await db.query(`SELECT net_qty FROM positions WHERE account_id = $1 AND instrument_id = 1`, [sellerAccId])).rows[0];

  const actualBuyerQty = buyerPos ? parseInt(buyerPos.net_qty, 10) : 0;
  const actualSellerQty = sellerPos ? parseInt(sellerPos.net_qty, 10) : 0;

  console.log(`  Buyer Position:  ${actualBuyerQty} shares (Expected: +50)`);
  console.log(`  Seller Position: ${actualSellerQty} shares (Expected: -50)`);

  if (actualBuyerQty !== 50 || actualSellerQty !== -50) {
    throw new Error(`Position mismatch: buyer has ${actualBuyerQty}, seller has ${actualSellerQty}`);
  }
  console.log('  ✓ Net position settlement parity verified.');

  // Clean up any remaining open test orders to prevent book pollution in subsequent suites
  await db.query(`UPDATE orders SET status = 'CANCELLED' WHERE account_id IN ($1, $2) AND status IN ('OPEN', 'PARTIALLY_FILLED')`, [buyerAccId, sellerAccId]);

  console.log('\n=== ALL DATABASE CONCURRENCY AND FINANCIAL INVARIANTS VERIFIED ===\n');
  await db.close();
}

runConcurrencyStressTest().catch(err => {
  console.error('[FAIL] Concurrency stress test error:', err);
  process.exit(1);
});
