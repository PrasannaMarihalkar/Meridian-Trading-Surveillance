import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import assert from 'assert';
import { getDatabase, closeDatabase } from '../database/db';
import { TradingService, PlaceOrderInput } from '../backend/services/tradingService';

interface WorkerResponse {
  id: string;
  action?: string;
  success: boolean;
  result?: any;
  error?: string;
  statusCode?: number;
  pid?: number;
}

class ChildWorkerClient {
  private child: ChildProcess;
  private pending = new Map<string, (res: WorkerResponse) => void>();

  constructor(child: ChildProcess) {
    this.child = child;
    this.child.on('message', (msg: WorkerResponse) => {
      if (msg.id && this.pending.has(msg.id)) {
        const resolve = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        resolve(msg);
      }
    });
  }

  static async spawn(): Promise<ChildWorkerClient> {
    const workerPath = path.join(__dirname, 'concurrency_worker.ts');
    const child = fork(workerPath, [], {
      execArgv: process.execArgv.filter(a => a !== '--eval'),
      env: { ...process.env }
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Child worker timed out starting')), 10000);
      const onMsg = (msg: any) => {
        if (msg.action === 'READY') {
          clearTimeout(timer);
          child.removeListener('message', onMsg);
          resolve();
        }
      };
      child.on('message', onMsg);
      child.on('error', reject);
    });

    return new ChildWorkerClient(child);
  }

  send(action: 'SUBMIT_ORDER' | 'CANCEL_ORDER' | 'PING' | 'EXIT', payload: any = {}): Promise<WorkerResponse> {
    const id = randomUUID();
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.child.send({ id, action, ...payload });
    });
  }

  async terminate(): Promise<void> {
    try {
      await this.send('EXIT');
    } catch {}
    this.child.kill();
  }
}

async function runCrossProcessConcurrencyVerification() {
  console.log('=== MERIDIAN CROSS-PROCESS CONCURRENCY & ISOLATION VERIFICATION ===\n');

  const db = await getDatabase();
  console.log(`[DB] Engine mode: ${db.isPGlite ? 'Embedded PGlite' : 'Native PostgreSQL (pg.Pool)'}`);

  if (db.isPGlite) {
    console.log('[INFO] PGlite is a single-process embedded WebAssembly engine.');
    console.log('[INFO] Cross-process testing requires shared multi-process Native PostgreSQL.');
    console.log('[INFO] Skipping multi-process fork test under PGlite (verified under Native PostgreSQL CI).\n');
    await db.close();
    return;
  }

  console.log('[SETUP] Initializing accounts and market for cross-process concurrency test...');
  const buyerAccA = 8001;
  const buyerAccB = 8002;
  const sellerAccC = 8003;

  // Insert test users
  await db.query(
    `INSERT INTO users (user_id, username, email, password_hash, role)
     VALUES (801, 'xp_buyer_a', 'buyera@xp.test', 'hash', 'TRADER'),
            (802, 'xp_buyer_b', 'buyerb@xp.test', 'hash', 'TRADER'),
            (803, 'xp_seller_c', 'sellerc@xp.test', 'hash', 'TRADER')
     ON CONFLICT (user_id) DO NOTHING`
  );

  // Helper to completely reset test accounts, open orders, trades, and positions between test cases
  async function resetTestState() {
    await db.query(`DELETE FROM fills WHERE account_id IN ($1, $2, $3)`, [buyerAccA, buyerAccB, sellerAccC]);
    await db.query(`DELETE FROM trades WHERE buyer_account_id IN ($1, $2, $3) OR seller_account_id IN ($1, $2, $3)`, [buyerAccA, buyerAccB, sellerAccC]);
    await db.query(`DELETE FROM orders WHERE account_id IN ($1, $2, $3)`, [buyerAccA, buyerAccB, sellerAccC]);
    await db.query(`DELETE FROM positions WHERE account_id IN ($1, $2, $3)`, [buyerAccA, buyerAccB, sellerAccC]);
    await db.query(`UPDATE accounts SET cash_balance = 50000.00 WHERE account_id IN ($1, $2, $3)`, [buyerAccA, buyerAccB, sellerAccC]);
  }

  // Clean existing data for these test accounts
  await resetTestState();

  // Insert test accounts
  await db.query(
    `INSERT INTO accounts (account_id, user_id, owner_role, cash_balance)
     VALUES ($1, 801, 'TRADER', 50000.00),
            ($2, 802, 'TRADER', 50000.00),
            ($3, 803, 'TRADER', 50000.00)
     ON CONFLICT (account_id) DO UPDATE SET cash_balance = EXCLUDED.cash_balance`,
    [buyerAccA, buyerAccB, sellerAccC]
  );

  // Generous risk limits
  await db.query(
    `INSERT INTO risk_limits (account_id, max_order_qty, max_order_notional, max_position_qty, max_open_orders, price_collar_pct)
     VALUES ($1, 500, 200000.00, 1000, 100, 10.0),
            ($2, 500, 200000.00, 1000, 100, 10.0),
            ($3, 500, 200000.00, 1000, 100, 10.0)
     ON CONFLICT (account_id) DO NOTHING`,
    [buyerAccA, buyerAccB, sellerAccC]
  );

  console.log('[SETUP] Spawning independent child worker process (Process B)...');
  const workerB = await ChildWorkerClient.spawn();
  console.log('  ✓ Child worker process spawned and initialized separate PostgreSQL connection pool.');

  let passed = 0;

  // TEST 1: Same-Instrument Matching Contention across Separate OS Processes
  console.log('\n[TEST 1] Same-Instrument Matching Contention (Process A vs Process B racing for resting liquidity)...');
  {
    // Seller places resting sell for 20 shares @ 1400.00
    const restingSell = await TradingService.submitOrder({
      accountId: sellerAccC,
      instrumentId: 1,
      side: 'SELL',
      orderType: 'LIMIT',
      price: 1400.00,
      quantity: 20,
      clientOrderId: randomUUID()
    });
    assert.strictEqual(restingSell.order.status, 'OPEN');

    // Process A and Process B simultaneously submit aggressive BUY orders for 20 shares each (40 total requested vs 20 available)
    const orderInputA: PlaceOrderInput = {
      accountId: buyerAccA,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1400.00,
      quantity: 20,
      clientOrderId: randomUUID()
    };
    const orderInputB: PlaceOrderInput = {
      accountId: buyerAccB,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1400.00,
      quantity: 20,
      clientOrderId: randomUUID()
    };

    const [resA, resB] = await Promise.all([
      TradingService.submitOrder(orderInputA),
      workerB.send('SUBMIT_ORDER', { input: orderInputB })
    ]);

    assert(resA.order, 'Process A order must succeed');
    assert(resB.success, `Process B order failed: ${resB.error}`);

    // Verify exactly 20 shares filled on resting sell order (zero overfills)
    const sellCheck = await db.query(`SELECT status, filled_qty, quantity FROM orders WHERE order_id = $1`, [restingSell.order.order_id]);
    assert.strictEqual(Number(sellCheck.rows[0].filled_qty), 20, 'Resting sell must have exactly 20 shares filled');
    assert.strictEqual(sellCheck.rows[0].status, 'FILLED');

    // Total fills across buyer A and buyer B must equal exactly 20 shares
    const tradesCheck = await db.query(
      `SELECT SUM(quantity)::INT AS total_filled FROM trades WHERE sell_order_id = $1`,
      [restingSell.order.order_id]
    );
    assert.strictEqual(tradesCheck.rows[0].total_filled, 20, 'Exactly 20 shares must be executed across trades');
    console.log('  ✓ Zero overfills: exactly 20 shares executed across competing processes.');
    passed++;
  }

  // TEST 2: Same-Account Cash Contention across Different Instruments
  console.log('\n[TEST 2] Same-Account Cash Contention across Different Instruments (Process A & B compete for account cash)...');
  await resetTestState();
  {
    // Set Buyer A cash to exactly 18,000.00
    await db.query(`UPDATE accounts SET cash_balance = 18000.00 WHERE account_id = $1`, [buyerAccA]);

    // Order 1 (Process A): Instrument 1, 10 shares @ 1400.00 = 14,000.00
    const order1: PlaceOrderInput = {
      accountId: buyerAccA,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1400.00,
      quantity: 10,
      clientOrderId: randomUUID()
    };
    // Order 2 (Process B): Instrument 2, 10 shares @ 1000.00 = 10,000.00
    // Combined notional = 24,000.00 > available cash 18,000.00
    const order2: PlaceOrderInput = {
      accountId: buyerAccA,
      instrumentId: 2,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1000.00,
      quantity: 10,
      clientOrderId: randomUUID()
    };

    const [resA, resB] = await Promise.allSettled([
      TradingService.submitOrder(order1),
      workerB.send('SUBMIT_ORDER', { input: order2 })
    ]);

    // Exactly one must succeed, and the other must be rejected for insufficient cash
    const succeededCount = (resA.status === 'fulfilled' ? 1 : 0) +
      (resB.status === 'fulfilled' && (resB.value as WorkerResponse).success ? 1 : 0);
    assert.strictEqual(succeededCount, 1, `Exactly one order must succeed under cash contention (got ${succeededCount})`);

    // Verify cash balance was not overspent
    const cashCheck = await db.query(`SELECT cash_balance FROM accounts WHERE account_id = $1`, [buyerAccA]);
    const finalCash = parseFloat(cashCheck.rows[0].cash_balance);
    assert(finalCash >= 0, `Cash balance became negative: ${finalCash}`);
    console.log(`  ✓ Zero overspending: Account lock serialized cross-instrument orders, final cash = ${finalCash}.`);
    passed++;
  }

  // TEST 3: Deterministic Cancellation vs Matching Race with PostgreSQL Synchronization Barrier
  console.log('\n[TEST 3] Deterministic Cancellation vs Matching Race with PostgreSQL Synchronization Barrier...');
  await resetTestState();
  {
    const restSell = await TradingService.submitOrder({
      accountId: sellerAccC,
      instrumentId: 1,
      side: 'SELL',
      orderType: 'LIMIT',
      price: 1425.00,
      quantity: 15,
      clientOrderId: randomUUID()
    });
    assert.strictEqual(restSell.order.status, 'OPEN');

    // Deterministic Synchronization Barrier:
    // To prove cancellation and matching can overlap without PostgreSQL 40P01 deadlock,
    // we acquire the Instrument Advisory Lock (Namespace 2, Instrument 1) on a dedicated coordinator connection.
    // Both matching and cancellation will start, acquire their respective account locks (Namespace 1),
    // and queue deterministically at the Instrument Advisory Lock gate.
    const coordinatorClient = await db.pool!.connect();
    await coordinatorClient.query('SELECT pg_advisory_lock(2, 1)');

    const matchInput: PlaceOrderInput = {
      accountId: buyerAccB,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1425.00,
      quantity: 15,
      clientOrderId: randomUUID()
    };

    let matchOutcome: { success: boolean; result?: any; error?: string } = { success: false };
    let cancelOutcome: WorkerResponse = { id: '', success: false };

    try {
      // Fire both operations concurrently from separate processes
      const matchPromise = TradingService.submitOrder(matchInput)
        .then(res => { matchOutcome = { success: true, result: res }; })
        .catch(err => { matchOutcome = { success: false, error: err.message || String(err) }; });

      const cancelPromise = workerB.send('CANCEL_ORDER', { orderId: restSell.order.order_id, accountId: sellerAccC })
        .then(res => { cancelOutcome = res; })
        .catch(err => { cancelOutcome = { id: '', success: false, error: err.message || String(err) }; });

      // Wait for BOTH transactions to reach the synchronization barrier (confirmed via pg_locks)
      let barrierReached = false;
      const startWait = Date.now();
      while (!barrierReached && Date.now() - startWait < 10000) {
        const lockRes = await db.query(
          `SELECT count(*)::INT AS waiting_count
           FROM pg_locks
           WHERE locktype = 'advisory' AND classid = 2 AND objid = 1 AND NOT granted`
        );
        if (lockRes.rows[0].waiting_count >= 2) {
          barrierReached = true;
          break;
        }
        await new Promise(r => setTimeout(r, 20));
      }
      assert(barrierReached, 'Both matching and cancellation transactions must reach the synchronization barrier');
      console.log('  ✓ Synchronization barrier reached: exactly 2 concurrent transactions queued at Instrument Advisory Lock gate.');

      // Release the barrier: allows PostgreSQL lock manager to arbitrate between the two transactions
      await coordinatorClient.query('SELECT pg_advisory_unlock(2, 1)');

      // Await both operations
      await Promise.all([matchPromise, cancelPromise]);
    } finally {
      await coordinatorClient.query('SELECT pg_advisory_unlock_all()').catch(() => {});
      coordinatorClient.release();
    }

    // 1. Assert NO PostgreSQL 40P01 deadlock occurred in either transaction
    if (matchOutcome.error) {
      assert(!matchOutcome.error.includes('40P01') && !matchOutcome.error.toLowerCase().includes('deadlock'),
        `Matching failed with deadlock: ${matchOutcome.error}`);
    }
    if (cancelOutcome.error) {
      assert(!cancelOutcome.error.includes('40P01') && !cancelOutcome.error.toLowerCase().includes('deadlock'),
        `Cancellation failed with deadlock: ${cancelOutcome.error}`);
    }

    // 2. Query final durable state from database
    const finalOrderCheck = await db.query(`SELECT status, filled_qty, quantity FROM orders WHERE order_id = $1`, [restSell.order.order_id]);
    const status = finalOrderCheck.rows[0].status;
    const filled = Number(finalOrderCheck.rows[0].filled_qty);
    const qty = Number(finalOrderCheck.rows[0].quantity);

    // 3. Assert exactly one valid final outcome (either 100% FILLED or 100% CANCELLED)
    assert(status === 'FILLED' || status === 'CANCELLED', `Invalid final state: ${status}`);

    if (status === 'FILLED') {
      // Matching won: order was 100% filled, cancellation must fail cleanly
      assert.strictEqual(filled, 15, 'Resting sell must have exactly 15 shares filled');
      assert.strictEqual(cancelOutcome.success, false, 'Cancellation must fail when order is already filled');
      assert(cancelOutcome.error?.includes('cannot be cancelled in state FILLED') || cancelOutcome.error?.includes('400'),
        `Expected rejection reason, got: ${cancelOutcome.error}`);

      // Verify trade execution volume
      const tradesRes = await db.query(`SELECT COALESCE(SUM(quantity), 0)::INT AS total_vol FROM trades WHERE sell_order_id = $1`, [restSell.order.order_id]);
      assert.strictEqual(tradesRes.rows[0].total_vol, 15, 'Total trades volume must equal exactly 15 shares');

      // Verify zero overfills
      assert(filled <= qty, `Overfill detected: filled ${filled} > total ${qty}`);
      console.log('  ✓ Outcome: Matching won the race — order 100% FILLED (15/15), cancel cleanly rejected, 0 deadlocks, 0 overfills.');
    } else {
      // Cancellation won: order was 100% cancelled, matching did not fill it
      assert.strictEqual(filled, 0, 'Cancelled order must have 0 fills');
      assert.strictEqual(cancelOutcome.success, true, 'Cancellation must succeed when executed before match');

      // Verify trade execution volume
      const tradesRes = await db.query(`SELECT COALESCE(SUM(quantity), 0)::INT AS total_vol FROM trades WHERE sell_order_id = $1`, [restSell.order.order_id]);
      assert.strictEqual(tradesRes.rows[0].total_vol, 0, 'No trades should execute against cancelled order');

      // Verify zero overfills and no orphan fills
      const fillsRes = await db.query(`SELECT count(*)::INT AS fill_count FROM fills WHERE order_id = $1`, [restSell.order.order_id]);
      assert.strictEqual(fillsRes.rows[0].fill_count, 0, 'No fills should exist for cancelled order');
      console.log('  ✓ Outcome: Cancellation won the race — order 100% CANCELLED (0/15), match cleanly rested, 0 deadlocks, 0 overfills.');
    }

    // 4. Assert no partial or orphan state
    const orphanFills = await db.query(
      `SELECT f.fill_id FROM fills f LEFT JOIN orders o ON o.order_id = f.order_id WHERE o.order_id IS NULL`
    );
    assert.strictEqual(orphanFills.rows.length, 0, 'Zero orphan fills permitted');
    passed++;
  }

  // TEST 4: Cross-Process Duplicate Idempotency Keys
  console.log('\n[TEST 4] Cross-Process Duplicate Idempotency Key Handling...');
  await resetTestState();
  {
    const sharedKey = randomUUID();
    const identicalInput: PlaceOrderInput = {
      accountId: buyerAccB,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1350.00,
      quantity: 5,
      clientOrderId: sharedKey
    };

    // Both processes submit the exact same clientOrderId concurrently
    const [resA, resB] = await Promise.all([
      TradingService.submitOrder(identicalInput),
      workerB.send('SUBMIT_ORDER', { input: identicalInput })
    ]);

    assert(resA.order, 'Process A must succeed');
    assert(resB.success, `Process B must succeed via idempotent return: ${resB.error}`);
    assert.strictEqual(resA.order.order_id, resB.result.order.order_id, 'Both processes must return the identical order');

    // Exactly 1 row in database
    const rowCheck = await db.query(`SELECT COUNT(*)::INT AS count FROM orders WHERE client_order_id = $1`, [sharedKey]);
    assert.strictEqual(rowCheck.rows[0].count, 1, 'Exactly one order must be persisted in database');

    // Cross-Account Idempotency Key Reuse Rejection (Process B tries to reuse sharedKey for a different account)
    const crossAccountInput: PlaceOrderInput = {
      accountId: buyerAccA, // Different account!
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1350.00,
      quantity: 5,
      clientOrderId: sharedKey
    };

    const crossRes = await workerB.send('SUBMIT_ORDER', { input: crossAccountInput });
    assert.strictEqual(crossRes.success, false, 'Cross-account reuse must fail');
    assert.strictEqual(crossRes.statusCode, 403, 'Cross-account reuse must return 403 Forbidden');
    console.log('  ✓ Idempotency cross-process safety verified: concurrent duplicates deduplicated, cross-account reuse rejected with 403.');
    passed++;
  }

  await workerB.terminate();
  await db.close();

  console.log(`\n=== RESULTS: ${passed}/4 CROSS-PROCESS CONCURRENCY TESTS PASSED ===\n`);
}

runCrossProcessConcurrencyVerification().catch((err) => {
  console.error('[FATAL] Cross-process concurrency verification failed:', err);
  process.exit(1);
});
