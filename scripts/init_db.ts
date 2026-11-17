import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database/db';

async function main() {
  console.log('=== MERIDIAN DATABASE SETUP & VERIFICATION ===\n');

  const db = await getDatabase();

  const sqlDir = path.join(__dirname, '..', 'database', 'sql');
  const files = [
    '01_schema.sql',
    '02_views_triggers.sql',
    '03_seed_data.sql'
  ];

  for (const file of files) {
    const filePath = path.join(sqlDir, file);
    console.log(`[SQL] Executing ${file}...`);
    const sql = fs.readFileSync(filePath, 'utf-8');
    await db.exec(sql);
    console.log(`[SQL] Successfully executed ${file}`);
  }

  console.log('\n[VERIFICATION] Verifying row counts across all 17 entities:\n');

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

  const result = await db.query(checkSql);
  console.table(result.rows);

  const emptyTables = result.rows.filter(r => r.count === 0);
  if (emptyTables.length > 0) {
    console.error(`[ERROR] Some tables are empty: ${emptyTables.map(t => t.entity).join(', ')}`);
    process.exit(1);
  }

  console.log('\n[SUCCESS] All 17 tables exist and are populated with valid records!');
  await db.close();
}

main().catch(err => {
  console.error('[FATAL] Database initialization failed:', err);
  process.exit(1);
});
