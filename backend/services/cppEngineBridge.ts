import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { OrderSide, OrderType } from '../types';

export interface CppEngineTrade {
  engineSeq: number;
  instrumentId: number;
  buyOrderId: number;
  sellOrderId: number;
  buyerAccountId: number;
  sellerAccountId: number;
  price: number;
  quantity: number;
  aggressorSide: OrderSide;
}

export interface CppEngineOrderResult {
  orderId: number;
  status: string;
  filledQty: number;
  trades: CppEngineTrade[];
}

export interface CppBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

export interface CppBookSnapshot {
  instrumentId: number;
  bids: CppBookLevel[];
  asks: CppBookLevel[];
}

interface PendingOrderRequest {
  resolve: (data: CppEngineOrderResult) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  expectedTrades: number;
  buffer: string[];
}

interface PendingCancelRequest {
  resolve: (data: boolean) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface PendingSnapshotRequest {
  resolve: (data: CppBookSnapshot) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  expectedBids: number;
  expectedAsks: number;
  buffer: string[];
}

export class CppEngineBridge {
  private static instance: CppEngineBridge | null = null;
  private process: ChildProcess | null = null;
  private ready: boolean = false;

  // Correlation maps to eliminate head-of-line response desynchronization
  private pendingOrders: Map<number, PendingOrderRequest> = new Map();
  private pendingCancels: Map<number, PendingCancelRequest> = new Map();
  private pendingSnapshots: Map<number, PendingSnapshotRequest> = new Map();

  private constructor() {
    this.spawnEngine();
  }

  public static getInstance(): CppEngineBridge {
    if (!CppEngineBridge.instance) {
      CppEngineBridge.instance = new CppEngineBridge();
    }
    return CppEngineBridge.instance;
  }

  public isAvailable(): boolean {
    return this.ready && this.process !== null && !this.process.killed;
  }

  public async waitForReady(timeoutMs: number = 8000): Promise<boolean> {
    if (this.isAvailable()) return true;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.isAvailable()) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return this.isAvailable();
  }

  private spawnEngine() {
    const isWindows = process.platform === 'win32';
    const projectRoot = path.resolve(__dirname, '..', '..');
    const engineBinWindows = path.join(projectRoot, 'engine', 'meridian_engine.exe');
    const engineBinLinux = path.join(projectRoot, 'engine', 'meridian_engine');

    try {
      if (isWindows) {
        if (fs.existsSync(engineBinWindows)) {
          // Native Windows binary detected
          this.process = spawn(engineBinWindows, [], { cwd: projectRoot });
        } else {
          // Fall back to WSL executing Linux binary
          const wslPath = projectRoot.replace(/^[A-Za-z]:/, (match) => `/mnt/${match[0].toLowerCase()}`).replace(/\\/g, '/');
          const cmd = `cd ${wslPath} && ./engine/meridian_engine`;
          this.process = spawn('wsl', ['-e', 'bash', '-c', cmd]);
        }
      } else {
        if (!fs.existsSync(engineBinLinux)) {
          console.warn('[CPP_BRIDGE] Engine binary not found at:', engineBinLinux);
          return;
        }
        this.process = spawn(engineBinLinux, [], { cwd: projectRoot });
      }

      let lineBuffer = '';

      this.process.stdout?.on('data', (data: Buffer) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          this.handleEngineLine(line.trim());
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg.includes('[MERIDIAN_ENGINE]')) {
          this.ready = true;
          console.log('[CPP_BRIDGE] C++ Meridian Engine successfully connected and ready.');
        }
      });

      this.process.on('close', (code: number) => {
        console.warn(`[CPP_BRIDGE] C++ Engine process exited with code ${code}`);
        this.handleProcessTermination(new Error(`C++ Engine process exited with code ${code}`));
      });

      this.process.on('error', (err: Error) => {
        console.warn('[CPP_BRIDGE] C++ Engine process error:', err.message);
        this.handleProcessTermination(err);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[CPP_BRIDGE] Initialization error:', message);
      this.ready = false;
    }
  }

  private handleProcessTermination(err: Error) {
    this.ready = false;
    this.process = null;

    // Fail all pending promises across all correlation maps
    for (const [oid, req] of this.pendingOrders.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(`Order ${oid} failed: ${err.message}`));
    }
    this.pendingOrders.clear();

    for (const [oid, req] of this.pendingCancels.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(`Cancel ${oid} failed: ${err.message}`));
    }
    this.pendingCancels.clear();

    for (const [iid, req] of this.pendingSnapshots.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(`Snapshot ${iid} failed: ${err.message}`));
    }
    this.pendingSnapshots.clear();
  }

  private handleEngineLine(line: string) {
    if (!line || line.startsWith('#')) return;

    // 1. ORDER ACK or REJECT: ACK <order_id> <status> <filled_qty> <trade_count>
    if (line.startsWith('ACK ') || line.startsWith('REJECT ')) {
      const parts = line.split(' ');
      const orderId = parseInt(parts[1], 10);
      const req = this.pendingOrders.get(orderId);
      if (req) {
        req.buffer.push(line);
        const expectedTrades = parseInt(parts[4] || '0', 10);
        req.expectedTrades = expectedTrades;

        if (expectedTrades === 0 || line.startsWith('REJECT')) {
          clearTimeout(req.timer);
          this.pendingOrders.delete(orderId);
          req.resolve(this.parseOrderResult(req.buffer));
        }
      }
      return;
    }

    // 2. ORDER TRADE: TRADE <engine_seq> <instrument_id> <buy_order_id> <sell_order_id> ...
    if (line.startsWith('TRADE ')) {
      const parts = line.split(' ');
      const buyOrderId = parseInt(parts[3], 10);
      const sellOrderId = parseInt(parts[4], 10);

      // Associate trade line with either the aggressor order request
      const req = this.pendingOrders.get(buyOrderId) || this.pendingOrders.get(sellOrderId);
      if (req) {
        req.buffer.push(line);
        const actualTrades = req.buffer.filter(l => l.startsWith('TRADE ')).length;
        if (actualTrades >= req.expectedTrades && req.expectedTrades > 0) {
          clearTimeout(req.timer);
          const oid = this.pendingOrders.has(buyOrderId) ? buyOrderId : sellOrderId;
          this.pendingOrders.delete(oid);
          req.resolve(this.parseOrderResult(req.buffer));
        }
      }
      return;
    }

    // 3. CANCELLED or CANCEL_REJECTED: CANCELLED <order_id> / CANCEL_REJECTED <order_id>
    if (line.startsWith('CANCELLED ') || line.startsWith('CANCEL_REJECTED ')) {
      const parts = line.split(' ');
      const orderId = parseInt(parts[1], 10);
      const req = this.pendingCancels.get(orderId);
      if (req) {
        clearTimeout(req.timer);
        this.pendingCancels.delete(orderId);
        req.resolve(line.startsWith('CANCELLED'));
      }
      return;
    }

    // 4. SNAPSHOT Header: SNAPSHOT <instrument_id> BIDS:<b_size> ASKS:<a_size>
    if (line.startsWith('SNAPSHOT ')) {
      const parts = line.split(' ');
      const instrumentId = parseInt(parts[1], 10);
      const req = this.pendingSnapshots.get(instrumentId);
      if (req) {
        const bidsPart = parts[2] || 'BIDS:0';
        const asksPart = parts[3] || 'ASKS:0';
        req.expectedBids = parseInt(bidsPart.replace('BIDS:', ''), 10) || 0;
        req.expectedAsks = parseInt(asksPart.replace('ASKS:', ''), 10) || 0;
        req.buffer.push(line);

        if (req.expectedBids === 0 && req.expectedAsks === 0) {
          clearTimeout(req.timer);
          this.pendingSnapshots.delete(instrumentId);
          req.resolve(this.parseSnapshot(instrumentId, req.buffer));
        }
      }
      return;
    }

    // 5. SNAPSHOT Level lines: "  BID <price> <qty> (<count>)" or "  ASK <price> <qty> (<count>)"
    if (line.startsWith('BID ') || line.startsWith('ASK ') || line.startsWith('  BID') || line.startsWith('  ASK')) {
      for (const [iid, req] of this.pendingSnapshots.entries()) {
        req.buffer.push(line.trim());
        const bidCount = req.buffer.filter(l => l.startsWith('BID')).length;
        const askCount = req.buffer.filter(l => l.startsWith('ASK')).length;
        if (bidCount >= req.expectedBids && askCount >= req.expectedAsks) {
          clearTimeout(req.timer);
          this.pendingSnapshots.delete(iid);
          req.resolve(this.parseSnapshot(iid, req.buffer));
          break;
        }
      }
    }
  }

  private parseOrderResult(lines: string[]): CppEngineOrderResult {
    const ack = lines.find(l => l.startsWith('ACK ') || l.startsWith('REJECT '));
    if (!ack) {
      throw new Error('Invalid engine response: no ACK or REJECT found');
    }

    const parts = ack.split(' ');
    const orderId = parseInt(parts[1], 10);
    const status = parts[2];
    const filledQty = parseInt(parts[3] || '0', 10);

    const trades: CppEngineTrade[] = [];
    for (const line of lines) {
      if (line.startsWith('TRADE ')) {
        const t = line.split(' ');
        trades.push({
          engineSeq: parseInt(t[1], 10),
          instrumentId: parseInt(t[2], 10),
          buyOrderId: parseInt(t[3], 10),
          sellOrderId: parseInt(t[4], 10),
          buyerAccountId: parseInt(t[5], 10),
          sellerAccountId: parseInt(t[6], 10),
          price: parseFloat(t[7]),
          quantity: parseInt(t[8], 10),
          aggressorSide: t[9] as OrderSide
        });
      }
    }

    return { orderId, status, filledQty, trades };
  }

  private parseSnapshot(instrumentId: number, buffer: string[]): CppBookSnapshot {
    const bids: CppBookLevel[] = [];
    const asks: CppBookLevel[] = [];

    for (const line of buffer) {
      const trimmed = line.trim();
      if (trimmed.startsWith('BID ')) {
        const parts = trimmed.split(' ');
        bids.push({
          price: parseFloat(parts[1]),
          quantity: parseInt(parts[2], 10),
          orderCount: parseInt((parts[3] || '(1)').replace(/[()]/g, ''), 10) || 1
        });
      } else if (trimmed.startsWith('ASK ')) {
        const parts = trimmed.split(' ');
        asks.push({
          price: parseFloat(parts[1]),
          quantity: parseInt(parts[2], 10),
          orderCount: parseInt((parts[3] || '(1)').replace(/[()]/g, ''), 10) || 1
        });
      }
    }

    return { instrumentId, bids, asks };
  }

  public async submitOrder(params: {
    orderId: number;
    accountId: number;
    instrumentId: number;
    side: OrderSide;
    orderType: OrderType;
    price: number;
    quantity: number;
  }): Promise<CppEngineOrderResult> {
    if (!this.isAvailable()) {
      throw new Error('C++ Matching Engine is not currently running');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingOrders.delete(params.orderId);
        reject(new Error(`Timeout waiting for C++ engine response for order ${params.orderId}`));
      }, 5000);

      this.pendingOrders.set(params.orderId, {
        resolve,
        reject,
        timer,
        expectedTrades: 0,
        buffer: []
      });

      const cmd = `ORDER ${params.orderId} ${params.accountId} ${params.instrumentId} ${params.side} ${params.orderType} ${params.price} ${params.quantity}\n`;
      this.process!.stdin?.write(cmd);
    });
  }

  public async cancelOrder(orderId: number, instrumentId: number): Promise<boolean> {
    if (!this.isAvailable()) {
      throw new Error('C++ Matching Engine is not currently running');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCancels.delete(orderId);
        reject(new Error(`Timeout waiting for C++ engine cancel response for order ${orderId}`));
      }, 5000);

      this.pendingCancels.set(orderId, { resolve, reject, timer });
      const cmd = `CANCEL ${orderId} ${instrumentId}\n`;
      this.process!.stdin?.write(cmd);
    });
  }

  public async getSnapshot(instrumentId: number): Promise<CppBookSnapshot> {
    if (!this.isAvailable()) {
      throw new Error('C++ Matching Engine is not currently running');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSnapshots.delete(instrumentId);
        reject(new Error(`Timeout waiting for C++ engine snapshot for instrument ${instrumentId}`));
      }, 5000);

      this.pendingSnapshots.set(instrumentId, {
        resolve,
        reject,
        timer,
        expectedBids: 0,
        expectedAsks: 0,
        buffer: []
      });

      const cmd = `SNAPSHOT ${instrumentId}\n`;
      this.process!.stdin?.write(cmd);
    });
  }

  public shutdown() {
    if (this.process) {
      try {
        this.process.stdin?.write('QUIT\n');
        this.process.stdin?.end();
      } catch {
        // ignore write error on closing
      }

      this.process.kill();
      this.process = null;
      this.ready = false;
      CppEngineBridge.instance = null;
    }
  }
}
