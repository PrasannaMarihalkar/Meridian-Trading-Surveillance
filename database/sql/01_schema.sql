-- ============================================================================
-- MERIDIAN — PRODUCTION RELATIONAL SCHEMA (POSTGRESQL 16+)
-- 17 Entities, Strict Referential Integrity, Financial Constraints & BCNF
-- PES University — DBMS Experiential Learning Project
-- Student: Prasanna Marihalkar (USN: PES1UG24CS684)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Custom Data Types & Domains
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- DOMAIN 1: IDENTITY AND ACCOUNTS
-- ----------------------------------------------------------------------------

-- Table 1: users
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_logins INT NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 2: sessions
CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address INET,
    user_agent TEXT
);

-- Table 3: accounts
CREATE TABLE IF NOT EXISTS accounts (
    account_id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE RESTRICT,
    owner_role user_role NOT NULL,
    cash_balance NUMERIC(20,4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 4: risk_limits
CREATE TABLE IF NOT EXISTS risk_limits (
    account_id BIGINT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
    max_order_qty BIGINT NOT NULL CHECK (max_order_qty > 0),
    max_order_notional NUMERIC(20,4) NOT NULL CHECK (max_order_notional > 0),
    max_position_qty BIGINT NOT NULL CHECK (max_position_qty > 0),
    max_open_orders INT NOT NULL CHECK (max_open_orders > 0),
    price_collar_pct NUMERIC(5,2) NOT NULL CHECK (price_collar_pct > 0 AND price_collar_pct <= 100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- DOMAIN 2: TRADING MASTER DATA AND EXECUTION
-- ----------------------------------------------------------------------------

-- Sequences for atomic, concurrency-safe identifier generation across processes
CREATE SEQUENCE IF NOT EXISTS order_id_seq START WITH 5000;
CREATE SEQUENCE IF NOT EXISTS trade_id_seq START WITH 8000;
CREATE SEQUENCE IF NOT EXISTS fill_id_seq START WITH 9100;
CREATE SEQUENCE IF NOT EXISTS engine_seq_gen START WITH 10000;

-- Table 5: instruments
CREATE TABLE IF NOT EXISTS instruments (
    instrument_id SMALLINT PRIMARY KEY,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tick_size NUMERIC(18,4) NOT NULL CHECK (tick_size > 0),
    min_price NUMERIC(18,4) NOT NULL CHECK (min_price > 0),
    max_price NUMERIC(18,4) NOT NULL,
    reference_price NUMERIC(18,4) NOT NULL CHECK (reference_price > 0),
    lot_size INT NOT NULL CHECK (lot_size > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sector TEXT,
    CONSTRAINT chk_price_range CHECK (max_price > min_price)
);

-- Table 6: orders
CREATE TABLE IF NOT EXISTS orders (
    order_id BIGINT PRIMARY KEY,
    client_order_id UUID NOT NULL UNIQUE,
    account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id) ON DELETE RESTRICT,
    side order_side NOT NULL,
    order_type order_type NOT NULL,
    time_in_force time_in_force NOT NULL DEFAULT 'DAY',
    price NUMERIC(18,4) NOT NULL CHECK (price >= 0),
    quantity BIGINT NOT NULL CHECK (quantity > 0),
    filled_qty BIGINT NOT NULL DEFAULT 0 CHECK (filled_qty >= 0 AND filled_qty <= quantity),
    status order_status NOT NULL DEFAULT 'OPEN',
    status_reason TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancel_requested_at TIMESTAMPTZ
);

-- Table 7: trades
CREATE TABLE IF NOT EXISTS trades (
    trade_id BIGINT PRIMARY KEY,
    engine_seq BIGINT NOT NULL UNIQUE,
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id) ON DELETE RESTRICT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    price NUMERIC(18,4) NOT NULL CHECK (price > 0),
    quantity BIGINT NOT NULL CHECK (quantity > 0),
    buy_order_id BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE RESTRICT,
    sell_order_id BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE RESTRICT,
    buyer_account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    seller_account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    aggressor_side order_side NOT NULL,
    CONSTRAINT chk_distinct_orders CHECK (buy_order_id <> sell_order_id),
    CONSTRAINT chk_distinct_accounts CHECK (buyer_account_id <> seller_account_id)
);

-- Table 8: fills
CREATE TABLE IF NOT EXISTS fills (
    fill_id BIGINT PRIMARY KEY,
    trade_id BIGINT NOT NULL REFERENCES trades(trade_id) ON DELETE RESTRICT,
    order_id BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE RESTRICT,
    account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id) ON DELETE RESTRICT,
    side order_side NOT NULL,
    price NUMERIC(18,4) NOT NULL CHECK (price > 0),
    quantity BIGINT NOT NULL CHECK (quantity > 0),
    cash_delta NUMERIC(20,4) NOT NULL,
    realized_pnl NUMERIC(20,4) NOT NULL DEFAULT 0.0000,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Guaranteed: exactly one BUY fill and one SELL fill per trade
    CONSTRAINT uq_trade_fill_side UNIQUE (trade_id, side)
);

-- Table 9: positions
CREATE TABLE IF NOT EXISTS positions (
    account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id) ON DELETE RESTRICT,
    net_qty BIGINT NOT NULL DEFAULT 0,
    avg_cost NUMERIC(18,6) NOT NULL DEFAULT 0.000000 CHECK (avg_cost >= 0),
    realized_pnl NUMERIC(20,4) NOT NULL DEFAULT 0.0000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, instrument_id)
);

-- Table 10: watchlists
CREATE TABLE IF NOT EXISTS watchlists (
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, instrument_id)
);

-- ----------------------------------------------------------------------------
-- DOMAIN 3: SURVEILLANCE & COMPLIANCE
-- ----------------------------------------------------------------------------

-- Table 11: surveillance_sessions
CREATE TABLE IF NOT EXISTS surveillance_sessions (
    session_id BIGINT PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    instrument_id SMALLINT NOT NULL REFERENCES instruments(instrument_id) ON DELETE RESTRICT,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    orders_placed INT NOT NULL DEFAULT 0 CHECK (orders_placed >= 0),
    orders_canceled INT NOT NULL DEFAULT 0 CHECK (orders_canceled >= 0),
    trades_executed INT NOT NULL DEFAULT 0 CHECK (trades_executed >= 0),
    order_cancel_ratio NUMERIC(8,6) NOT NULL DEFAULT 0.000000,
    quote_to_trade_ratio NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
    median_lifetime_ms NUMERIC(14,3) NOT NULL DEFAULT 0.000,
    size_skew NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
    msg_rate_per_s NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
    book_imbalance_impact NUMERIC(8,6) NOT NULL DEFAULT 0.000000,
    opposite_side_fill_ratio NUMERIC(8,6) NOT NULL DEFAULT 0.000000,
    layering_depth NUMERIC(8,3) NOT NULL DEFAULT 0.000,
    features DOUBLE PRECISION[] NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_surveillance_window CHECK (window_end > window_start),
    CONSTRAINT chk_feature_dim CHECK (array_length(features, 1) = 8),
    CONSTRAINT uq_session_window UNIQUE (account_id, instrument_id, window_start)
);

-- Table 12: surveillance_patterns
CREATE TABLE IF NOT EXISTS surveillance_patterns (
    pattern_id SMALLINT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    embedding DOUBLE PRECISION[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_embedding_dim CHECK (array_length(embedding, 1) = 8)
);

-- Table 13: alerts
CREATE TABLE IF NOT EXISTS alerts (
    alert_id BIGINT PRIMARY KEY,
    session_id BIGINT NOT NULL UNIQUE REFERENCES surveillance_sessions(session_id) ON DELETE CASCADE,
    pattern_id SMALLINT NOT NULL REFERENCES surveillance_patterns(pattern_id) ON DELETE RESTRICT,
    similarity DOUBLE PRECISION NOT NULL CHECK (similarity >= 0 AND similarity <= 1),
    rule_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    severity alert_severity NOT NULL,
    status alert_status NOT NULL DEFAULT 'OPEN',
    assigned_to BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Table 14: alert_notes
CREATE TABLE IF NOT EXISTS alert_notes (
    note_id BIGINT PRIMARY KEY,
    alert_id BIGINT NOT NULL REFERENCES alerts(alert_id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    body TEXT NOT NULL,
    body_tsv TSVECTOR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 15: surveillance_feature_stats
CREATE TABLE IF NOT EXISTS surveillance_feature_stats (
    position SMALLINT PRIMARY KEY CHECK (position BETWEEN 1 AND 8),
    feature_name TEXT NOT NULL UNIQUE,
    log_transform BOOLEAN NOT NULL DEFAULT FALSE,
    mean DOUBLE PRECISION NOT NULL,
    stddev DOUBLE PRECISION NOT NULL CHECK (stddev >= 0)
);

-- ----------------------------------------------------------------------------
-- DOMAIN 4: SYSTEM TABLES
-- ----------------------------------------------------------------------------

-- Table 16: audit_log
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id BIGINT PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id BIGINT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB
);

-- Table 17: engine_offsets
CREATE TABLE IF NOT EXISTS engine_offsets (
    consumer TEXT PRIMARY KEY,
    last_seq BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_account_submitted ON orders(account_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_instrument_status ON orders(instrument_id, status);
CREATE INDEX IF NOT EXISTS idx_trades_instrument_executed ON trades(instrument_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_buyer_account ON trades(buyer_account_id);
CREATE INDEX IF NOT EXISTS idx_trades_seller_account ON trades(seller_account_id);
CREATE INDEX IF NOT EXISTS idx_fills_account_id ON fills(account_id);
CREATE INDEX IF NOT EXISTS idx_fills_order_id ON fills(order_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status_severity ON alerts(status, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_assigned_to ON alerts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_alert_notes_alert_id ON alert_notes(alert_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_occurred ON audit_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
