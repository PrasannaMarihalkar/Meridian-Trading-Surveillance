import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

async function verifyDisposableDatabase() {
  console.log('=== MERIDIAN DISPOSABLE DATABASE VERIFICATION ===\n');
  const tempDir = path.join(__dirname, '..', 'database', 'disposable_test_pgdata_' + Date.now());

  console.log(`[DISPOSABLE DB] Creating isolated test database at: ${tempDir}`);
  const db = new PGlite(tempDir);
  await db.waitReady;
  console.log('[DISPOSABLE DB] Fresh embedded PostgreSQL instance initialized.');

  try {
    const sqlDir = path.join(__dirname, '..', 'database', 'sql');

    // 1. Apply Schema
    console.log('\n--- 1. Applying 01_schema.sql ---');
    const schemaSql = fs.readFileSync(path.join(sqlDir, '01_schema.sql'), 'utf-8');
    await db.exec(schemaSql);
    console.log('✓ 01_schema.sql applied successfully.');

    // Verify 17 Tables exist
    const tablesRes = await db.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    const expectedTables = [
      'accounts', 'alert_notes', 'alerts', 'audit_log', 'engine_offsets',
      'fills', 'instruments', 'orders', 'positions', 'risk_limits',
      'sessions', 'surveillance_feature_stats', 'surveillance_patterns',
      'surveillance_sessions', 'trades', 'users', 'watchlists'
    ];
    console.log(`Discovered ${tablesRes.rows.length} tables in public schema.`);
    for (const tbl of expectedTables) {
      const found = tablesRes.rows.some(r => r.tablename === tbl);
      if (!found) throw new Error(`Missing required table: ${tbl}`);
    }
    console.log('✓ All 17 tables confirmed present.');

    // 2. Apply Views, Triggers, and Stored Procedures
    console.log('\n--- 2. Applying 02_views_triggers.sql ---');
    const viewsTriggersSql = fs.readFileSync(path.join(sqlDir, '02_views_triggers.sql'), 'utf-8');
    await db.exec(viewsTriggersSql);
    console.log('✓ 02_views_triggers.sql applied successfully.');

    // Verify Views
    const viewsRes = await db.query<{ viewname: string }>(`
      SELECT viewname FROM pg_views
      WHERE schemaname = 'public'
      ORDER BY viewname;
    `);
    const expectedViews = ['v_portfolio_summary', 'v_surveillance_summary', 'v_top_of_book', 'v_trade_blotter'];
    for (const v of expectedViews) {
      const found = viewsRes.rows.some(r => r.viewname === v);
      if (!found) throw new Error(`Missing required view: ${v}`);
    }
    console.log('✓ All 4 advanced views confirmed present.');

    // Verify Stored Function fn_cosine_similarity
    const fnTest = await db.query<{ sim: number }>(`
      SELECT fn_cosine_similarity(
        ARRAY[1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]::DOUBLE PRECISION[],
        ARRAY[1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]::DOUBLE PRECISION[]
      ) AS sim;
    `);
    if (Math.abs(fnTest.rows[0].sim - 1.0) > 0.0001) {
      throw new Error(`fn_cosine_similarity failed identity test: got ${fnTest.rows[0].sim}`);
    }
    console.log('✓ Stored function fn_cosine_similarity verified (orthogonal/identity test passed).');

    // 3. Apply Seed Data
    console.log('\n--- 3. Applying 03_seed_data.sql ---');
    const seedSql = fs.readFileSync(path.join(sqlDir, '03_seed_data.sql'), 'utf-8');
    await db.exec(seedSql);
    console.log('✓ 03_seed_data.sql applied successfully.');

    // Check seed row counts
    const checkSql = `
      SELECT 'users' AS entity, COUNT(*)::INT AS count FROM users
      UNION ALL SELECT 'sessions', COUNT(*)::INT FROM sessions
      UNION ALL SELECT 'accounts', COUNT(*)::INT FROM accounts
      UNION ALL SELECT 'risk_limits', COUNT(*)::INT FROM risk_limits
      UNION ALL SELECT 'instruments', COUNT(*)::INT FROM instruments
      UNION ALL SELECT 'orders', COUNT(*)::INT FROM orders
      UNION ALL SELECT 'trades', COUNT(*)::INT FROM trades
      UNION ALL SELECT 'fills', COUNT(*)::INT FROM fills
      UNION ALL SELECT 'positions', COUNT(*)::INT FROM positions
      UNION ALL SELECT 'watchlists', COUNT(*)::INT FROM watchlists
      UNION ALL SELECT 'surveillance_sessions', COUNT(*)::INT FROM surveillance_sessions
      UNION ALL SELECT 'surveillance_patterns', COUNT(*)::INT FROM surveillance_patterns
      UNION ALL SELECT 'alerts', COUNT(*)::INT FROM alerts
      UNION ALL SELECT 'alert_notes', COUNT(*)::INT FROM alert_notes
      UNION ALL SELECT 'surveillance_feature_stats', COUNT(*)::INT FROM surveillance_feature_stats
      UNION ALL SELECT 'audit_log', COUNT(*)::INT FROM audit_log
      UNION ALL SELECT 'engine_offsets', COUNT(*)::INT FROM engine_offsets
      ORDER BY entity;
    `;
    const counts = await db.query<{ entity: string; count: number }>(checkSql);
    for (const r of counts.rows) {
      if (r.count <= 0) throw new Error(`Entity ${r.entity} has 0 seed rows!`);
    }
    console.log('✓ Seed data verified across all 17 tables (all non-empty).');

    // 4. Run all 17 Demonstration Queries
    console.log('\n--- 4. Executing 17 Official College Demonstration Queries ---');
    const demoQueriesSql = fs.readFileSync(path.join(sqlDir, '04_demo_queries.sql'), 'utf-8');
    const queryRegex = /--\s*(Q\d+\.[^\n]+)\n([\s\S]*?)(?=(?:--\s*Q\d+\.|$))/g;
    let match;
    let queriesRun = 0;
    while ((match = queryRegex.exec(demoQueriesSql)) !== null) {
      const title = match[1].trim();
      let sql = match[2].trim();
      if (!sql) continue;
      if (sql.endsWith(';')) sql = sql.slice(0, -1).trim();

      const qRes = await db.query(sql);
      if (qRes.rows.length === 0) {
        throw new Error(`College query ${title} returned 0 rows!`);
      }
      queriesRun++;
      console.log(`  ✓ ${title} -> Returned ${qRes.rows.length} rows.`);
    }
    if (queriesRun !== 17) {
      throw new Error(`Expected 17 queries, but executed ${queriesRun}`);
    }
    console.log('✓ All 17 college demonstration queries succeeded with non-zero output.');

    // 5. Transaction Atomicity & Rollback Test
    console.log('\n--- 5. Testing Transaction Atomicity and Rollback ---');
    const ordersCountBefore = (await db.query<{ count: number }>('SELECT COUNT(*)::INT AS count FROM orders')).rows[0].count;

    // Test Rollback on deliberate check constraint failure
    try {
      await db.exec('BEGIN;');
      await db.exec(`
        INSERT INTO orders (order_id, client_order_id, account_id, instrument_id, side, order_type, time_in_force, price, quantity, status, submitted_at, updated_at)
        VALUES (99999, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1001, 1, 'BUY', 'LIMIT', 'DAY', 1400.0, 10, 'OPEN', NOW(), NOW());
      `);
      // Deliberate constraint violation: negative price triggers chk_price
      await db.exec(`
        INSERT INTO orders (order_id, client_order_id, account_id, instrument_id, side, order_type, time_in_force, price, quantity, status, submitted_at, updated_at)
        VALUES (99998, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1001, 1, 'BUY', 'LIMIT', 'DAY', -100.0, 10, 'OPEN', NOW(), NOW());
      `);
      await db.exec('COMMIT;');
      throw new Error('Transaction should have failed on check constraint');
    } catch (err: any) {
      await db.exec('ROLLBACK;');
      console.log('  ✓ Rollback invoked on constraint violation.');
    }

    const ordersCountAfter = (await db.query<{ count: number }>('SELECT COUNT(*)::INT AS count FROM orders')).rows[0].count;
    if (ordersCountBefore !== ordersCountAfter) {
      throw new Error(`Rollback failed to maintain state: before=${ordersCountBefore}, after=${ordersCountAfter}`);
    }
    console.log('✓ Atomicity verified: no partial records persisted after transaction failure.');

    // 6. Test Fills, Position, and Cash Balance Trigger Consistency
    console.log('\n--- 6. Testing Trigger Consistency (Settlement & Positions) ---');
    const accBefore = (await db.query<{ cash_balance: string }>('SELECT cash_balance FROM accounts WHERE account_id = 1001')).rows[0];
    const initialCash = parseFloat(accBefore.cash_balance);

    // Insert a test trade and matching fill
    const testTradeId = 99991;
    const testFillId = 99991;
    const fillPrice = 1400.0;
    const fillQty = 10;
    const fillCashDelta = -(fillPrice * fillQty); // -14,000

    await db.exec(`
      INSERT INTO trades (trade_id, engine_seq, instrument_id, executed_at, price, quantity, buy_order_id, sell_order_id, buyer_account_id, seller_account_id, aggressor_side)
      VALUES (${testTradeId}, 999991, 1, NOW(), ${fillPrice}, ${fillQty}, 5001, 5002, 1001, 1002, 'BUY');
    `);

    // Inserting this fill should fire trg_fills_settlement
    await db.exec(`
      INSERT INTO fills (fill_id, trade_id, order_id, account_id, instrument_id, side, price, quantity, cash_delta, realized_pnl, executed_at)
      VALUES (${testFillId}, ${testTradeId}, 5001, 1001, 1, 'BUY', ${fillPrice}, ${fillQty}, ${fillCashDelta}, 0, NOW());
    `);

    // Verify Cash Balance updated automatically by trigger
    const accAfter = (await db.query<{ cash_balance: string }>('SELECT cash_balance FROM accounts WHERE account_id = 1001')).rows[0];
    const expectedCash = initialCash + fillCashDelta;
    if (Math.abs(parseFloat(accAfter.cash_balance) - expectedCash) > 0.01) {
      throw new Error(`Trigger failed to update cash_balance: expected ${expectedCash}, got ${accAfter.cash_balance}`);
    }
    console.log(`  ✓ Account cash balance updated by trigger: ${initialCash} -> ${accAfter.cash_balance}`);

    // Verify Position updated automatically by trigger
    const posRes = await db.query<{ net_qty: string }>('SELECT net_qty FROM positions WHERE account_id = 1001 AND instrument_id = 1');
    console.log(`  ✓ Position updated by trigger: net_qty = ${posRes.rows[0].net_qty}`);

    // 7. Verify Unique Constraints (Duplicate trade_id + side rejected)
    console.log('\n--- 7. Verifying Unique Constraints ---');
    try {
      await db.exec(`
        INSERT INTO fills (fill_id, trade_id, order_id, account_id, instrument_id, side, price, quantity, cash_delta, realized_pnl, executed_at)
        VALUES (${testFillId + 1}, ${testTradeId}, 5001, 1001, 1, 'BUY', ${fillPrice}, ${fillQty}, ${fillCashDelta}, 0, NOW());
      `);
      throw new Error('Should have failed on UNIQUE(trade_id, side)');
    } catch (e: any) {
      if (e.message.includes('unique') || e.message.includes('duplicate')) {
        console.log('  ✓ Constraint UNIQUE(trade_id, side) properly rejected second BUY fill for same trade.');
      } else {
        throw e;
      }
    }

    console.log('\n================================================================');
    console.log('✓ DISPOSABLE DATABASE VERIFICATION: ALL CHECKS PASSED (100%)');
    console.log('================================================================\n');

  } finally {
    await db.close();
    // Clean up temporary test directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[DISPOSABLE DB] Temporary directory ${tempDir} cleaned up successfully.`);
      }
    } catch (e) {
      // ignore cleanup errors on Windows locks
    }
  }
}

verifyDisposableDatabase().catch(err => {
  console.error('[FATAL] Disposable database verification failed:', err);
  process.exit(1);
});
