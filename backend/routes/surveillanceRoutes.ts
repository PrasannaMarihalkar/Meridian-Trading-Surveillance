import { Router, Response } from 'express';
import { getDatabase } from '../../database/db';
import { authenticate, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { SurveillanceService } from '../services/surveillanceService';
import { z } from 'zod';

const router = Router();

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// List Alerts (Analyst & Admin)
router.get('/alerts', authenticate, requireRole('ANALYST', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = await getDatabase();
    const { status, severity } = req.query;

    let query = 'SELECT * FROM v_surveillance_summary WHERE 1=1';
    const params: (string | number)[] = [];
    let idx = 1;

    if (status) {
      query += ` AND status = $${idx++}`;
      params.push(status as string);
    }
    if (severity) {
      query += ` AND severity = $${idx++}`;
      params.push(severity as string);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Single Alert Details with Investigation Notes
router.get('/alerts/:id', authenticate, requireRole('ANALYST', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const alertId = parseInt(req.params.id as string, 10);
    const db = await getDatabase();

    const alertRes = await db.query('SELECT * FROM v_surveillance_summary WHERE alert_id = $1', [alertId]);
    if (alertRes.rows.length === 0) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    const notesRes = await db.query(
      `SELECT n.note_id, n.alert_id, n.body, n.created_at, u.username AS author
       FROM alert_notes n
       JOIN users u ON u.user_id = n.author_id
       WHERE n.alert_id = $1
       ORDER BY n.created_at ASC`,
      [alertId]
    );

    res.json({
      alert: alertRes.rows[0],
      notes: notesRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Update Alert Status
router.put('/alerts/:id/status', authenticate, requireRole('ANALYST', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const alertId = parseInt(req.params.id as string, 10);
    const { status } = req.body;
    if (!['OPEN', 'IN_REVIEW', 'RESOLVED', 'FALSE_POSITIVE'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const updated = await SurveillanceService.updateAlertStatus(alertId, status);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: getErrorMessage(err) });
  }
});

// Assign Alert to Analyst
router.put('/alerts/:id/assign', authenticate, requireRole('ANALYST', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const alertId = parseInt(req.params.id as string, 10);
    const analystId = req.body.analystId || req.user?.userId;
    const updated = await SurveillanceService.assignAlert(alertId, analystId);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: getErrorMessage(err) });
  }
});

// Add Investigation Note
router.post('/alerts/:id/notes', authenticate, requireRole('ANALYST', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const alertId = parseInt(req.params.id as string, 10);
    const { body } = req.body;
    if (!body || body.trim().length === 0) {
      res.status(400).json({ error: 'Note content cannot be empty' });
      return;
    }

    const note = await SurveillanceService.addNote(alertId, req.user!.userId, body.trim());
    res.status(201).json(note);
  } catch (err) {
    res.status(400).json({ error: getErrorMessage(err) });
  }
});

// Full-Text Search on Notes
router.get('/notes/search', authenticate, requireRole('ANALYST', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q || q.trim().length === 0) {
      res.status(400).json({ error: 'Query parameter q is required' });
      return;
    }

    const results = await SurveillanceService.searchNotes(q.trim());
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Known Patterns
router.get('/patterns', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const db = await getDatabase();
    const result = await db.query('SELECT * FROM surveillance_patterns ORDER BY pattern_id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Surveillance Sessions
router.get('/sessions', authenticate, requireRole('ANALYST', 'ADMIN'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const db = await getDatabase();
    const result = await db.query(
      `SELECT ss.*, u.username AS subject_trader, i.symbol
       FROM surveillance_sessions ss
       JOIN accounts a ON a.account_id = ss.account_id
       JOIN users u ON u.user_id = a.user_id
       JOIN instruments i ON i.instrument_id = ss.instrument_id
       ORDER BY ss.created_at DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Trigger Real-Time Surveillance Window Evaluation
const EvaluateSchema = z.object({
  accountId: z.number().int().positive(),
  instrumentId: z.number().int().positive()
});

router.post('/evaluate', authenticate, requireRole('ANALYST', 'ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId, instrumentId } = EvaluateSchema.parse(req.body);
    const result = await SurveillanceService.evaluateSessionWindow({ accountId, instrumentId });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: getErrorMessage(err) });
  }
});

export default router;
