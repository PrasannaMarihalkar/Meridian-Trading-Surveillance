import { Router, Request, Response } from 'express';
import { getDatabase } from '../../database/db';
import { authenticate, AuthenticatedRequest, requireRole } from '../middleware/auth';
import fs from 'fs';
import path from 'path';

const router = Router();

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Health Check
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const dbCheck = await db.query('SELECT 1 AS alive');
    res.json({
      status: 'HEALTHY',
      service: 'MERIDIAN Trading & Surveillance Core',
      version: '1.0.0',
      database: {
        alive: dbCheck.rows.length === 1,
        engine: db.isPGlite ? 'Embedded PostgreSQL (PGlite)' : 'PostgreSQL Native'
      },
      uptime_seconds: process.uptime(),
      memory_usage: process.memoryUsage()
    });
  } catch (err) {
    res.status(503).json({ status: 'UNHEALTHY', error: getErrorMessage(err) });
  }
});

// Audit Log Explorer (Admin & Analyst)
router.get('/audit-log', authenticate, requireRole('ADMIN', 'ANALYST'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = await getDatabase();
    const { entityType, limit = '50' } = req.query;

    let query = `
      SELECT al.*, u.username AS actor
      FROM audit_log al
      LEFT JOIN users u ON u.user_id = al.actor_user_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let idx = 1;

    if (entityType) {
      query += ` AND al.entity_type = $${idx++}`;
      params.push(entityType as string);
    }

    query += ` ORDER BY al.occurred_at DESC LIMIT $${idx++}`;
    params.push(parseInt(limit as string, 10));

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Engine Consumer Offsets
router.get('/engine-offsets', authenticate, requireRole('ADMIN'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const db = await getDatabase();
    const result = await db.query('SELECT * FROM engine_offsets ORDER BY consumer ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// College Demonstration Queries Runner
router.get('/college-queries', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const queryNum = parseInt((req.query.q as string) || '1', 10);
    const db = await getDatabase();

    const filePath = path.join(__dirname, '..', '..', 'database', 'sql', '04_demo_queries.sql');
    const content = fs.readFileSync(filePath, 'utf-8');

    const regex = /--\s*(Q\d+\.[^\n]+)\n([\s\S]*?)(?=(?:--\s*Q\d+\.|$))/g;
    const queries: { id: number; title: string; sql: string }[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      const title = match[1].trim();
      const numMatch = title.match(/Q(\d+)\./);
      const id = numMatch ? parseInt(numMatch[1], 10) : queries.length + 1;
      let sql = match[2].trim();
      if (sql.endsWith(';')) sql = sql.slice(0, -1).trim();
      queries.push({ id, title, sql });
    }

    const selected = queries.find(q => q.id === queryNum) || queries[0];
    const execResult = await db.query(selected.sql);

    res.json({
      selectedQuery: selected,
      totalQueriesAvailable: queries.length,
      allQueriesList: queries.map(q => ({ id: q.id, title: q.title })),
      resultCount: execResult.rows.length,
      rows: execResult.rows
    });
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

export default router;
