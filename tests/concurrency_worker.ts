import { getDatabase, closeDatabase } from '../database/db';
import { TradingService, PlaceOrderInput } from '../backend/services/tradingService';

interface WorkerMessage {
  id: string;
  action: 'SUBMIT_ORDER' | 'CANCEL_ORDER' | 'PING' | 'EXIT';
  input?: PlaceOrderInput;
  orderId?: number;
  accountId?: number;
  adminAudit?: { actorUserId: number; reason: string };
}

process.on('message', async (msg: WorkerMessage) => {
  try {
    if (msg.action === 'SUBMIT_ORDER' && msg.input) {
      const result = await TradingService.submitOrder(msg.input);
      process.send!({ id: msg.id, success: true, result });
    } else if (msg.action === 'CANCEL_ORDER' && msg.orderId && msg.accountId) {
      const result = await TradingService.cancelOrder(msg.orderId, msg.accountId, msg.adminAudit);
      process.send!({ id: msg.id, success: true, result });
    } else if (msg.action === 'PING') {
      await getDatabase();
      process.send!({ id: msg.id, success: true });
    } else if (msg.action === 'EXIT') {
      await closeDatabase();
      process.exit(0);
    }
  } catch (err: any) {
    const statusCode = err?.statusCode || (err?.message?.includes('Forbidden') ? 403 : 400);
    process.send!({
      id: msg.id,
      success: false,
      error: err.message || String(err),
      statusCode
    });
  }
});

// Notify parent that worker process is running and connected
process.send!({ action: 'READY', pid: process.pid });
