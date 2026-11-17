import { Router, Request, Response } from 'express';
import { getDatabase } from '../../database/db';
import { TradingService } from '../services/tradingService';

const router = Router();

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// List all instruments with Top of Book
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const result = await db.query('SELECT * FROM v_top_of_book ORDER BY instrument_id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Single instrument details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id as string, 10);
    const result = await db.query('SELECT * FROM instruments WHERE instrument_id = $1', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Instrument not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Order book snapshot (Level 2 ladder)
router.get('/:id/order-book', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const depth = parseInt((req.query.depth as string) || '10', 10);
    const snapshot = await TradingService.getOrderBookSnapshot(id, depth);
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

export default router;
