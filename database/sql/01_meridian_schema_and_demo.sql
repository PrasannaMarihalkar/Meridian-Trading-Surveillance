-- ================================================================
-- MERIDIAN - PostgreSQL DBMS mini-project demo database
-- 17 tables, sample records, and demonstration queries
--
-- IMPORTANT:
-- 1. Run this in a NEW database named meridian_demo.
-- 2. This is a standalone teaching/demo schema derived from the
--    uploaded ER diagram, not a verified copy of the original DDL.
-- 3. Custom enum labels and a few constraints are reasonable demo
--    assumptions. See README.txt before using against an existing DB.
-- ================================================================

-- -------------------------
-- 0. Custom data types
-- -------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('TRADER', 'ANALYST', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE order_side AS ENUM ('BUY', 'SELL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE order_type AS ENUM ('MARKET', 'LIMIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE time_in_force AS ENUM ('DAY', 'GTC', 'IOC', 'FOK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE alert_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE alert_status AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'FALSE_POSITIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------
-- 1. IDENTITY AND ACCOUNTS
-- -------------------------
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_logins INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address INET,
    user_agent TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
    account_id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id),
    -- The source ERD marks owner_role as an FK, but does not show its
    -- referenced entity. For this standalone demo it is stored as a role value.
    owner_role user_role NOT NULL,
    cash_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_limits (
    account_id BIGINT PRIMARY KEY REFERENCES accounts(account_id),
    max_order_qty BIGINT NOT NULL,
    max_order_notional NUMERIC(20,4) NOT NULL,
    max_position_qty BIGINT NOT NULL,
    max_open_orders INT NOT NULL,
    price_collar_pct NUMERIC(5,2) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- 2. TRADING MASTER DATA
-- -------------------------
CREATE TABLE IF NOT EXISTS instruments (
    instrument_id SMALLINT PRIMARY KEY,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tick_size NUMERIC(18,4) NOT NULL,
    min_price NUMERIC(18,4) NOT NULL,
    max_price NUMERIC(18,4) NOT NULL,
    reference_price NUMERIC(18,4) NOT NULL,
    lot_size INT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sector TEXT
);

CREATE TABLE IF NOT EXISTS orders (
    order_id BIGINT PRIMARY KEY,
    client_order_id UUID NOT NULL UNIQUE,
    account_id BIGINT NOT NULL REFERENCES accounts(account_id),
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id),
    side order_side NOT NULL,
    order_type order_type NOT NULL,
    time_in_force time_in_force NOT NULL,
    price NUMERIC(18,4) NOT NULL,
    quantity BIGINT NOT NULL CHECK (quantity > 0),
    filled_qty BIGINT NOT NULL DEFAULT 0 CHECK (filled_qty >= 0 AND filled_qty <= quantity),
    status order_status NOT NULL,
    status_reason TEXT,
    submitted_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    cancel_requested_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trades (
    trade_id BIGINT PRIMARY KEY,
    engine_seq BIGINT NOT NULL UNIQUE,
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id),
    executed_at TIMESTAMPTZ NOT NULL,
    price NUMERIC(18,4) NOT NULL,
    quantity BIGINT NOT NULL CHECK (quantity > 0),
    buy_order_id BIGINT NOT NULL REFERENCES orders(order_id),
    sell_order_id BIGINT NOT NULL REFERENCES orders(order_id),
    buyer_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
    seller_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
    aggressor_side order_side NOT NULL,
    CHECK (buy_order_id <> sell_order_id),
    CHECK (buyer_account_id <> seller_account_id)
);

CREATE TABLE IF NOT EXISTS fills (
    fill_id BIGINT PRIMARY KEY,
    trade_id BIGINT NOT NULL REFERENCES trades(trade_id),
    order_id BIGINT NOT NULL REFERENCES orders(order_id),
    account_id BIGINT NOT NULL REFERENCES accounts(account_id),
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id),
    side order_side NOT NULL,
    price NUMERIC(18,4) NOT NULL,
    quantity BIGINT NOT NULL CHECK (quantity > 0),
    cash_delta NUMERIC(20,4) NOT NULL,
    realized_pnl NUMERIC(20,4) NOT NULL DEFAULT 0,
    executed_at TIMESTAMPTZ NOT NULL,
    -- Composite uniqueness allows one BUY and one SELL fill per trade.
    UNIQUE (trade_id, side)
);

CREATE TABLE IF NOT EXISTS positions (
    account_id BIGINT NOT NULL REFERENCES accounts(account_id),
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id),
    net_qty BIGINT NOT NULL,
    avg_cost NUMERIC(18,6) NOT NULL,
    realized_pnl NUMERIC(20,4) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (account_id, instrument_id)
);

CREATE TABLE IF NOT EXISTS watchlists (
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id),
    added_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, instrument_id)
);

-- -------------------------
-- 3. SURVEILLANCE
-- -------------------------
CREATE TABLE IF NOT EXISTS surveillance_sessions (
    session_id BIGINT PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(account_id),
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id),
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    orders_placed INT NOT NULL DEFAULT 0,
    orders_canceled INT NOT NULL DEFAULT 0,
    trades_executed INT NOT NULL DEFAULT 0,
    order_cancel_ratio NUMERIC(8,6) NOT NULL DEFAULT 0,
    quote_to_trade_ratio NUMERIC(14,4) NOT NULL DEFAULT 0,
    median_lifetime_ms NUMERIC(14,3) NOT NULL DEFAULT 0,
    size_skew NUMERIC(14,4) NOT NULL DEFAULT 0,
    msg_rate_per_s NUMERIC(14,4) NOT NULL DEFAULT 0,
    book_imbalance_impact NUMERIC(8,6) NOT NULL DEFAULT 0,
    opposite_side_fill_ratio NUMERIC(8,6) NOT NULL DEFAULT 0,
    layering_depth NUMERIC(8,3) NOT NULL DEFAULT 0,
    features DOUBLE PRECISION[] NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    CHECK (window_end > window_start),
    CHECK (array_length(features, 1) = 8),
    UNIQUE (account_id, instrument_id, window_start)
);

CREATE TABLE IF NOT EXISTS surveillance_patterns (
    pattern_id SMALLINT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    embedding DOUBLE PRECISION[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CHECK (array_length(embedding, 1) = 8)
);

CREATE TABLE IF NOT EXISTS alerts (
    alert_id BIGINT PRIMARY KEY,
    session_id BIGINT NOT NULL UNIQUE REFERENCES surveillance_sessions(session_id),
    pattern_id SMALLINT NOT NULL REFERENCES surveillance_patterns(pattern_id),
    similarity DOUBLE PRECISION NOT NULL CHECK (similarity >= 0 AND similarity <= 1),
    rule_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    severity alert_severity NOT NULL,
    status alert_status NOT NULL,
    assigned_to BIGINT REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS alert_notes (
    note_id BIGINT PRIMARY KEY,
    alert_id BIGINT NOT NULL REFERENCES alerts(alert_id),
    author_id BIGINT NOT NULL REFERENCES users(user_id),
    body TEXT NOT NULL,
    body_tsv TSVECTOR,
    created_at TIMESTAMPTZ NOT NULL
);

-- -------------------------
-- 4. SYSTEM TABLES
-- -------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id BIGINT PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL,
    actor_user_id BIGINT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB
);

CREATE TABLE IF NOT EXISTS engine_offsets (
    consumer TEXT PRIMARY KEY,
    last_seq BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS surveillance_feature_stats (
    position SMALLINT PRIMARY KEY,
    feature_name TEXT NOT NULL UNIQUE,
    log_transform BOOLEAN NOT NULL DEFAULT FALSE,
    mean DOUBLE PRECISION NOT NULL,
    stddev DOUBLE PRECISION NOT NULL CHECK (stddev >= 0)
);

-- ================================================================
-- SAMPLE DATA (safe to run again: conflicts are ignored)
-- ================================================================

-- Users: two traders, one analyst, one admin.
INSERT INTO users (user_id,email,username,password_hash,role,is_active,failed_logins,last_login_at,created_at) VALUES
(101,'prasanna@example.com','prasanna','$2b$demo_hash_trader_101','TRADER',TRUE,0,'2026-10-31 09:00:00+05:30','2026-09-01 10:00:00+05:30'),
(102,'asha@example.com','asha_analyst','$2b$demo_hash_analyst_102','ANALYST',TRUE,0,'2026-10-31 09:15:00+05:30','2026-09-02 11:00:00+05:30'),
(103,'dev@example.com','dev_admin','$2b$demo_hash_admin_103','ADMIN',TRUE,0,'2026-10-31 08:45:00+05:30','2026-09-03 12:00:00+05:30'),
(104,'rahul@example.com','rahul_trader','$2b$demo_hash_trader_104','TRADER',TRUE,1,'2026-10-30 18:30:00+05:30','2026-09-04 13:00:00+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO sessions (session_id,user_id,created_at,expires_at,ip_address,user_agent) VALUES
('11111111-1111-4111-8111-111111111111',101,'2026-10-31 09:00:00+05:30','2026-10-31 17:00:00+05:30','192.168.1.10','Chrome on Windows'),
('22222222-2222-4222-8222-222222222222',102,'2026-10-31 09:15:00+05:30','2026-10-31 17:15:00+05:30','192.168.1.20','Firefox on Linux')
ON CONFLICT DO NOTHING;

INSERT INTO accounts (account_id,user_id,owner_role,cash_balance,created_at) VALUES
(1001,101,'TRADER',86000.0000,'2026-09-01 10:05:00+05:30'),
(1002,104,'TRADER',114000.0000,'2026-09-04 13:05:00+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO risk_limits (account_id,max_order_qty,max_order_notional,max_position_qty,max_open_orders,price_collar_pct,updated_at) VALUES
(1001,100,500000.0000,1000,10,5.00,'2026-10-01 10:00:00+05:30'),
(1002,200,750000.0000,1500,15,4.00,'2026-10-01 10:00:00+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO instruments (instrument_id,symbol,name,tick_size,min_price,max_price,reference_price,lot_size,is_active,created_at,sector) VALUES
(1,'RELIANCE','Reliance Industries',0.0500,1.0000,5000.0000,1400.0000,1,TRUE,'2026-09-01 09:00:00+05:30','Energy'),
(2,'TCS','Tata Consultancy Services',0.0500,1.0000,6000.0000,3200.0000,1,TRUE,'2026-09-01 09:00:00+05:30','Information Technology'),
(3,'INFY','Infosys',0.0500,1.0000,3000.0000,1500.0000,1,TRUE,'2026-09-01 09:00:00+05:30','Information Technology')
ON CONFLICT DO NOTHING;

INSERT INTO orders (order_id,client_order_id,account_id,instrument_id,side,order_type,time_in_force,price,quantity,filled_qty,status,status_reason,submitted_at,updated_at,cancel_requested_at) VALUES
(5001,'50000000-0000-4000-8000-000000000001',1001,1,'BUY','LIMIT','DAY',1400.0000,10,10,'FILLED','Fully matched','2026-10-31 10:00:00+05:30','2026-10-31 10:01:00+05:30',NULL),
(5002,'50000000-0000-4000-8000-000000000002',1002,1,'SELL','LIMIT','DAY',1400.0000,10,10,'FILLED','Fully matched','2026-10-31 10:00:10+05:30','2026-10-31 10:01:00+05:30',NULL),
(5003,'50000000-0000-4000-8000-000000000003',1001,2,'BUY','LIMIT','GTC',3200.0000,5,0,'OPEN','Awaiting matching','2026-10-31 10:10:00+05:30','2026-10-31 10:10:00+05:30',NULL),
(5004,'50000000-0000-4000-8000-000000000004',1001,3,'SELL','LIMIT','DAY',1500.0000,5,0,'CANCELLED','Cancelled by trader','2026-10-31 10:20:00+05:30','2026-10-31 10:21:00+05:30','2026-10-31 10:20:45+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO trades (trade_id,engine_seq,instrument_id,executed_at,price,quantity,buy_order_id,sell_order_id,buyer_account_id,seller_account_id,aggressor_side) VALUES
(9001,700001,1,'2026-10-31 10:01:00+05:30',1400.0000,10,5001,5002,1001,1002,'BUY')
ON CONFLICT DO NOTHING;

INSERT INTO fills (fill_id,trade_id,order_id,account_id,instrument_id,side,price,quantity,cash_delta,realized_pnl,executed_at) VALUES
(9101,9001,5001,1001,1,'BUY',1400.0000,10,-14000.0000,0.0000,'2026-10-31 10:01:00+05:30'),
(9102,9001,5002,1002,1,'SELL',1400.0000,10,14000.0000,500.0000,'2026-10-31 10:01:00+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO positions (account_id,instrument_id,net_qty,avg_cost,realized_pnl,updated_at) VALUES
(1001,1,10,1400.000000,0.0000,'2026-10-31 10:01:00+05:30'),
(1002,1,-10,1400.000000,500.0000,'2026-10-31 10:01:00+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO watchlists (user_id,instrument_id,added_at) VALUES
(101,1,'2026-10-01 09:00:00+05:30'),
(101,2,'2026-10-01 09:05:00+05:30'),
(104,1,'2026-10-02 09:10:00+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO surveillance_sessions (session_id,account_id,instrument_id,window_start,window_end,orders_placed,orders_canceled,trades_executed,order_cancel_ratio,quote_to_trade_ratio,median_lifetime_ms,size_skew,msg_rate_per_s,book_imbalance_impact,opposite_side_fill_ratio,layering_depth,features,label,created_at) VALUES
(7001,1001,1,'2026-10-31 10:00:00+05:30','2026-10-31 10:30:00+05:30',20,18,1,0.900000,20.0000,120.500,1.2500,45.0000,0.720000,0.100000,3.000,ARRAY[0.90,20.0,120.5,1.25,45.0,0.72,0.10,3.0]::DOUBLE PRECISION[],'HIGH_CANCEL_ACTIVITY','2026-10-31 10:31:00+05:30'),
(7002,1002,1,'2026-10-31 10:00:00+05:30','2026-10-31 10:30:00+05:30',5,1,2,0.200000,2.5000,850.000,0.3000,8.0000,0.150000,0.500000,0.000,ARRAY[0.20,2.5,850.0,0.3,8.0,0.15,0.5,0.0]::DOUBLE PRECISION[],'NORMAL','2026-10-31 10:31:00+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO surveillance_patterns (pattern_id,name,description,embedding,created_at) VALUES
(1,'High Cancellation Rate','Repeated order placement and cancellation behaviour.',ARRAY[0.85,18.0,130.0,1.2,40.0,0.7,0.1,3.0]::DOUBLE PRECISION[],'2026-09-15 10:00:00+05:30'),
(2,'Layering Behaviour','Potential multi-level order-book manipulation pattern.',ARRAY[0.75,12.0,100.0,2.0,35.0,0.8,0.2,4.0]::DOUBLE PRECISION[],'2026-09-16 10:00:00+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO alerts (alert_id,session_id,pattern_id,similarity,rule_flags,severity,status,assigned_to,created_at,resolved_at) VALUES
(8001,7001,1,0.9400,ARRAY['HIGH_CANCEL_RATIO','SHORT_ORDER_LIFETIME'],'HIGH','IN_REVIEW',102,'2026-10-31 10:32:00+05:30',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO alert_notes (note_id,alert_id,author_id,body,body_tsv,created_at) VALUES
(8101,8001,102,'The account cancelled 18 of 20 observed orders. Please review the order sequence and timing.',to_tsvector('english','The account cancelled 18 of 20 observed orders. Please review the order sequence and timing.'),'2026-10-31 10:40:00+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO audit_log (audit_id,occurred_at,actor_user_id,action,entity_type,entity_id,old_data,new_data) VALUES
(9901,'2026-10-31 10:01:00+05:30',101,'ORDER_FILLED','orders','5001','{"status":"OPEN","filled_qty":0}'::jsonb,'{"status":"FILLED","filled_qty":10}'::jsonb),
(9902,'2026-10-31 10:32:00+05:30',102,'ALERT_REVIEW_STARTED','alerts','8001','{"status":"OPEN"}'::jsonb,'{"status":"IN_REVIEW"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO engine_offsets (consumer,last_seq,updated_at) VALUES
('trade_projection',700001,'2026-10-31 10:02:00+05:30'),
('surveillance_consumer',700010,'2026-10-31 10:32:00+05:30')
ON CONFLICT DO NOTHING;

INSERT INTO surveillance_feature_stats (position,feature_name,log_transform,mean,stddev) VALUES
(1,'order_cancel_ratio',FALSE,0.3500,0.2200),
(2,'quote_to_trade_ratio',TRUE,4.5000,2.1000),
(3,'median_lifetime_ms',TRUE,600.0000,250.0000),
(4,'size_skew',FALSE,0.8000,0.3500),
(5,'msg_rate_per_s',TRUE,20.0000,12.0000),
(6,'book_imbalance_impact',FALSE,0.3000,0.2000),
(7,'opposite_side_fill_ratio',FALSE,0.4000,0.2500),
(8,'layering_depth',FALSE,1.5000,0.9000)
ON CONFLICT DO NOTHING;

-- ================================================================
-- DEMONSTRATION QUERIES (run these after the inserts)
-- ================================================================

-- Q1. Display all registered users.
SELECT user_id, username, email, role, is_active FROM users ORDER BY user_id;

-- Q2. Display all instruments.
SELECT instrument_id, symbol, name, reference_price, sector FROM instruments ORDER BY instrument_id;

-- Q3. Show every order with its account owner and instrument.
SELECT o.order_id, u.username, i.symbol, o.side, o.quantity, o.filled_qty, o.status
FROM orders o
JOIN accounts a ON a.account_id = o.account_id
JOIN users u ON u.user_id = a.user_id
JOIN instruments i ON i.instrument_id = o.instrument_id
ORDER BY o.order_id;

-- Q4. Show executed trades with buyer and seller usernames.
SELECT t.trade_id, bi.username AS buyer, si.username AS seller,
       ins.symbol, t.quantity, t.price, t.executed_at
FROM trades t
JOIN accounts ba ON ba.account_id = t.buyer_account_id
JOIN users bi ON bi.user_id = ba.user_id
JOIN accounts sa ON sa.account_id = t.seller_account_id
JOIN users si ON si.user_id = sa.user_id
JOIN instruments ins ON ins.instrument_id = t.instrument_id;

-- Q5. Show the two side-specific fills for each trade.
SELECT f.trade_id, f.fill_id, f.side, u.username, ins.symbol,
       f.quantity, f.price, f.cash_delta
FROM fills f
JOIN accounts a ON a.account_id = f.account_id
JOIN users u ON u.user_id = a.user_id
JOIN instruments ins ON ins.instrument_id = f.instrument_id
ORDER BY f.trade_id, f.side;

-- Q6. Show each account's current positions.
SELECT u.username, a.account_id, i.symbol, p.net_qty, p.avg_cost, p.realized_pnl
FROM positions p
JOIN accounts a ON a.account_id = p.account_id
JOIN users u ON u.user_id = a.user_id
JOIN instruments i ON i.instrument_id = p.instrument_id
ORDER BY a.account_id, i.symbol;

-- Q7. Show users and the instruments in their watchlists.
SELECT u.username, i.symbol, i.name, w.added_at
FROM watchlists w
JOIN users u ON u.user_id = w.user_id
JOIN instruments i ON i.instrument_id = w.instrument_id
ORDER BY u.username, i.symbol;

-- Q8. Count orders by status.
SELECT status, COUNT(*) AS order_count
FROM orders
GROUP BY status
ORDER BY status;

-- Q9. Show surveillance sessions with the monitored account and instrument.
SELECT ss.session_id, u.username, i.symbol, ss.orders_placed,
       ss.orders_canceled, ss.order_cancel_ratio, ss.label
FROM surveillance_sessions ss
JOIN accounts a ON a.account_id = ss.account_id
JOIN users u ON u.user_id = a.user_id
JOIN instruments i ON i.instrument_id = ss.instrument_id
ORDER BY ss.session_id;

-- Q10. Show alerts, matched patterns and assigned analysts.
SELECT al.alert_id, sp.name AS pattern, al.similarity, al.severity,
       al.status, analyst.username AS assigned_analyst
FROM alerts al
JOIN surveillance_patterns sp ON sp.pattern_id = al.pattern_id
LEFT JOIN users analyst ON analyst.user_id = al.assigned_to
ORDER BY al.alert_id;

-- Q11. Show investigation notes for each alert.
SELECT al.alert_id, n.note_id, author.username AS author, n.body, n.created_at
FROM alert_notes n
JOIN alerts al ON al.alert_id = n.alert_id
JOIN users author ON author.user_id = n.author_id
ORDER BY al.alert_id, n.created_at;

-- Q12. Show risk limits with account owner.
SELECT a.account_id, u.username, rl.max_order_qty, rl.max_order_notional,
       rl.max_position_qty, rl.max_open_orders, rl.price_collar_pct
FROM risk_limits rl
JOIN accounts a ON a.account_id = rl.account_id
JOIN users u ON u.user_id = a.user_id;

-- Q13. Calculate total number and total quantity of orders per account.
SELECT a.account_id, u.username, COUNT(o.order_id) AS total_orders,
       COALESCE(SUM(o.quantity),0) AS total_order_quantity
FROM accounts a
JOIN users u ON u.user_id = a.user_id
LEFT JOIN orders o ON o.account_id = a.account_id
GROUP BY a.account_id, u.username
ORDER BY a.account_id;

-- Q14. Find accounts with a high cancellation ratio (demo threshold > 0.50).
SELECT a.account_id, u.username, i.symbol, ss.order_cancel_ratio
FROM surveillance_sessions ss
JOIN accounts a ON a.account_id = ss.account_id
JOIN users u ON u.user_id = a.user_id
JOIN instruments i ON i.instrument_id = ss.instrument_id
WHERE ss.order_cancel_ratio > 0.50;

-- Q15. Search analyst notes using PostgreSQL full-text search.
SELECT note_id, alert_id, body
FROM alert_notes
WHERE to_tsvector('english', body) @@ plainto_tsquery('english', 'cancelled orders');

-- Q16. Show audit history in chronological order.
SELECT audit_id, occurred_at, actor_user_id, action, entity_type, entity_id, old_data, new_data
FROM audit_log
ORDER BY occurred_at;

-- Q17. Verify that every table contains sample data.
SELECT 'users' AS table_name, COUNT(*) AS rows FROM users
UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL SELECT 'accounts', COUNT(*) FROM accounts
UNION ALL SELECT 'risk_limits', COUNT(*) FROM risk_limits
UNION ALL SELECT 'instruments', COUNT(*) FROM instruments
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'trades', COUNT(*) FROM trades
UNION ALL SELECT 'fills', COUNT(*) FROM fills
UNION ALL SELECT 'positions', COUNT(*) FROM positions
UNION ALL SELECT 'watchlists', COUNT(*) FROM watchlists
UNION ALL SELECT 'surveillance_sessions', COUNT(*) FROM surveillance_sessions
UNION ALL SELECT 'surveillance_patterns', COUNT(*) FROM surveillance_patterns
UNION ALL SELECT 'alerts', COUNT(*) FROM alerts
UNION ALL SELECT 'alert_notes', COUNT(*) FROM alert_notes
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log
UNION ALL SELECT 'engine_offsets', COUNT(*) FROM engine_offsets
UNION ALL SELECT 'surveillance_feature_stats', COUNT(*) FROM surveillance_feature_stats
ORDER BY table_name;
