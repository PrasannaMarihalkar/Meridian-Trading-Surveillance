import { Router, Response } from 'express';
import { AuthService } from '../services/authService';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { getDatabase } from '../../database/db';
import { z } from 'zod';

const router = Router();

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Public registration is restricted strictly to TRADER role
const PublicRegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30),
  password: z.string().min(8),
  role: z.enum(['TRADER']).optional().default('TRADER')
});

// Admin-only user provisioning schema for all roles
const AdminCreateUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30),
  password: z.string().min(8),
  role: z.enum(['TRADER', 'ANALYST', 'ADMIN'])
});

const LoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1)
});

router.post('/register', async (req, res: Response) => {
  try {
    const validated = PublicRegisterSchema.parse(req.body);
    const result = await AuthService.register({
      ...validated,
      role: 'TRADER'
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: getErrorMessage(err) || 'Registration failed' });
  }
});

// Protected: Only existing ADMINs can provision ANALYST or ADMIN accounts
router.post('/users', authenticate, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = AdminCreateUserSchema.parse(req.body);
    const result = await AuthService.register(validated);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: getErrorMessage(err) || 'User provisioning failed' });
  }
});

router.post('/login', async (req, res: Response) => {
  try {
    const validated = LoginSchema.parse(req.body);
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const result = await AuthService.login({
      identifier: validated.identifier,
      password: validated.password,
      ipAddress: ip,
      userAgent
    });
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: getErrorMessage(err) || 'Login failed' });
  }
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const profile = await AuthService.getProfile(req.user.userId);
    res.json(profile);
  } catch (err) {
    res.status(404).json({ error: getErrorMessage(err) || 'Profile not found' });
  }
});

router.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.sessionId) {
      const db = await getDatabase();
      await db.query('DELETE FROM sessions WHERE session_id = $1', [req.user.sessionId]);
      try {
        await db.query(
          `INSERT INTO audit_log (occurred_at, actor_user_id, action, entity_type, entity_id, new_data)
           VALUES (NOW(), $1, 'USER_LOGOUT', 'sessions', $2, $3)`,
          [req.user.userId, req.user.sessionId, JSON.stringify({ ip: req.ip })]
        );
      } catch {
        // Non-critical audit log fallback
      }
    }
    res.json({ message: 'Successfully logged out' });
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) || 'Logout failed' });
  }
});

export default router;
