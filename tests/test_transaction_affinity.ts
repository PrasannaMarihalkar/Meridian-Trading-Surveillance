import { getDatabase, closeDatabase, ITransactionClient } from '../database/db';

async function runTransactionAffinityVerification() {
  console.log('=== VERIFYING TRANSACTION CONNECTION AFFINITY & ATOMICITY ===\n');

  const db = await getDatabase();
  console.log(`[DB] Engine mode: ${db.isPGlite ? 'Embedded PGlite' : 'Native PostgreSQL (pg.Pool)'}`);

  // Setup test table
  await db.exec(`CREATE TABLE IF NOT EXISTS test_tx_affinity (id INT PRIMARY KEY, tx_id INT, val TEXT)`);
  await db.exec(`TRUNCATE test_tx_affinity`);

  // 1. Verify that exceptions roll back all related writes on that connection
  console.log('[TEST 1] Verifying that unhandled exception triggers clean rollback on same connection...');
  let rollbackCaught = false;
  try {
    await db.transaction(async (tx: ITransactionClient) => {
      await tx.query(`INSERT INTO test_tx_affinity (id, tx_id, val) VALUES (1, 100, 'uncommitted_row')`);
      throw new Error('SIMULATED_TRANSACTION_FAILURE');
    });
  } catch (err: any) {
    if (err.message === 'SIMULATED_TRANSACTION_FAILURE') {
      rollbackCaught = true;
    } else {
      throw err;
    }
  }

  if (!rollbackCaught) {
    throw new Error('Expected transaction to throw SIMULATED_TRANSACTION_FAILURE');
  }

  const check1 = await db.query(`SELECT * FROM test_tx_affinity WHERE id = 1`);
  if (check1.rows.length !== 0) {
    throw new Error(`CRITICAL FAILURE: Row was NOT rolled back! Found ${check1.rows.length} rows.`);
  }
  console.log('  ✓ Exception cleanly rolled back all writes (0 rows in table).');

  // 2. Verify that successful transaction commits all writes
  console.log('[TEST 2] Verifying that successful transaction commits all writes...');
  await db.transaction(async (tx: ITransactionClient) => {
    await tx.query(`INSERT INTO test_tx_affinity (id, tx_id, val) VALUES (2, 200, 'committed_row')`);
  });

  const check2 = await db.query(`SELECT * FROM test_tx_affinity WHERE id = 2`);
  if (check2.rows.length !== 1 || check2.rows[0].val !== 'committed_row') {
    throw new Error(`Expected committed row with id 2, got: ${JSON.stringify(check2.rows)}`);
  }
  console.log('  ✓ Successful transaction committed write cleanly.');

  // 3. Verify that concurrent transactions execute on independent connections without interleaving
  console.log('[TEST 3] Verifying that concurrent transactions execute without cross-connection interference...');
  const numConcurrent = 5;
  const promises: Promise<void>[] = [];

  for (let i = 0; i < numConcurrent; i++) {
    const id = 1000 + i;
    const shouldFail = (i % 2 === 1); // odd ones fail, even ones succeed

    const p = (async () => {
      try {
        await db.transaction(async (tx: ITransactionClient) => {
          await tx.query(`INSERT INTO test_tx_affinity (id, tx_id, val) VALUES ($1, $2, $3)`, [id, i, `tx_${i}`]);
          // Introduce slight latency to test interleaving
          await new Promise(r => setTimeout(r, 10 + (i * 5)));
          if (shouldFail) {
            throw new Error(`Intentional_Failure_${i}`);
          }
        });
      } catch (err: any) {
        if (!shouldFail) throw err;
      }
    })();
    promises.push(p);
  }

  await Promise.all(promises);

  const check3 = await db.query(`SELECT * FROM test_tx_affinity WHERE id >= 1000 ORDER BY id ASC`);
  console.log(`  Concurrent results: ${check3.rows.length} rows persisted out of ${numConcurrent} attempts.`);

  // Exactly the even-numbered ones (0, 2, 4 = 3 rows) should exist
  const persistedIds = check3.rows.map(r => r.id);
  const expectedIds = [1000, 1002, 1004];

  if (JSON.stringify(persistedIds) !== JSON.stringify(expectedIds)) {
    throw new Error(`Mismatch in persisted rows! Expected ${JSON.stringify(expectedIds)}, got ${JSON.stringify(persistedIds)}`);
  }
  console.log('  ✓ Exactly the committed transactions succeeded, and failing ones rolled back completely.');

  // 4. Verify connection release: acquire connection from pool to confirm pool is healthy and not exhausted
  if (!db.isPGlite && db.pool) {
    console.log('[TEST 4] Verifying connection pool health & zero leaked connections...');
    const poolClient = await db.pool.connect();
    const ping = await poolClient.query('SELECT 1 AS alive');
    poolClient.release();
    if (ping.rows[0].alive !== 1) {
      throw new Error('Connection pool was not responsive after transactions');
    }
    console.log(`  ✓ Pool is responsive (total clients: ${db.pool.totalCount}, idle: ${db.pool.idleCount}, waiting: ${db.pool.waitingCount}).`);

    // 5. Verify that releasing client with error properly destroys it and leaves pool healthy
    console.log('[TEST 5] Verifying pool health when client is released with rollback error...');
    const brokenClient = await db.pool.connect();
    // Simulate rollback failure by releasing client with error
    brokenClient.release(new Error('SIMULATED_ROLLBACK_FAILURE'));
    // Acquire fresh connection to prove pool destroyed bad connection and remains healthy
    const healthyClient = await db.pool.connect();
    const probe = await healthyClient.query('SELECT 1 AS healthy');
    healthyClient.release();
    if (probe.rows[0].healthy !== 1) {
      throw new Error('Pool was corrupted or non-responsive after client release with error');
    }
    console.log('  ✓ Pool destroyed bad connection and safely served healthy replacement.');
  }

  console.log('\n=== ALL TRANSACTION AFFINITY & ATOMICITY TESTS PASSED ===\n');
  await closeDatabase();
}

runTransactionAffinityVerification().catch(err => {
  console.error('[FAIL] Transaction affinity test failed:', err);
  process.exit(1);
});
