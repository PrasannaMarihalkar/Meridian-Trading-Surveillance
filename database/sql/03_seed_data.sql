-- ============================================================================
-- MERIDIAN — PRODUCTION SEED DATA
-- Realistic Deterministic Market Data, Users, Orders, Trades & Surveillance
-- ============================================================================

-- Users: Traders, Compliance Analysts, and System Administrators
-- Password for all demo accounts is 'Password123!' (bcrypt hash below)
INSERT INTO users (user_id, email, username, password_hash, role, is_active, failed_logins, last_login_at, created_at) VALUES
(101, 'prasanna@meridian.internal', 'prasanna_trader', '$2b$10$7QlrqW9o3nnVMyXBeI82WesAjib/ACpDAjyrykCtpMvZmDZFG.9DK', 'TRADER', TRUE, 0, '2026-11-17 08:30:00+05:30', '2026-09-01 09:00:00+05:30'),
(102, 'asha.compliance@meridian.internal', 'asha_analyst', '$2b$10$7QlrqW9o3nnVMyXBeI82WesAjib/ACpDAjyrykCtpMvZmDZFG.9DK', 'ANALYST', TRUE, 0, '2026-11-17 08:15:00+05:30', '2026-09-01 09:00:00+05:30'),
(103, 'admin@meridian.internal', 'sys_admin', '$2b$10$7QlrqW9o3nnVMyXBeI82WesAjib/ACpDAjyrykCtpMvZmDZFG.9DK', 'ADMIN', TRUE, 0, '2026-11-17 08:00:00+05:30', '2026-09-01 09:00:00+05:30'),
(104, 'rahul.deshmukh@meridian.internal', 'rahul_marketmaker', '$2b$10$7QlrqW9o3nnVMyXBeI82WesAjib/ACpDAjyrykCtpMvZmDZFG.9DK', 'TRADER', TRUE, 0, '2026-11-17 08:45:00+05:30', '2026-09-02 10:00:00+05:30'),
(105, 'vikram.hft@meridian.internal', 'vikram_algo', '$2b$10$7QlrqW9o3nnVMyXBeI82WesAjib/ACpDAjyrykCtpMvZmDZFG.9DK', 'TRADER', TRUE, 0, '2026-11-17 08:50:00+05:30', '2026-09-03 11:00:00+05:30')
ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Sessions: Initial valid active sessions
INSERT INTO sessions (session_id, user_id, created_at, expires_at, ip_address, user_agent) VALUES
('11111111-1111-4111-8111-111111111111', 101, '2026-11-17 08:30:00+05:30', '2026-11-17 18:30:00+05:30', '192.168.1.10', 'MeridianTrader/1.0 (Windows NT 10.0; Win64; x64)'),
('22222222-2222-4222-8222-222222222222', 102, '2026-11-17 08:15:00+05:30', '2026-11-17 18:15:00+05:30', '192.168.1.20', 'MeridianSurveillance/1.0 (Linux x86_64)'),
('33333333-3333-4333-8333-333333333333', 103, '2026-11-17 08:00:00+05:30', '2026-11-17 18:00:00+05:30', '127.0.0.1', 'MeridianAdminConsole/1.0')
ON CONFLICT (session_id) DO NOTHING;

-- Trading Accounts
INSERT INTO accounts (account_id, user_id, owner_role, cash_balance, created_at) VALUES
(1001, 101, 'TRADER', 500000.0000, '2026-09-01 09:30:00+05:30'),
(1002, 104, 'TRADER', 2500000.0000, '2026-09-02 10:30:00+05:30'),
(1003, 105, 'TRADER', 1000000.0000, '2026-09-03 11:30:00+05:30')
ON CONFLICT (account_id) DO NOTHING;

-- Risk Limits for Trading Accounts
INSERT INTO risk_limits (account_id, max_order_qty, max_order_notional, max_position_qty, max_open_orders, price_collar_pct, updated_at) VALUES
(1001, 500, 1000000.0000, 2000, 20, 5.00, '2026-10-01 09:00:00+05:30'),
(1002, 5000, 10000000.0000, 25000, 100, 3.00, '2026-10-01 09:00:00+05:30'),
(1003, 2000, 5000000.0000, 10000, 50, 4.00, '2026-10-01 09:00:00+05:30')
ON CONFLICT (account_id) DO NOTHING;

-- Tradable Instruments
INSERT INTO instruments (instrument_id, symbol, name, tick_size, min_price, max_price, reference_price, lot_size, is_active, created_at, sector) VALUES
(1, 'RELIANCE', 'Reliance Industries Limited', 0.0500, 100.0000, 5000.0000, 1400.0000, 1, TRUE, '2026-09-01 09:00:00+05:30', 'Energy'),
(2, 'TCS', 'Tata Consultancy Services Ltd', 0.0500, 100.0000, 8000.0000, 3200.0000, 1, TRUE, '2026-09-01 09:00:00+05:30', 'Information Technology'),
(3, 'INFY', 'Infosys Limited', 0.0500, 50.0000, 4000.0000, 1500.0000, 1, TRUE, '2026-09-01 09:00:00+05:30', 'Information Technology'),
(4, 'HDFCBANK', 'HDFC Bank Limited', 0.0500, 50.0000, 3000.0000, 1650.0000, 1, TRUE, '2026-09-01 09:00:00+05:30', 'Financial Services'),
(5, 'ICICIBANK', 'ICICI Bank Limited', 0.0500, 50.0000, 2500.0000, 1150.0000, 1, TRUE, '2026-09-01 09:00:00+05:30', 'Financial Services')
ON CONFLICT (instrument_id) DO NOTHING;

-- Orders
INSERT INTO orders (order_id, client_order_id, account_id, instrument_id, side, order_type, time_in_force, price, quantity, filled_qty, status, status_reason, submitted_at, updated_at, cancel_requested_at) VALUES
(5001, '50000000-0000-4000-8000-000000000001', 1001, 1, 'BUY', 'LIMIT', 'DAY', 1400.0000, 100, 100, 'FILLED', 'Fully matched', '2026-11-17 09:15:00+05:30', '2026-11-17 09:15:01+05:30', NULL),
(5002, '50000000-0000-4000-8000-000000000002', 1002, 1, 'SELL', 'LIMIT', 'DAY', 1400.0000, 100, 100, 'FILLED', 'Fully matched', '2026-11-17 09:15:00+05:30', '2026-11-17 09:15:01+05:30', NULL),
(5003, '50000000-0000-4000-8000-000000000003', 1001, 2, 'BUY', 'LIMIT', 'GTC', 3200.0000, 50, 20, 'PARTIALLY_FILLED', 'Partially matched against resting order', '2026-11-17 09:20:00+05:30', '2026-11-17 09:20:02+05:30', NULL),
(5004, '50000000-0000-4000-8000-000000000004', 1002, 2, 'SELL', 'LIMIT', 'GTC', 3200.0000, 20, 20, 'FILLED', 'Fully matched', '2026-11-17 09:20:01+05:30', '2026-11-17 09:20:02+05:30', NULL),
(5005, '50000000-0000-4000-8000-000000000005', 1001, 3, 'BUY', 'LIMIT', 'DAY', 1495.0000, 75, 0, 'OPEN', 'Rests on order book at bid level 1', '2026-11-17 09:25:00+05:30', '2026-11-17 09:25:00+05:30', NULL),
(5006, '50000000-0000-4000-8000-000000000006', 1002, 3, 'SELL', 'LIMIT', 'DAY', 1505.0000, 100, 0, 'OPEN', 'Rests on order book at ask level 1', '2026-11-17 09:25:05+05:30', '2026-11-17 09:25:05+05:30', NULL),
(5007, '50000000-0000-4000-8000-000000000007', 1003, 1, 'BUY', 'LIMIT', 'DAY', 1395.0000, 500, 0, 'CANCELLED', 'Rapidly cancelled prior to match (spoof probe)', '2026-11-17 09:30:00+05:30', '2026-11-17 09:30:00.120+05:30', '2026-11-17 09:30:00.115+05:30')
ON CONFLICT (order_id) DO NOTHING;

-- Trades
INSERT INTO trades (trade_id, engine_seq, instrument_id, executed_at, price, quantity, buy_order_id, sell_order_id, buyer_account_id, seller_account_id, aggressor_side) VALUES
(9001, 700001, 1, '2026-11-17 09:15:01+05:30', 1400.0000, 100, 5001, 5002, 1001, 1002, 'BUY'),
(9002, 700002, 2, '2026-11-17 09:20:02+05:30', 3200.0000, 20, 5003, 5004, 1001, 1002, 'BUY')
ON CONFLICT (trade_id) DO NOTHING;

-- Fills: Exact side-specific records (1 BUY fill and 1 SELL fill per trade)
INSERT INTO fills (fill_id, trade_id, order_id, account_id, instrument_id, side, price, quantity, cash_delta, realized_pnl, executed_at) VALUES
(9101, 9001, 5001, 1001, 1, 'BUY', 1400.0000, 100, -140000.0000, 0.0000, '2026-11-17 09:15:01+05:30'),
(9102, 9001, 5002, 1002, 1, 'SELL', 1400.0000, 100, 140000.0000, 5000.0000, '2026-11-17 09:15:01+05:30'),
(9103, 9002, 5003, 1001, 2, 'BUY', 3200.0000, 20, -64000.0000, 0.0000, '2026-11-17 09:20:02+05:30'),
(9104, 9002, 5004, 1002, 2, 'SELL', 3200.0000, 20, 64000.0000, 1200.0000, '2026-11-17 09:20:02+05:30')
ON CONFLICT (fill_id) DO NOTHING;

-- Positions
INSERT INTO positions (account_id, instrument_id, net_qty, avg_cost, realized_pnl, updated_at) VALUES
(1001, 1, 100, 1400.000000, 0.0000, '2026-11-17 09:15:01+05:30'),
(1001, 2, 20, 3200.000000, 0.0000, '2026-11-17 09:20:02+05:30'),
(1002, 1, -100, 1350.000000, 5000.0000, '2026-11-17 09:15:01+05:30'),
(1002, 2, -20, 3140.000000, 1200.0000, '2026-11-17 09:20:02+05:30')
ON CONFLICT (account_id, instrument_id) DO NOTHING;

-- Watchlists
INSERT INTO watchlists (user_id, instrument_id, added_at) VALUES
(101, 1, '2026-11-01 09:00:00+05:30'),
(101, 2, '2026-11-01 09:05:00+05:30'),
(101, 3, '2026-11-01 09:10:00+05:30'),
(104, 1, '2026-11-02 09:00:00+05:30'),
(104, 4, '2026-11-02 09:15:00+05:30')
ON CONFLICT (user_id, instrument_id) DO NOTHING;

-- Surveillance Feature Normalization Metadata
INSERT INTO surveillance_feature_stats (position, feature_name, log_transform, mean, stddev) VALUES
(1, 'order_cancel_ratio', FALSE, 0.3500, 0.2200),
(2, 'quote_to_trade_ratio', TRUE, 4.5000, 2.1000),
(3, 'median_lifetime_ms', TRUE, 600.0000, 250.0000),
(4, 'size_skew', FALSE, 0.8000, 0.3500),
(5, 'msg_rate_per_s', TRUE, 20.0000, 12.0000),
(6, 'book_imbalance_impact', FALSE, 0.3000, 0.2000),
(7, 'opposite_side_fill_ratio', FALSE, 0.4000, 0.2500),
(8, 'layering_depth', FALSE, 1.5000, 0.9000)
ON CONFLICT (position) DO NOTHING;

-- Surveillance Patterns (Abuse Signatures)
INSERT INTO surveillance_patterns (pattern_id, name, description, embedding, created_at) VALUES
(1, 'Rapid Spoofing & Cancellation', 'Repeated entry of non-bona-fide orders cancelled within sub-200ms to manipulate opposite quote.', ARRAY[0.92, 22.0, 115.0, 1.35, 48.0, 0.75, 0.05, 3.2]::DOUBLE PRECISION[], '2026-09-15 10:00:00+05:30'),
(2, 'Multi-Level Layering Pattern', 'Submission of multiple layered orders across order book depth to generate false liquidity signal.', ARRAY[0.78, 14.0, 180.0, 2.10, 38.0, 0.82, 0.18, 4.5]::DOUBLE PRECISION[], '2026-09-16 10:00:00+05:30'),
(3, 'Quote Stuffing Velocity Burst', 'Extremely high messaging rate designed to saturate engine pipeline and delay competitor quotes.', ARRAY[0.88, 35.0, 80.0, 0.40, 95.0, 0.45, 0.02, 1.1]::DOUBLE PRECISION[], '2026-09-17 10:00:00+05:30'),
(4, 'Normal Market Making Benchmark', 'Balanced two-sided quotation with continuous inventory turnover and stable order lifetime.', ARRAY[0.22, 2.8, 1200.0, 0.15, 6.5, 0.10, 0.48, 0.2]::DOUBLE PRECISION[], '2026-09-18 10:00:00+05:30')
ON CONFLICT (pattern_id) DO NOTHING;

-- Surveillance Sessions (Aggregated 30-min windows)
INSERT INTO surveillance_sessions (session_id, account_id, instrument_id, window_start, window_end, orders_placed, orders_canceled, trades_executed, order_cancel_ratio, quote_to_trade_ratio, median_lifetime_ms, size_skew, msg_rate_per_s, book_imbalance_impact, opposite_side_fill_ratio, layering_depth, features, label, created_at) VALUES
(7001, 1003, 1, '2026-11-17 09:00:00+05:30', '2026-11-17 09:30:00+05:30', 45, 42, 1, 0.933333, 45.0000, 110.000, 1.4000, 52.0000, 0.780000, 0.040000, 3.400, ARRAY[0.93, 45.0, 110.0, 1.4, 52.0, 0.78, 0.04, 3.4]::DOUBLE PRECISION[], 'SUSPECTED_SPOOFING', '2026-11-17 09:31:00+05:30'),
(7002, 1002, 2, '2026-11-17 09:00:00+05:30', '2026-11-17 09:30:00+05:30', 25, 6, 8, 0.240000, 3.1250, 1150.000, 0.1800, 8.2000, 0.120000, 0.450000, 0.100, ARRAY[0.24, 3.1, 1150.0, 0.18, 8.2, 0.12, 0.45, 0.1]::DOUBLE PRECISION[], 'NORMAL_ACTIVITY', '2026-11-17 09:31:00+05:30'),
(7003, 1003, 3, '2026-11-17 09:30:00+05:30', '2026-11-17 10:00:00+05:30', 38, 30, 2, 0.789474, 19.0000, 175.000, 2.0500, 36.5000, 0.810000, 0.150000, 4.300, ARRAY[0.79, 19.0, 175.0, 2.05, 36.5, 0.81, 0.15, 4.3]::DOUBLE PRECISION[], 'SUSPECTED_LAYERING', '2026-11-17 10:01:00+05:30')
ON CONFLICT (session_id) DO NOTHING;

-- Alerts
INSERT INTO alerts (alert_id, session_id, pattern_id, similarity, rule_flags, severity, status, assigned_to, created_at, resolved_at) VALUES
(8001, 7001, 1, 0.9785, ARRAY['HIGH_CANCEL_RATIO', 'ULTRA_SHORT_ORDER_LIFETIME', 'HEAVY_BOOK_IMBALANCE'], 'CRITICAL', 'IN_REVIEW', 102, '2026-11-17 09:31:05+05:30', NULL),
(8002, 7003, 2, 0.9420, ARRAY['MULTI_LEVEL_LAYERING', 'ASYMMETRIC_SIZE_SKEW'], 'HIGH', 'OPEN', NULL, '2026-11-17 10:01:05+05:30', NULL)
ON CONFLICT (alert_id) DO NOTHING;

-- Alert Notes
INSERT INTO alert_notes (note_id, alert_id, author_id, body, body_tsv, created_at) VALUES
(8101, 8001, 102, 'Initial review confirms Account 1003 placed 45 orders with 42 cancellations in 30 minutes on RELIANCE. Median lifetime is 110ms with aggressive book imbalance impact of 0.78. Flagged for full regulatory audit and possible account freeze.', to_tsvector('english', 'Initial review confirms Account 1003 placed 45 orders with 42 cancellations in 30 minutes on RELIANCE. Median lifetime is 110ms with aggressive book imbalance impact of 0.78. Flagged for full regulatory audit and possible account freeze.'), '2026-11-17 09:40:00+05:30')
ON CONFLICT (note_id) DO NOTHING;

-- Audit Log
INSERT INTO audit_log (audit_id, occurred_at, actor_user_id, action, entity_type, entity_id, old_data, new_data) VALUES
(9901, '2026-11-17 09:15:01+05:30', 101, 'ORDER_FILLED', 'orders', '5001', '{"status": "OPEN", "filled_qty": 0}'::jsonb, '{"status": "FILLED", "filled_qty": 100}'::jsonb),
(9902, '2026-11-17 09:20:02+05:30', 101, 'ORDER_PARTIALLY_FILLED', 'orders', '5003', '{"status": "OPEN", "filled_qty": 0}'::jsonb, '{"status": "PARTIALLY_FILLED", "filled_qty": 20}'::jsonb),
(9903, '2026-11-17 09:31:05+05:30', NULL, 'ALERT_GENERATED', 'alerts', '8001', NULL, '{"severity": "CRITICAL", "similarity": 0.9785, "pattern_id": 1}'::jsonb),
(9904, '2026-11-17 09:35:00+05:30', 102, 'ALERT_ASSIGNED', 'alerts', '8001', '{"assigned_to": null, "status": "OPEN"}'::jsonb, '{"assigned_to": 102, "status": "IN_REVIEW"}'::jsonb)
ON CONFLICT (audit_id) DO NOTHING;

-- Engine Offsets
INSERT INTO engine_offsets (consumer, last_seq, updated_at) VALUES
('trade_projection_service', 700002, '2026-11-17 09:20:05+05:30'),
('market_data_broadcaster', 700002, '2026-11-17 09:20:05+05:30'),
('surveillance_stream_consumer', 700002, '2026-11-17 10:01:10+05:30')
ON CONFLICT (consumer) DO NOTHING;
