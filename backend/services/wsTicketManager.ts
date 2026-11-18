import crypto from 'crypto';
import { AuthTokenPayload } from '../types';

interface TicketEntry {
  user: AuthTokenPayload;
  expiresAt: number;
}

class WsTicketManager {
  private static instance: WsTicketManager;
  private tickets = new Map<string, TicketEntry>();

  private constructor() {
    // Periodic sweep of expired tickets every 60 seconds
    setInterval(() => {
      const now = Date.now();
      for (const [hash, entry] of this.tickets.entries()) {
        if (entry.expiresAt <= now) {
          this.tickets.delete(hash);
        }
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
   * Issue a short-lived (30s), single-use ticket for WebSocket authentication.
   * Stores only the SHA-256 hash of the ticket.
   */
  public issueTicket(user: AuthTokenPayload, ttlMs: number = 30000): string {
    const rawTicket = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(rawTicket).digest('hex');

    this.tickets.set(hash, {
      user,
      expiresAt: Date.now() + ttlMs
    });

    return rawTicket;
  }

  /**
   * Atomically consume a single-use ticket.
   * Prevents replay attacks: once verified, the ticket is instantly deleted.
   */
  public consumeTicket(rawTicket: string): AuthTokenPayload | null {
    if (!rawTicket || typeof rawTicket !== 'string') {
      return null;
    }

    const hash = crypto.createHash('sha256').update(rawTicket).digest('hex');
    const entry = this.tickets.get(hash);

    if (!entry) {
      return null;
    }

    // Single-use: delete immediately
    this.tickets.delete(hash);

    // Expiry check
    if (entry.expiresAt <= Date.now()) {
      return null;
    }

    return entry.user;
  }
}

export const wsTicketManager = WsTicketManager.getInstance();
