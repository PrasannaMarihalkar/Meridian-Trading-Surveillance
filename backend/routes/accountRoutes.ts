import { Router, Response } from 'express';
import { getDatabase } from '../../database/db';
import { authenticate, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { TradingService } from '../services/tradingService';
import { z } from 'zod';

const router = Router();

// List Accounts
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = await getDatabase();
    let query = 'SELECT * FROM accounts';
    let params: any[] = [];

    // If TRADER, restrict to own account
    if (req.user?.role === 'TRADER') {
      query += ' WHERE user_id = $1';
      params.push(req.user.userId);
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Account Details
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = await getDatabase();
    const accountId = parseInt(req.params.id, 10);
    const result = await db.query(
      `SELECT a.*, u.username, u.email,
              rl.max_order_qty, rl.max_order_notional, rl.max_position_qty, rl.max_open_orders, rl.price_collar_pct
       FROM accounts a
       JOIN users u ON u.user_id = a.user_id
       LEFT JOIN risk_limits rl ON rl.account_id = a.account_id
       WHERE a.account_id = $1`,
      [accountId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Role check: Trader can only access own account
    if (req.user?.role === 'TRADER' && req.user.accountId !== accountId) {
      res.status(403).json({ error: 'Forbidden: Access restricted to account owner' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update Risk Limits (Admin only)
const UpdateRiskSchema = z.object({
  max_order_qty: z.number().positive(),
  max_order_notional: z.number().positive(),
  max_position_qty: z.number().positive(),
  max_open_orders: z.number().int().positive(),
  price_collar_pct: z.number().positive().max(100)
});

router.put('/:id/risk-limits', authenticate, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accountId = parseInt(req.params.id, 10);
    const val = UpdateRiskSchema.parse(req.body);
    const db = await getDatabase();

    const result = await db.query(
      `INSERT INTO risk_limits (account_id, max_order_qty, max_order_notional, max_position_qty, max_open_orders, price_collar_pct, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (account_id) DO UPDATE SET
         max_order_qty = EXCLUDED.max_order_qty,
         max_order_notional = EXCLUDED.max_order_notional,
         max_position_qty = EXCLUDED.max_position_qty,
         max_open_orders = EXCLUDED.max_open_orders,
         price_collar_pct = EXCLUDED.price_collar_pct,
         updated_at = NOW()
       RETURNING *`,
      [accountId, val.max_order_qty, val.max_order_notional, val.max_position_qty, val.max_open_orders, val.price_collar_pct]
    );

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Account Positions & Portfolio
router.get('/:id/positions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accountId = parseInt(req.params.id, 10);
    if (req.user?.role === 'TRADER' && req.user.accountId !== accountId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const portfolio = await TradingService.getPortfolio(accountId);
    res.json(portfolio);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
