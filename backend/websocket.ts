import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';

export interface MarketBroadcastPayload {
  type: 'BOOK_UPDATE' | 'TRADE_TICK' | 'SURVEILLANCE_ALERT';
  data: unknown;
  timestamp: string;
}

let wssInstance: WebSocketServer | null = null;

export function initWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wssInstance = wss;

  console.log('[WS] WebSocket server initialized on path /ws');

  wss.on('connection', (ws: WebSocket, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WS] Client connected from ${ip}. Total active clients: ${wss.clients.size}`);

    ws.send(JSON.stringify({
      type: 'CONNECTION_ACK',
      message: 'Connected to MERIDIAN Real-Time Exchange Stream',
      timestamp: new Date().toISOString()
    }));

    ws.on('message', (message: string) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        }
      } catch {
        // ignore non-json
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected. Total active clients: ${wss.clients.size}`);
    });
  });

  return wss;
}

export function broadcastMarketData(payload: MarketBroadcastPayload): void {
  if (!wssInstance) return;

  const msg = JSON.stringify(payload);
  for (const client of wssInstance.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}
