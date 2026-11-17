-- ============================================================================
-- MERIDIAN — ADVANCED VIEWS, STORED PROCEDURES & TRIGGERS
-- PES University — DBMS Experiential Learning Project
-- Satisfying Advanced Database Concepts: Transactions, Views, Stored
-- Procedures, Triggers, Vector Similarity and Full-Text Search.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Stored Procedures & Functions
-- ----------------------------------------------------------------------------

-- Function: Compute Vector Cosine Similarity between two 8-D vectors
CREATE OR REPLACE FUNCTION fn_cosine_similarity(
    vec_a DOUBLE PRECISION[],
    vec_b DOUBLE PRECISION[]
) RETURNS DOUBLE PRECISION AS $$
DECLARE
    dot_prod DOUBLE PRECISION := 0.0;
    norm_a DOUBLE PRECISION := 0.0;
    norm_b DOUBLE PRECISION := 0.0;
    i INT;
    len INT;
BEGIN
    len := array_length(vec_a, 1);
    IF len IS NULL OR len <> array_length(vec_b, 1) THEN
        RETURN 0.0;
    END IF;

    FOR i IN 1..len LOOP
        dot_prod := dot_prod + (vec_a[i] * vec_b[i]);
        norm_a := norm_a + (vec_a[i] * vec_a[i]);
        norm_b := norm_b + (vec_b[i] * vec_b[i]);
    END LOOP;

    IF norm_a = 0.0 OR norm_b = 0.0 THEN
        RETURN 0.0;
    END IF;

    RETURN dot_prod / (SQRT(norm_a) * SQRT(norm_b));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Compute Realized P&L on a closing fill using Weighted Average Cost
CREATE OR REPLACE FUNCTION fn_calculate_realized_pnl(
    p_current_qty BIGINT,
    p_avg_cost NUMERIC(18,6),
    p_fill_side order_side,
    p_fill_qty BIGINT,
    p_fill_price NUMERIC(18,4)
) RETURNS NUMERIC(20,4) AS $$
DECLARE
    v_realized NUMERIC(20,4) := 0.0000;
BEGIN
    -- If closing a long position by selling
    IF p_current_qty > 0 AND p_fill_side = 'SELL' THEN
        v_realized := LEAST(p_current_qty, p_fill_qty) * (p_fill_price - p_avg_cost);
    -- If closing a short position by buying
    ELSIF p_current_qty < 0 AND p_fill_side = 'BUY' THEN
        v_realized := LEAST(ABS(p_current_qty), p_fill_qty) * (p_avg_cost - p_fill_price);
    END IF;

    RETURN v_realized;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ----------------------------------------------------------------------------
-- 2. Database Triggers
-- ----------------------------------------------------------------------------

-- Trigger Function: Maintain Full-Text Search tsvector on Alert Notes
CREATE OR REPLACE FUNCTION fn_alert_notes_tsv_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.body_tsv := to_tsvector('english', NEW.body);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alert_notes_tsv ON alert_notes;
CREATE TRIGGER trg_alert_notes_tsv
BEFORE INSERT OR UPDATE OF body ON alert_notes
FOR EACH ROW EXECUTE FUNCTION fn_alert_notes_tsv_update();

-- Trigger Function: Automatic Order State Audit Logging
CREATE OR REPLACE FUNCTION fn_audit_order_transitions() RETURNS TRIGGER AS $$
DECLARE
    v_audit_id BIGINT;
BEGIN
    IF (TG_OP = 'UPDATE' AND (OLD.status <> NEW.status OR OLD.filled_qty <> NEW.filled_qty)) THEN
        -- Generate unique sequential audit ID from epoch microseconds
        v_audit_id := (EXTRACT(EPOCH FROM NOW()) * 1000000)::BIGINT + (random() * 1000)::INT;
        
        INSERT INTO audit_log (audit_id, occurred_at, actor_user_id, action, entity_type, entity_id, old_data, new_data)
        VALUES (
            v_audit_id,
            NOW(),
            NULL,
            'ORDER_STATUS_' || NEW.status::TEXT,
            'orders',
            NEW.order_id::TEXT,
            jsonb_build_object('status', OLD.status, 'filled_qty', OLD.filled_qty, 'updated_at', OLD.updated_at),
            jsonb_build_object('status', NEW.status, 'filled_qty', NEW.filled_qty, 'updated_at', NEW.updated_at)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_audit ON orders;
CREATE TRIGGER trg_orders_audit
AFTER UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION fn_audit_order_transitions();

-- Trigger Function: Enforce Strict Immutability on Audit Log (Append-Only)
CREATE OR REPLACE FUNCTION fn_prevent_audit_log_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is an immutable append-only ledger: UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION fn_prevent_audit_log_mutation();

-- Trigger Function: Real-Time Position & Cash Settlement upon Fill Generation
CREATE OR REPLACE FUNCTION fn_process_fill_settlement() RETURNS TRIGGER AS $$
DECLARE
    v_pos RECORD;
    v_new_qty BIGINT;
    v_new_avg_cost NUMERIC(18,6);
    v_pnl NUMERIC(20,4) := 0.0000;
BEGIN
    -- 1. Update Account Cash Balance
    UPDATE accounts
    SET cash_balance = cash_balance + NEW.cash_delta
    WHERE account_id = NEW.account_id;

    -- 2. Lookup existing position
    SELECT * INTO v_pos
    FROM positions
    WHERE account_id = NEW.account_id AND instrument_id = NEW.instrument_id;

    IF NOT FOUND THEN
        -- Initial position creation
        v_new_qty := CASE WHEN NEW.side = 'BUY' THEN NEW.quantity ELSE -NEW.quantity END;
        v_new_avg_cost := NEW.price;
        
        INSERT INTO positions (account_id, instrument_id, net_qty, avg_cost, realized_pnl, updated_at)
        VALUES (NEW.account_id, NEW.instrument_id, v_new_qty, v_new_avg_cost, 0.0000, NEW.executed_at);
    ELSE
        -- Position update logic
        IF (v_pos.net_qty >= 0 AND NEW.side = 'BUY') OR (v_pos.net_qty <= 0 AND NEW.side = 'SELL') THEN
            -- Increasing position size: recompute weighted average cost
            v_new_qty := v_pos.net_qty + (CASE WHEN NEW.side = 'BUY' THEN NEW.quantity ELSE -NEW.quantity END);
            v_new_avg_cost := ((ABS(v_pos.net_qty) * v_pos.avg_cost) + (NEW.quantity * NEW.price)) / ABS(v_new_qty);
            
            UPDATE positions
            SET net_qty = v_new_qty,
                avg_cost = v_new_avg_cost,
                updated_at = NEW.executed_at
            WHERE account_id = NEW.account_id AND instrument_id = NEW.instrument_id;
        ELSE
            -- Reducing position size: calculate realized P&L and adjust quantity
            v_pnl := fn_calculate_realized_pnl(v_pos.net_qty, v_pos.avg_cost, NEW.side, NEW.quantity, NEW.price);
            v_new_qty := v_pos.net_qty + (CASE WHEN NEW.side = 'BUY' THEN NEW.quantity ELSE -NEW.quantity END);
            
            -- If position flipped direction, remaining size takes new fill price as cost
            IF (v_pos.net_qty > 0 AND v_new_qty < 0) OR (v_pos.net_qty < 0 AND v_new_qty > 0) THEN
                v_new_avg_cost := NEW.price;
            ELSE
                v_new_avg_cost := v_pos.avg_cost;
            END IF;

            UPDATE positions
            SET net_qty = v_new_qty,
                avg_cost = CASE WHEN v_new_qty = 0 THEN 0.000000 ELSE v_new_avg_cost END,
                realized_pnl = realized_pnl + v_pnl,
                updated_at = NEW.executed_at
            WHERE account_id = NEW.account_id AND instrument_id = NEW.instrument_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fills_settlement ON fills;
CREATE TRIGGER trg_fills_settlement
AFTER INSERT ON fills
FOR EACH ROW EXECUTE FUNCTION fn_process_fill_settlement();

-- ----------------------------------------------------------------------------
-- 3. Advanced Relational Views
-- ----------------------------------------------------------------------------

-- View 1: Top of Book (BBO - Best Bid and Offer) per active instrument
CREATE OR REPLACE VIEW v_top_of_book AS
WITH best_bids AS (
    SELECT instrument_id, MAX(price) AS best_bid, SUM(quantity - filled_qty) AS bid_depth
    FROM orders
    WHERE side = 'BUY' AND status IN ('OPEN', 'PARTIALLY_FILLED')
    GROUP BY instrument_id
),
best_asks AS (
    SELECT instrument_id, MIN(price) AS best_ask, SUM(quantity - filled_qty) AS ask_depth
    FROM orders
    WHERE side = 'SELL' AND status IN ('OPEN', 'PARTIALLY_FILLED')
    GROUP BY instrument_id
)
SELECT 
    i.instrument_id,
    i.symbol,
    i.name,
    i.sector,
    i.reference_price,
    COALESCE(bb.best_bid, 0.0000) AS best_bid,
    COALESCE(bb.bid_depth, 0) AS bid_size,
    COALESCE(ba.best_ask, 0.0000) AS best_ask,
    COALESCE(ba.ask_depth, 0) AS ask_size,
    CASE 
        WHEN bb.best_bid IS NOT NULL AND ba.best_ask IS NOT NULL THEN (ba.best_ask - bb.best_bid)
        ELSE NULL
    END AS spread
FROM instruments i
LEFT JOIN best_bids bb ON bb.instrument_id = i.instrument_id
LEFT JOIN best_asks ba ON ba.instrument_id = i.instrument_id
WHERE i.is_active = TRUE;

-- View 2: Account Portfolio & Mark-to-Market Valuation
CREATE OR REPLACE VIEW v_portfolio_summary AS
SELECT 
    a.account_id,
    u.user_id,
    u.username,
    u.email,
    i.instrument_id,
    i.symbol,
    i.name AS instrument_name,
    p.net_qty,
    p.avg_cost,
    i.reference_price AS current_market_price,
    (p.net_qty * i.reference_price) AS market_value,
    (p.net_qty * (i.reference_price - p.avg_cost)) AS unrealized_pnl,
    p.realized_pnl,
    p.updated_at
FROM positions p
JOIN accounts a ON a.account_id = p.account_id
JOIN users u ON u.user_id = a.user_id
JOIN instruments i ON i.instrument_id = p.instrument_id;

-- View 3: Trade Blotter with Buyer, Seller, and Execution Notional
CREATE OR REPLACE VIEW v_trade_blotter AS
SELECT 
    t.trade_id,
    t.engine_seq,
    i.symbol,
    t.price,
    t.quantity,
    (t.price * t.quantity) AS notional_value,
    t.aggressor_side,
    bu.username AS buyer_username,
    ba.account_id AS buyer_account_id,
    su.username AS seller_username,
    sa.account_id AS seller_account_id,
    t.executed_at
FROM trades t
JOIN instruments i ON i.instrument_id = t.instrument_id
JOIN accounts ba ON ba.account_id = t.buyer_account_id
JOIN users bu ON bu.user_id = ba.user_id
JOIN accounts sa ON sa.account_id = t.seller_account_id
JOIN users su ON su.user_id = sa.user_id;

-- View 4: High-Severity Surveillance Alerts with Matched Patterns & Analysts
CREATE OR REPLACE VIEW v_surveillance_summary AS
SELECT 
    al.alert_id,
    al.severity,
    al.status,
    al.similarity,
    al.rule_flags,
    sp.name AS pattern_name,
    sp.description AS pattern_description,
    u_trader.username AS subject_trader,
    a.account_id AS subject_account_id,
    i.symbol AS subject_symbol,
    ss.order_cancel_ratio,
    ss.quote_to_trade_ratio,
    ss.median_lifetime_ms,
    ss.msg_rate_per_s,
    u_analyst.username AS assigned_analyst,
    al.created_at,
    al.resolved_at
FROM alerts al
JOIN surveillance_sessions ss ON ss.session_id = al.session_id
JOIN surveillance_patterns sp ON sp.pattern_id = al.pattern_id
JOIN accounts a ON a.account_id = ss.account_id
JOIN users u_trader ON u_trader.user_id = a.user_id
JOIN instruments i ON i.instrument_id = ss.instrument_id
LEFT JOIN users u_analyst ON u_analyst.user_id = al.assigned_to;
