export type UserRole = 'TRADER' | 'ANALYST' | 'ADMIN';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'IOC';
export type TimeInForce = 'DAY' | 'GTC' | 'IOC' | 'FOK';
export type OrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'FALSE_POSITIVE';

export interface User {
  user_id: number;
  email: string;
  username: string;
  role: UserRole;
  is_active: boolean;
  failed_logins: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface AuthTokenPayload {
  userId: number;
  username: string;
  email: string;
  role: UserRole;
  accountId?: number;
}

export interface Account {
  account_id: number;
  user_id: number;
  owner_role: UserRole;
  cash_balance: number;
  created_at: string;
}

export interface RiskLimit {
  account_id: number;
  max_order_qty: number;
  max_order_notional: number;
  max_position_qty: number;
  max_open_orders: number;
  price_collar_pct: number;
  updated_at: string;
}

export interface Instrument {
  instrument_id: number;
  symbol: string;
  name: string;
  tick_size: number;
  min_price: number;
  max_price: number;
  reference_price: number;
  lot_size: number;
  is_active: boolean;
  created_at: string;
  sector: string | null;
}

export interface Order {
  order_id: number;
  client_order_id: string;
  account_id: number;
  instrument_id: number;
  side: OrderSide;
  order_type: OrderType;
  time_in_force: TimeInForce;
  price: number;
  quantity: number;
  filled_qty: number;
  status: OrderStatus;
  status_reason: string | null;
  submitted_at: string;
  updated_at: string;
  cancel_requested_at: string | null;
}

export interface Trade {
  trade_id: number;
  engine_seq: number;
  instrument_id: number;
  executed_at: string;
  price: number;
  quantity: number;
  buy_order_id: number;
  sell_order_id: number;
  buyer_account_id: number;
  seller_account_id: number;
  aggressor_side: OrderSide;
}

export interface Fill {
  fill_id: number;
  trade_id: number;
  order_id: number;
  account_id: number;
  instrument_id: number;
  side: OrderSide;
  price: number;
  quantity: number;
  cash_delta: number;
  realized_pnl: number;
  executed_at: string;
}

export interface Position {
  account_id: number;
  instrument_id: number;
  net_qty: number;
  avg_cost: number;
  realized_pnl: number;
  updated_at: string;
}

export interface SurveillanceSession {
  session_id: number;
  account_id: number;
  instrument_id: number;
  window_start: string;
  window_end: string;
  orders_placed: number;
  orders_canceled: number;
  trades_executed: number;
  order_cancel_ratio: number;
  quote_to_trade_ratio: number;
  median_lifetime_ms: number;
  size_skew: number;
  msg_rate_per_s: number;
  book_imbalance_impact: number;
  opposite_side_fill_ratio: number;
  layering_depth: number;
  features: number[];
  label: string | null;
  created_at: string;
}

export interface SurveillancePattern {
  pattern_id: number;
  name: string;
  description: string | null;
  embedding: number[];
  created_at: string;
}

export interface Alert {
  alert_id: number;
  session_id: number;
  pattern_id: number;
  similarity: number;
  rule_flags: string[];
  severity: AlertSeverity;
  status: AlertStatus;
  assigned_to: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AlertNote {
  note_id: number;
  alert_id: number;
  author_id: number;
  body: string;
  created_at: string;
}

export interface AuditLogEntry {
  audit_id: number;
  occurred_at: string;
  actor_user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}
