import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer, IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { AuthTokenPayload } from './types';
import { JWT_SECRET } from './middleware/auth';
import { wsTicketManager } from './services/wsTicketManager';

export interface MarketBroadcastPayload {
  type: 'BOOK_UPDATE' | 'TRADE_TICK' | 'SURVEILLANCE_ALERT' | 'ORDER_UPDATE';
  data: unknown;
  timestamp: string;
}

export interface AuthenticatedWebSocket extends WebSocket {
  user?: AuthTokenPayload;
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

function authenticateToken(tokenStr: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(tokenStr, JWT_SECRET) as AuthTokenPayload;
    return decoded;
  } catch {
    return null;
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

  console.log('[WS] Authenticated WebSocket server initialized on path /ws');

  wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    ws.isAlive = true;

    // Check query string for short-lived ticket (?ticket=...) or legacy token (?token=...)
    try {
      const parsedUrl = new URL(req.url || '', 'http://localhost');
      const ticketQuery = parsedUrl.searchParams.get('ticket');
      const tokenQuery = parsedUrl.searchParams.get('token');

      if (ticketQuery && ticketQuery.length > 0) {
        const user = wsTicketManager.consumeTicket(ticketQuery);
        if (user) {
          ws.user = user;
          console.log(`[WS] Client authenticated via single-use ticket: ${user.username} (${user.role})`);
        }
      } else if (tokenQuery && tokenQuery.length > 0) {
        const user = authenticateToken(tokenQuery);
        if (user) {
          ws.user = user;
          console.log(`[WS] Client authenticated via token query param: ${user.username} (${user.role})`);
        }
      }
    } catch {
      // Ignore invalid URL
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

    ws.on('message', (message: string) => {
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
          const user = wsTicketManager.consumeTicket(parsed.ticket);
          if (user) {
            ws.user = user;
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

        // Authenticate via JWT frame
        if (parsed.type === 'AUTH') {
          if (!parsed.token || typeof parsed.token !== 'string') {
            ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'Missing or invalid token string' }));
            return;
          }
          const user = authenticateToken(parsed.token);
          if (user) {
            ws.user = user;
            console.log(`[WS] Socket authenticated via message frame: ${user.username} (${user.role})`);
            ws.send(JSON.stringify({
              type: 'AUTH_SUCCESS',
              userId: user.userId,
              username: user.username,
              role: user.role,
              accountId: user.accountId,
              timestamp: new Date().toISOString()
            }));
          } else {
            ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'Invalid or expired token' }));
          }
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
