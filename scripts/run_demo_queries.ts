import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database/db';

async function main() {
  console.log('=== MERIDIAN 17 DEMONSTRATION QUERIES EXECUTION ===\n');

  const db = await getDatabase();
  const filePath = path.join(__dirname, '..', 'database', 'sql', '04_demo_queries.sql');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Regex to match "-- Q{n}. {title}\n{sql};"
  const regex = /--\s*(Q\d+\.[^\n]+)\n([\s\S]*?)(?=(?:--\s*Q\d+\.|$))/g;
  let match;
  let successCount = 0;

  while ((match = regex.exec(content)) !== null) {
    const title = match[1].trim();
    let sql = match[2].trim();

    if (!sql) continue;
    // Remove trailing semicolon if present for query execution
    if (sql.endsWith(';')) {
      sql = sql.slice(0, -1).trim();
    }

    console.log(`\n================================================================`);
    console.log(`[QUERY] ${title}`);
    console.log(`================================================================`);

    try {
      const res = await db.query(sql);
      console.log(`✓ Returned ${res.rows.length} rows:`);
      console.table(res.rows.slice(0, 10)); // Display up to 10 rows
      successCount++;
    } catch (err: any) {
      console.error(`[FAIL] Error running ${title}:`, err.message || err);
      process.exit(1);
    }
  }

  console.log(`\n[COMPLETE] Successfully executed ${successCount} out of 17 college demonstration queries!`);
  await db.close();
}

main().catch(err => {
  console.error('[FATAL] Demo query execution failed:', err);
  process.exit(1);
});
