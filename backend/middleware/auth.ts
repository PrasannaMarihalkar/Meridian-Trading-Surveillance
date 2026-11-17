import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthTokenPayload, UserRole } from '../types';
import { getDatabase } from '../../database/db';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('[FATAL_SECURITY] JWT_SECRET environment variable must be explicitly defined in production.');
}

export const JWT_SECRET = process.env.JWT_SECRET || 'meridian-super-secure-dev-secret-key-2026';

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    if (!decoded.sessionId) {
      res.status(401).json({ error: 'Unauthorized: Missing session identifier' });
      return;
    }

    const db = await getDatabase();
    const sessionRes = await db.query(
      `SELECT s.session_id, u.is_active, s.expires_at
       FROM sessions s
       JOIN users u ON u.user_id = s.user_id
       WHERE s.session_id = $1`,
      [decoded.sessionId]
    );

    if (sessionRes.rows.length === 0) {
      res.status(401).json({ error: 'Unauthorized: Session revoked or not found' });
      return;
    }

    const session = sessionRes.rows[0];
    if (!session.is_active) {
      res.status(401).json({ error: 'Unauthorized: User account is inactive' });
      return;
    }

    if (new Date(session.expires_at) <= new Date()) {
      res.status(401).json({ error: 'Unauthorized: Session expired' });
      return;
    }

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: Token expired or invalid' });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Forbidden: Access restricted to roles: [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`
      });
      return;
    }

    next();
  };
}
