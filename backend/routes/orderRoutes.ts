import { Router, Response } from 'express';
import { getDatabase } from '../../database/db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { TradingService, PlaceOrderInput } from '../services/tradingService';
import { z } from 'zod';

const router = Router();

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const PlaceOrderSchema = z.object({
  accountId: z.number().int().positive().optional(),
  instrumentId: z.number().int().positive(),
  side: z.enum(['BUY', 'SELL']),
  orderType: z.enum(['LIMIT', 'MARKET', 'IOC']),
  timeInForce: z.enum(['DAY', 'GTC', 'IOC', 'FOK']).optional(),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  clientOrderId: z.string().uuid().optional()
});

// Submit Order
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Strict Idempotency Key Validation
    const headerKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;
    const bodyKey = typeof req.body?.clientOrderId === 'string' && req.body.clientOrderId.trim().length > 0
      ? req.body.clientOrderId.trim()
      : undefined;

    // Check for mismatch between header and body
    if (headerKey && bodyKey && headerKey !== bodyKey) {
      res.status(400).json({ error: 'Idempotency key mismatch: header and body clientOrderId must match' });
      return;
    }

    const idempotencyKey = headerKey || bodyKey;
    if (!idempotencyKey) {
      res.status(400).json({ error: 'Missing required idempotency key: provide clientOrderId in body or Idempotency-Key header' });
      return;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(idempotencyKey)) {
      res.status(400).json({ error: 'Invalid idempotency key format: must be a valid UUID' });
      return;
    }

    const validated = PlaceOrderSchema.parse({ ...req.body, clientOrderId: idempotencyKey });

    // Derive account identity securely from authenticated principal
    let targetAccountId = req.user?.accountId;
    if (req.user?.role === 'ADMIN' && validated.accountId) {
      targetAccountId = validated.accountId;
    }

    if (!targetAccountId) {
      res.status(403).json({ error: 'Forbidden: No trading account associated with authenticated user' });
      return;
    }

    // Trader security check: Trader cannot pass a different accountId in request body
    if (validated.accountId && validated.accountId !== targetAccountId && req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: You can only place orders for your own account' });
      return;
    }

    const input: PlaceOrderInput = {
      accountId: targetAccountId,
      instrumentId: validated.instrumentId,
      side: validated.side,
      orderType: validated.orderType,
      timeInForce: validated.timeInForce,
      price: validated.price,
      quantity: validated.quantity,
      clientOrderId: idempotencyKey
    };

    const result = await TradingService.submitOrder(input);
    res.status(201).json(result);
  } catch (err: unknown) {
    const statusCode = (err && typeof err === 'object' && 'statusCode' in err && typeof (err as { statusCode: unknown }).statusCode === 'number')
      ? (err as { statusCode: number }).statusCode
      : 400;
    res.status(statusCode).json({ error: getErrorMessage(err) || 'Order submission failed' });
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
    const params: (string | number)[] = [];
    let idx = 1;

    // Role filtering: Traders only see own orders
    if (req.user?.role === 'TRADER' && req.user.accountId !== undefined) {
      query += ` AND o.account_id = $${idx++}`;
      params.push(req.user.accountId);
    } else if (accountId) {
      query += ` AND o.account_id = $${idx++}`;
      params.push(parseInt(accountId as string, 10));
    }

    if (status) {
      query += ` AND o.status = $${idx++}`;
      params.push(status as string);
    }

    if (instrumentId) {
      query += ` AND o.instrument_id = $${idx++}`;
      params.push(parseInt(instrumentId as string, 10));
    }

    query += ` ORDER BY o.submitted_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Cancel Order
router.post('/:id/cancel', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = parseInt(req.params.id as string, 10);
    const db = await getDatabase();

    const orderRes = await db.query('SELECT account_id FROM orders WHERE order_id = $1', [orderId]);
    if (orderRes.rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const targetAccountId = parseInt(orderRes.rows[0].account_id, 10);
    const userRole = req.user?.role;
    if (userRole === 'ADMIN') {
      // Admin is authorized to cancel any order
    } else if (userRole === 'TRADER' && req.user?.accountId === targetAccountId) {
      // Trader is authorized to cancel their own order
    } else {
      res.status(403).json({ error: 'Forbidden: Insufficient permissions to cancel order' });
      return;
    }

    const cancelledOrder = await TradingService.cancelOrder(orderId, targetAccountId);
    res.json({ message: 'Order cancelled successfully', order: cancelledOrder });
  } catch (err) {
    res.status(400).json({ error: getErrorMessage(err) });
  }
});

export default router;
