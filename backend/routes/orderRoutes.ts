import { Router, Response } from 'express';
import { getDatabase } from '../../database/db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { TradingService, PlaceOrderInput } from '../services/tradingService';
import { z } from 'zod';

const router = Router();

const PlaceOrderSchema = z.object({
  accountId: z.number().int().positive(),
  instrumentId: z.number().int().positive(),
  side: z.enum(['BUY', 'SELL']),
  orderType: z.enum(['LIMIT', 'MARKET', 'IOC']),
  timeInForce: z.enum(['DAY', 'GTC', 'IOC', 'FOK']).optional(),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive()
});

// Submit Order
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = PlaceOrderSchema.parse(req.body);

    // Trader security authorization: Trader can only place orders on their own account
    if (req.user?.role === 'TRADER' && req.user.accountId !== validated.accountId) {
      res.status(403).json({ error: 'Forbidden: You can only place orders for your own account' });
      return;
    }

    const result = await TradingService.submitOrder(validated as PlaceOrderInput);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Order submission failed' });
  }
});

// List Orders with Filtering
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = await getDatabase();
    const { status, instrumentId, accountId, limit = '50', offset = '0' } = req.query;

    let query = `
      SELECT o.*, i.symbol, i.name AS instrument_name, u.username AS trader
      FROM orders o
      JOIN accounts a ON a.account_id = o.account_id
      JOIN users u ON u.user_id = a.user_id
      JOIN instruments i ON i.instrument_id = o.instrument_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    // Role filtering: Traders only see own orders
    if (req.user?.role === 'TRADER') {
      query += ` AND o.account_id = $${idx++}`;
      params.push(req.user.accountId);
    } else if (accountId) {
      query += ` AND o.account_id = $${idx++}`;
      params.push(parseInt(accountId as string, 10));
    }

    if (status) {
      query += ` AND o.status = $${idx++}`;
      params.push(status);
    }

    if (instrumentId) {
      query += ` AND o.instrument_id = $${idx++}`;
      params.push(parseInt(instrumentId as string, 10));
    }

    query += ` ORDER BY o.submitted_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel Order
router.post('/:id/cancel', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const db = await getDatabase();

    const orderRes = await db.query('SELECT account_id FROM orders WHERE order_id = $1', [orderId]);
    if (orderRes.rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const targetAccountId = parseInt(orderRes.rows[0].account_id, 10);
    if (req.user?.role === 'TRADER' && req.user.accountId !== targetAccountId) {
      res.status(403).json({ error: 'Forbidden: Cannot cancel order belonging to another trader' });
      return;
    }

    const cancelledOrder = await TradingService.cancelOrder(orderId, targetAccountId);
    res.json({ message: 'Order cancelled successfully', order: cancelledOrder });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
