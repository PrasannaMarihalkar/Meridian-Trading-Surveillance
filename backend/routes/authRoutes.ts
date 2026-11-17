import { Router, Response } from 'express';
import { AuthService } from '../services/authService';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

const RegisterSchema = z.object({
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
    const validated = RegisterSchema.parse(req.body);
    const result = await AuthService.register(validated);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed' });
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
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Login failed' });
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
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Profile not found' });
  }
});

router.post('/logout', authenticate, (_req, res) => {
  res.json({ message: 'Successfully logged out' });
});

export default router;
