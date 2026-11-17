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

export class CppEngineBridge {
  private static instance: CppEngineBridge | null = null;
  private process: ChildProcess | null = null;
  private ready: boolean = false;
  private requestQueue: Array<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolve: (data: any) => void;
    reject: (err: Error) => void;
    expectedType: string;
    buffer: string[];
  }> = [];

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

  public async waitForReady(timeoutMs: number = 4000): Promise<boolean> {
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
    const engineBinLinux = path.join(projectRoot, 'engine', 'meridian_engine');

    try {
      if (isWindows) {
        // Convert Windows path to WSL path for Linux binary
        const wslPath = projectRoot.replace(/^[A-Za-z]:/, (match) => `/mnt/${match[0].toLowerCase()}`).replace(/\\/g, '/');
        const cmd = `cd ${wslPath} && ./engine/meridian_engine`;
        this.process = spawn('wsl', ['-e', 'bash', '-c', cmd]);
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
        this.ready = false;
        this.process = null;
      });

      this.process.on('error', (err: Error) => {
        console.warn('[CPP_BRIDGE] Failed to spawn C++ Engine process:', err.message);
        this.ready = false;
        this.process = null;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[CPP_BRIDGE] Initialization error:', message);
      this.ready = false;
    }
  }

  private handleEngineLine(line: string) {
    if (!line || line.startsWith('#')) return;

    const current = this.requestQueue[0];
    if (!current) return;

    if (line.startsWith('ACK ') || line.startsWith('REJECT ')) {
      current.buffer.push(line);
      const parts = line.split(' ');
      const tradeCount = parseInt(parts[4] || '0', 10);
      if (tradeCount === 0 || line.startsWith('REJECT')) {
        this.requestQueue.shift();
        current.resolve(this.parseOrderResult(current.buffer));
      }
    } else if (line.startsWith('TRADE ')) {
      current.buffer.push(line);
      const ackLine = current.buffer.find(l => l.startsWith('ACK '));
      if (ackLine) {
        const parts = ackLine.split(' ');
        const expectedTrades = parseInt(parts[4] || '0', 10);
        const actualTrades = current.buffer.filter(l => l.startsWith('TRADE ')).length;
        if (actualTrades >= expectedTrades) {
          this.requestQueue.shift();
          current.resolve(this.parseOrderResult(current.buffer));
        }
      }
    } else if (line.startsWith('CANCELLED ') || line.startsWith('CANCEL_REJECTED ')) {
      this.requestQueue.shift();
      current.resolve(line.startsWith('CANCELLED'));
    } else if (line.startsWith('SNAPSHOT ')) {
      current.buffer.push(line);
      // Wait for next tick or parse on snapshot completion
      this.requestQueue.shift();
      current.resolve(this.parseSnapshot(line, current.buffer));
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

  private parseSnapshot(headerLine: string, _buffer: string[]): CppBookSnapshot {
    const parts = headerLine.split(' ');
    const instrumentId = parseInt(parts[1], 10);
    return {
      instrumentId,
      bids: [],
      asks: []
    };
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
      this.requestQueue.push({ resolve, reject, expectedType: 'ORDER', buffer: [] });
      const cmd = `ORDER ${params.orderId} ${params.accountId} ${params.instrumentId} ${params.side} ${params.orderType} ${params.price} ${params.quantity}\n`;
      this.process!.stdin?.write(cmd);
    });
  }

  public async cancelOrder(orderId: number, instrumentId: number): Promise<boolean> {
    if (!this.isAvailable()) {
      throw new Error('C++ Matching Engine is not currently running');
    }

    return new Promise((resolve, reject) => {
      this.requestQueue.push({ resolve, reject, expectedType: 'CANCEL', buffer: [] });
      const cmd = `CANCEL ${orderId} ${instrumentId}\n`;
      this.process!.stdin?.write(cmd);
    });
  }

  public shutdown() {
    if (this.process) {
      this.process.stdin?.write('QUIT\n');
      this.process.kill();
      this.process = null;
      this.ready = false;
    }
  }
}
