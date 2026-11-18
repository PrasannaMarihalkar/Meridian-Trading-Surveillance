import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer, IncomingMessage } from 'http';
import { AuthTokenPayload } from './types';
import { wsTicketManager } from './services/wsTicketManager';
import { getDatabase } from '../database/db';

export interface MarketBroadcastPayload {
  type: 'BOOK_UPDATE' | 'TRADE_TICK' | 'SURVEILLANCE_ALERT' | 'ORDER_UPDATE';
  data: unknown;
  timestamp: string;
}

export interface AuthenticatedWebSocket extends WebSocket {
  user?: AuthTokenPayload;
  sessionId?: string;
  userId?: number;
  isAlive?: boolean;
}

let wssInstance: WebSocketServer | null = null;

function isAllowedOrigin(originHeader?: string): boolean {
  if (!originHeader) return true; // Non-browser clients or direct tests
  try {
    const originUrl = new URL(originHeader);
    const host = originUrl.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    const corsEnv = process.env.CORS_ORIGIN;
    if (corsEnv && (corsEnv === '*' || corsEnv.split(',').map(s => s.trim()).includes(originHeader))) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Invalidate and close connected WebSockets associated with a specific session ID.
 */
export function revokeWsSession(sessionId: string): void {
  if (!wssInstance) return;
  for (const client of wssInstance.clients) {
    const ws = client as AuthenticatedWebSocket;
    if (ws.sessionId === sessionId) {
      try {
        ws.send(JSON.stringify({ type: 'SESSION_REVOKED', message: 'Session has been revoked or logged out' }));
        ws.close(4001, 'Session revoked');
      } catch {
        // Socket already closed
      }
    }
  }
}

/**
 * Invalidate and close connected WebSockets associated with a specific user ID.
 */
export function revokeWsUser(userId: number): void {
  if (!wssInstance) return;
  for (const client of wssInstance.clients) {
    const ws = client as AuthenticatedWebSocket;
    if (ws.userId === userId) {
      try {
        ws.send(JSON.stringify({ type: 'USER_DEACTIVATED', message: 'User account has been deactivated' }));
        ws.close(4002, 'User deactivated');
      } catch {
        // Socket already closed
      }
    }
  }
}

export function initWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info, cb) => {
      const origin = info.origin;
      if (!isAllowedOrigin(origin)) {
        cb(false, 403, 'Forbidden Origin');
      } else {
        cb(true);
      }
    }
  });
  wssInstance = wss;

  console.log('[WS] Authenticated WebSocket server initialized on path /ws (Ticket-Only Auth)');

  wss.on('connection', async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    ws.isAlive = true;

    // Check query string strictly for short-lived single-use ticket (?ticket=...)
    // Legacy ?token= parameter is intentionally rejected.
    try {
      const parsedUrl = new URL(req.url || '', 'http://localhost');
      const ticketQuery = parsedUrl.searchParams.get('ticket');

      if (ticketQuery && ticketQuery.trim().length > 0) {
        const user = await wsTicketManager.consumeTicket(ticketQuery.trim());
        if (user) {
          ws.user = user;
          ws.sessionId = user.sessionId;
          ws.userId = user.userId;
          console.log(`[WS] Client authenticated via single-use ticket: ${user.username} (${user.role})`);
        }
      }
    } catch {
      // Ignore invalid URL formatting
    }

    const ip = req.socket.remoteAddress;
    console.log(`[WS] Client connected from ${ip}. Authenticated: ${!!ws.user}. Total active clients: ${wss.clients.size}`);

    ws.send(JSON.stringify({
      type: 'CONNECTION_ACK',
      message: 'Connected to MERIDIAN Real-Time Exchange Stream',
      authenticated: !!ws.user,
      role: ws.user?.role || 'ANONYMOUS',
      timestamp: new Date().toISOString()
    }));

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (message: string) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
          return;
        }

        // Authenticate via Single-Use Ticket frame
        if (parsed.type === 'AUTH_TICKET') {
          if (!parsed.ticket || typeof parsed.ticket !== 'string') {
            ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'Missing or invalid ticket string' }));
            return;
          }
          const user = await wsTicketManager.consumeTicket(parsed.ticket);
          if (user) {
            ws.user = user;
            ws.sessionId = user.sessionId;
            ws.userId = user.userId;
            console.log(`[WS] Socket authenticated via single-use ticket: ${user.username} (${user.role})`);
            ws.send(JSON.stringify({
              type: 'AUTH_SUCCESS',
              userId: user.userId,
              username: user.username,
              role: user.role,
              accountId: user.accountId,
              timestamp: new Date().toISOString()
            }));
          } else {
            ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'Invalid, expired, or already consumed ticket' }));
          }
          return;
        }

        // Legacy AUTH frame with raw JWT is explicitly rejected
        if (parsed.type === 'AUTH') {
          ws.send(JSON.stringify({
            type: 'AUTH_ERROR',
            error: 'Direct JWT frame authentication is deprecated and disabled. Use single-use tickets via /api/auth/ws-ticket'
          }));
          return;
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected. Total active clients: ${wss.clients.size}`);
    });
  });

  // Heartbeat & Database Session Verification Loop (every 10 seconds)
  const pingInterval = setInterval(async () => {
    if (!wssInstance) return;

    // Collect active session IDs to verify in PostgreSQL
    const activeSessionIds: string[] = [];
    for (const client of wssInstance.clients) {
      const ws = client as AuthenticatedWebSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();

      if (ws.sessionId) {
        activeSessionIds.push(ws.sessionId);
      }
    }

    // Cross-process validation: verify active sessions and user status in database
    if (activeSessionIds.length > 0) {
      try {
        const db = await getDatabase();
        const res = await db.query(
          `SELECT s.session_id, u.user_id, u.role, u.is_active
           FROM sessions s
           JOIN users u ON u.user_id = s.user_id
           WHERE s.session_id = ANY($1::uuid[]) AND s.expires_at > NOW() AND u.is_active = TRUE`,
          [activeSessionIds]
        );

        const validMap = new Map<string, { role: string; is_active: boolean }>(
          res.rows.map(r => [String(r.session_id), { role: r.role, is_active: r.is_active }])
        );

        for (const client of wssInstance.clients) {
          const ws = client as AuthenticatedWebSocket;
          if (ws.sessionId) {
            const valid = validMap.get(ws.sessionId);
            if (!valid || !valid.is_active) {
              console.log(`[WS] Terminating socket due to revoked session or deactivated user: ${ws.sessionId}`);
              ws.send(JSON.stringify({ type: 'SESSION_REVOKED', message: 'Session revoked or user deactivated' }));
              ws.close(4001, 'Session revoked');
            } else if (ws.user && ws.user.role !== valid.role) {
              console.log(`[WS] Terminating socket due to altered database role: ${ws.sessionId}`);
              ws.send(JSON.stringify({ type: 'ROLE_MODIFIED', message: 'User role modified in database' }));
              ws.close(4003, 'Role modified');
            }
          }
        }
      } catch {
        // Suppress heartbeat DB check failure if DB is restarting
      }
    }
  }, 10000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  return wss;
}

/**
 * Broadcast market data or surveillance alerts with strict authorization filtering.
 * SURVEILLANCE_ALERT events are never sent to unauthenticated clients or TRADERs.
 */
export function broadcastMarketData(payload: MarketBroadcastPayload): void {
  if (!wssInstance) return;

  const isSurveillance = payload.type === 'SURVEILLANCE_ALERT';
  const msg = JSON.stringify(payload);

  for (const client of wssInstance.clients) {
    const ws = client as AuthenticatedWebSocket;
    if (ws.readyState !== WebSocket.OPEN) continue;

    // Strict Confidentiality Filter:
    // Only verified ANALYST and ADMIN sockets receive surveillance alert notifications.
    if (isSurveillance) {
      if (!ws.user || (ws.user.role !== 'ANALYST' && ws.user.role !== 'ADMIN')) {
        continue;
      }
    }

    ws.send(msg);
  }
}

export function broadcastSurveillanceAlert(alertData: unknown): void {
  broadcastMarketData({
    type: 'SURVEILLANCE_ALERT',
    data: alertData,
    timestamp: new Date().toISOString()
  });
}
