import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import accountRoutes from './routes/accountRoutes';
import instrumentRoutes from './routes/instrumentRoutes';
import orderRoutes from './routes/orderRoutes';
import tradeRoutes from './routes/tradeRoutes';
import surveillanceRoutes from './routes/surveillanceRoutes';
import systemRoutes from './routes/systemRoutes';
import { initWebSocketServer } from './websocket';
import { getDatabase } from '../database/db';
import { rateLimiter } from './middleware/rateLimiter';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Security & Middlewares
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Serve Static Frontend Assets
const publicPath = path.join(__dirname, '..', 'frontend', 'public');
app.use(express.static(publicPath));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.url.startsWith('/api/system/health') && !req.url.startsWith('/bundle.js')) {
      console.log(`[HTTP] ${req.method} ${req.url} -> ${_res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Rate Limiting: 30 requests/min for auth routes, 300 requests/min for general API
app.use('/api/auth/login', rateLimiter(60000, 30, 'Too many login attempts. Please wait 1 minute.'));
app.use('/api/auth/register', rateLimiter(60000, 15, 'Too many registration attempts. Please wait 1 minute.'));
app.use('/api', rateLimiter(60000, 300));

// Health aliases
app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
  res.redirect('/api/system/health');
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/instruments', instrumentRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/surveillance', surveillanceRoutes);
app.use('/api/system', systemRoutes);

// Fallback to index.html for SPA routes
app.use((req: Request, res: Response) => {
  if (req.url.startsWith('/api')) {
    res.status(404).json({ error: 'Endpoint not found' });
    return;
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Global Error Handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[SERVER_ERROR]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});

const server = http.createServer(app);
initWebSocketServer(server);

export { app, server };

if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      console.log('[BOOT] Initializing database...');
      const db = await getDatabase();
      console.log(`[BOOT] Database initialized (${db.isPGlite ? 'PGlite' : 'PostgreSQL Native'}).`);

      server.listen(PORT, () => {
        console.log(`\n================================================================`);
        console.log(`🚀 MERIDIAN API SERVER RUNNING ON http://localhost:${PORT}`);
        console.log(`📡 REAL-TIME WEBSOCKET STREAM ON ws://localhost:${PORT}/ws`);
        console.log(`🎓 PES UNIVERSITY DBMS EXPERIENTIAL LEARNING PLATFORM`);
        console.log(`================================================================\n`);
      });
    } catch (err) {
      console.error('[FATAL] Failed to start server:', err);
      process.exit(1);
    }
  })();
}
