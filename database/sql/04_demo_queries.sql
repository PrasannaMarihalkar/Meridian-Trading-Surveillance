-- ============================================================================
-- MERIDIAN — 17 OFFICIAL COLLEGE DEMONSTRATION QUERIES
-- PES University — DBMS Experiential Learning Project
-- Verifying: Relational Joins, Aggregations, Grouping, Having, Subqueries,
-- Full-Text Search, Stored Functions, and Complex Analytics.
-- ============================================================================

-- Q1. Display all registered users with roles and status
SELECT user_id, username, email, role, is_active, created_at 
FROM users 
ORDER BY user_id;

-- Q2. Display all active instruments with price boundaries and reference prices
SELECT instrument_id, symbol, name, sector, tick_size, min_price, max_price, reference_price 
FROM instruments 
WHERE is_active = TRUE 
ORDER BY instrument_id;

-- Q3. Show every order with account owner, instrument, and fill ratio
SELECT 
    o.order_id, 
    u.username AS trader, 
    i.symbol, 
    o.side, 
    o.order_type,
    o.price, 
    o.quantity, 
    o.filled_qty, 
    ROUND((o.filled_qty::NUMERIC / o.quantity) * 100, 2) AS fill_percentage,
    o.status,
    o.submitted_at
FROM orders o
JOIN accounts a ON a.account_id = o.account_id
JOIN users u ON u.user_id = a.user_id
JOIN instruments i ON i.instrument_id = o.instrument_id
ORDER BY o.submitted_at DESC;

-- Q4. Show executed trades with buyer and seller details and total traded notional
SELECT 
    t.trade_id, 
    t.engine_seq,
    ins.symbol, 
    t.quantity, 
    t.price, 
    (t.quantity * t.price) AS total_notional,
    bi.username AS buyer, 
    si.username AS seller,
    t.aggressor_side,
    t.executed_at
FROM trades t
JOIN accounts ba ON ba.account_id = t.buyer_account_id
JOIN users bi ON bi.user_id = ba.user_id
JOIN accounts sa ON sa.account_id = t.seller_account_id
JOIN users si ON si.user_id = sa.user_id
JOIN instruments ins ON ins.instrument_id = t.instrument_id
ORDER BY t.executed_at DESC;

-- Q5. Show the two side-specific fills for each trade (buyer & seller legs)
SELECT 
    f.trade_id, 
    f.fill_id, 
    f.side, 
    u.username AS account_owner, 
    ins.symbol,
    f.quantity, 
    f.price, 
    f.cash_delta,
    f.realized_pnl,
    f.executed_at
FROM fills f
JOIN accounts a ON a.account_id = f.account_id
JOIN users u ON u.user_id = a.user_id
JOIN instruments ins ON ins.instrument_id = f.instrument_id
ORDER BY f.trade_id, f.side;

-- Q6. Show each account's current positions, average cost, and unrealized P&L
SELECT 
    a.account_id,
    u.username, 
    i.symbol, 
    p.net_qty, 
    p.avg_cost, 
    i.reference_price AS market_price,
    (p.net_qty * (i.reference_price - p.avg_cost)) AS unrealized_pnl,
    p.realized_pnl,
    p.updated_at
FROM positions p
JOIN accounts a ON a.account_id = p.account_id
JOIN users u ON u.user_id = a.user_id
JOIN instruments i ON i.instrument_id = p.instrument_id
ORDER BY a.account_id, i.symbol;

-- Q7. Show users and the instruments in their watchlists
SELECT 
    u.username, 
    i.symbol, 
    i.name, 
    i.sector,
    w.added_at
FROM watchlists w
JOIN users u ON u.user_id = w.user_id
JOIN instruments i ON i.instrument_id = w.instrument_id
ORDER BY u.username, i.symbol;

-- Q8. Aggregate order distribution and total requested notional by status
SELECT 
    status, 
    COUNT(*) AS total_orders,
    SUM(quantity) AS aggregate_quantity,
    SUM(quantity * price) AS aggregate_notional
FROM orders
GROUP BY status
ORDER BY total_orders DESC;

-- Q9. Show surveillance sessions with calculated heuristic features
SELECT 
    ss.session_id, 
    u.username AS subject_trader, 
    i.symbol, 
    ss.orders_placed,
    ss.orders_canceled, 
    ss.trades_executed,
    ss.order_cancel_ratio, 
    ss.quote_to_trade_ratio,
    ss.median_lifetime_ms,
    ss.msg_rate_per_s,
    ss.label
FROM surveillance_sessions ss
JOIN accounts a ON a.account_id = ss.account_id
JOIN users u ON u.user_id = a.user_id
JOIN instruments i ON i.instrument_id = ss.instrument_id
ORDER BY ss.order_cancel_ratio DESC;

-- Q10. Show compliance alerts, matched abuse patterns, similarity, and assigned analysts
SELECT 
    al.alert_id, 
    sp.name AS matched_pattern, 
    ROUND((al.similarity * 100)::NUMERIC, 2) AS similarity_score_pct, 
    al.severity,
    al.status, 
    COALESCE(analyst.username, 'UNASSIGNED') AS assigned_analyst,
    al.created_at
FROM alerts al
JOIN surveillance_patterns sp ON sp.pattern_id = al.pattern_id
LEFT JOIN users analyst ON analyst.user_id = al.assigned_to
ORDER BY al.severity, al.similarity DESC;

-- Q11. Show investigation notes and full commentary for compliance alerts
SELECT 
    al.alert_id, 
    al.severity,
    n.note_id, 
    author.username AS analyst_name, 
    n.body, 
    n.created_at
FROM alert_notes n
JOIN alerts al ON al.alert_id = n.alert_id
JOIN users author ON author.user_id = n.author_id
ORDER BY al.alert_id, n.created_at;

-- Q12. Show risk limits along with current open orders and position utilization
SELECT 
    a.account_id, 
    u.username, 
    rl.max_order_qty, 
    rl.max_order_notional,
    rl.max_position_qty, 
    rl.max_open_orders, 
    rl.price_collar_pct,
    COUNT(o.order_id) AS current_open_orders
FROM accounts a
JOIN users u ON u.user_id = a.user_id
JOIN risk_limits rl ON rl.account_id = a.account_id
LEFT JOIN orders o ON o.account_id = a.account_id AND o.status IN ('OPEN', 'PARTIALLY_FILLED')
GROUP BY a.account_id, u.username, rl.max_order_qty, rl.max_order_notional, rl.max_position_qty, rl.max_open_orders, rl.price_collar_pct;

-- Q13. Correlate total order volume and trade execution rate per trader
SELECT 
    a.account_id, 
    u.username, 
    COUNT(DISTINCT o.order_id) AS total_orders_placed,
    COALESCE(SUM(o.quantity), 0) AS total_order_units,
    COUNT(DISTINCT f.fill_id) AS total_fills_received,
    COALESCE(SUM(f.quantity), 0) AS total_units_executed
FROM accounts a
JOIN users u ON u.user_id = a.user_id
LEFT JOIN orders o ON o.account_id = a.account_id
LEFT JOIN fills f ON f.account_id = a.account_id
GROUP BY a.account_id, u.username
ORDER BY total_orders_placed DESC;

-- Q14. High Cancellation Filter: Find accounts exhibiting abnormal cancel ratios (> 0.50)
SELECT 
    a.account_id, 
    u.username, 
    i.symbol, 
    ss.orders_placed,
    ss.orders_canceled,
    ss.order_cancel_ratio,
    ss.median_lifetime_ms
FROM surveillance_sessions ss
JOIN accounts a ON a.account_id = ss.account_id
JOIN users u ON u.user_id = a.user_id
JOIN instruments i ON i.instrument_id = ss.instrument_id
WHERE ss.order_cancel_ratio > 0.50
ORDER BY ss.order_cancel_ratio DESC;

-- Q15. Full-Text Search on Analyst Notes using PostgreSQL tsvector and tsquery
SELECT 
    note_id, 
    alert_id, 
    body,
    ts_rank(body_tsv, plainto_tsquery('english', 'cancelled orders')) AS search_relevance
FROM alert_notes
WHERE body_tsv @@ plainto_tsquery('english', 'cancelled orders')
ORDER BY search_relevance DESC;

-- Q16. Audit Log Chronology: Trace system actions and JSON data deltas
SELECT 
    audit_id, 
    occurred_at, 
    COALESCE(u.username, 'SYSTEM') AS actor, 
    action, 
    entity_type, 
    entity_id, 
    old_data, 
    new_data
FROM audit_log al
LEFT JOIN users u ON u.user_id = al.actor_user_id
ORDER BY occurred_at DESC;

-- Q17. College Verification Query: Confirm record count across all 17 tables
SELECT 'users' AS entity_name, COUNT(*) AS row_count FROM users
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
UNION ALL SELECT 'surveillance_feature_stats', COUNT(*) FROM surveillance_feature_stats
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log
UNION ALL SELECT 'engine_offsets', COUNT(*) FROM engine_offsets
ORDER BY entity_name;
