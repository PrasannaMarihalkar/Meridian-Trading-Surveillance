import crypto from 'crypto';
import { AuthTokenPayload, UserRole } from '../types';
import { getDatabase } from '../../database/db';

class WsTicketManager {
  private static instance: WsTicketManager;

  private constructor() {
    // Periodic database cleanup of expired tickets every 60 seconds
    setInterval(async () => {
      try {
        const db = await getDatabase();
        await db.query(`DELETE FROM ws_tickets WHERE expires_at <= NOW()`);
      } catch {
        // Suppress background sweep error on shutdown
      }
    }, 60000).unref();
  }

  public static getInstance(): WsTicketManager {
    if (!WsTicketManager.instance) {
      WsTicketManager.instance = new WsTicketManager();
    }
    return WsTicketManager.instance;
  }

  /**
   * Issue a short-lived (30s), single-use ticket stored in shared PostgreSQL.
   * Stores only the SHA-256 hash of the ticket bound to the user's active session.
   */
  public async issueTicket(user: AuthTokenPayload, ttlMs: number = 30000): Promise<string> {
    const rawTicket = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(rawTicket).digest('hex');
    const expiresAt = new Date(Date.now() + ttlMs);

    const db = await getDatabase();

    // Ensure session ID is valid UUID
    if (!user.sessionId) {
      throw new Error('Cannot issue WebSocket ticket without an active session ID');
    }

    await db.query(
      `INSERT INTO ws_tickets (ticket_hash, user_id, session_id, account_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [hash, user.userId, user.sessionId, user.accountId ?? null, expiresAt]
    );

    return rawTicket;
  }

  /**
   * Atomically consume a single-use ticket from PostgreSQL.
   * Prevents replay attacks: the ticket row is atomically deleted in the database.
   * Authoritatively verifies that the session is active and resolves the user's role
   * directly from durable storage (never trusting stale ticket claims).
   */
  public async consumeTicket(rawTicket: string): Promise<AuthTokenPayload | null> {
    if (!rawTicket || typeof rawTicket !== 'string' || rawTicket.trim().length === 0) {
      return null;
    }

    const hash = crypto.createHash('sha256').update(rawTicket.trim()).digest('hex');
    const db = await getDatabase();

    const result = await db.query(
      `WITH deleted AS (
         DELETE FROM ws_tickets
         WHERE ticket_hash = $1 AND expires_at > NOW()
         RETURNING user_id, session_id, account_id
       )
       SELECT d.user_id, d.session_id, d.account_id, u.username, u.email, u.role, u.is_active, s.expires_at AS session_expires_at
       FROM deleted d
       JOIN sessions s ON s.session_id = d.session_id
       JOIN users u ON u.user_id = d.user_id`,
      [hash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Verify user is active and session has not expired
    if (!row.is_active) {
      return null;
    }

    if (new Date(row.session_expires_at).getTime() <= Date.now()) {
      return null;
    }

    return {
      userId: parseInt(String(row.user_id), 10),
      username: row.username,
      email: row.email,
      role: row.role as UserRole,
      accountId: row.account_id ? parseInt(String(row.account_id), 10) : undefined,
      sessionId: String(row.session_id)
    };
  }
}

export const wsTicketManager = WsTicketManager.getInstance();
