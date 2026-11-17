import { Router, Response } from 'express';
import { getDatabase } from '../../database/db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Trade Blotter
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = await getDatabase();
    const { instrumentId, limit = '50' } = req.query;

    let query = 'SELECT * FROM v_trade_blotter WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (req.user?.role === 'TRADER') {
      query += ` AND (buyer_account_id = $${idx} OR seller_account_id = $${idx})`;
      params.push(req.user.accountId);
      idx++;
    }

    if (instrumentId) {
      query += ` AND instrument_id = $${idx++}`;
      params.push(parseInt(instrumentId as string, 10));
    }

    query += ` ORDER BY executed_at DESC LIMIT $${idx++}`;
    params.push(parseInt(limit as string, 10));

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fills (Side-specific legs)
router.get('/fills', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = await getDatabase();
    let query = `
      SELECT f.*, i.symbol, i.name AS instrument_name, u.username
      FROM fills f
      JOIN accounts a ON a.account_id = f.account_id
      JOIN users u ON u.user_id = a.user_id
      JOIN instruments i ON i.instrument_id = f.instrument_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (req.user?.role === 'TRADER') {
      query += ` AND f.account_id = $${idx++}`;
      params.push(req.user.accountId);
    }

    query += ` ORDER BY f.executed_at DESC LIMIT 100`;
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
