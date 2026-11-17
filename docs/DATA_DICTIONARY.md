# MERIDIAN — COMPREHENSIVE DATA DICTIONARY

**Institution:** PES University, Department of Computer Science and Engineering  
**Course:** DBMS Experiential Learning — Level 3  
**Database:** PostgreSQL 16+ (17 Entities)  
**Student:** Prasanna Marihalkar (USN: PES1UG24CS684)  

---

## 1. Domain Types & Enums

| Type Name | Base Type | Allowed Values / Specification | Description |
|---|---|---|---|
| `user_role` | `ENUM` | `'TRADER'`, `'ANALYST'`, `'ADMIN'` | Role-based authorization domain. |
| `order_side` | `ENUM` | `'BUY'`, `'SELL'` | Market order side. |
| `order_type` | `ENUM` | `'MARKET'`, `'LIMIT'` | Order pricing execution type. |
| `time_in_force` | `ENUM` | `'DAY'`, `'GTC'`, `'IOC'`, `'FOK'` | Order validity duration (Good 'Til Cancel, Immediate Or Cancel, Fill Or Kill). |
| `order_status` | `ENUM` | `'OPEN'`, `'PARTIALLY_FILLED'`, `'FILLED'`, `'CANCELLED'`, `'REJECTED'` | Lifecycle status of an order. |
| `alert_severity`| `ENUM` | `'LOW'`, `'MEDIUM'`, `'HIGH'`, `'CRITICAL'` | Risk level of a surveillance alert. |
| `alert_status` | `ENUM` | `'OPEN'`, `'IN_REVIEW'`, `'RESOLVED'`, `'FALSE_POSITIVE'` | Investigation state of a surveillance alert. |

---

## 2. Table-by-Table Data Dictionary

### Table 1: `users`
*Stores registered system users, credentials, role assignments, and authentication security telemetry.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `user_id` | `BIGINT` | No | - | `PRIMARY KEY` | Unique surrogate key identifying the user. |
| `email` | `TEXT` / `CITEXT` | No | - | `UNIQUE` | User email address for authentication and notices. |
| `username` | `TEXT` / `CITEXT` | No | - | `UNIQUE` | Unique system handle/screen name. |
| `password_hash` | `TEXT` | No | - | - | Secure hash (Argon2id or Bcrypt). |
| `role` | `user_role` | No | - | - | Security authorization role. |
| `is_active` | `BOOLEAN` | No | `TRUE` | - | Account active flag (soft-disable support). |
| `failed_logins` | `INT` | No | `0` | `CHECK (>= 0)` | Consecutive failed login counter for brute-force lockouts. |
| `locked_until` | `TIMESTAMPTZ` | Yes | `NULL` | - | Lockout timestamp if failed login limit exceeded. |
| `last_login_at`| `TIMESTAMPTZ` | Yes | `NULL` | - | Most recent successful login timestamp. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | - | Account creation timestamp. |

---

### Table 2: `sessions`
*Stores active and historical user login sessions.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `session_id` | `UUID` | No | - | `PRIMARY KEY` | Cryptographically random session identifier. |
| `user_id` | `BIGINT` | No | - | `REFERENCES users(user_id)` | Authenticated user reference. |
| `created_at` | `TIMESTAMPTZ` | No | - | - | Session creation timestamp. |
| `expires_at` | `TIMESTAMPTZ` | No | - | - | Expiration timestamp for session invalidation. |
| `ip_address` | `INET` | Yes | `NULL` | - | Client IP address for audit and geo-tracking. |
| `user_agent` | `TEXT` | Yes | `NULL` | - | Client browser / device user agent string. |

---

### Table 3: `accounts`
*Stores trading accounts owned by users, representing their cash balance and execution capability.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `account_id` | `BIGINT` | No | - | `PRIMARY KEY` | Unique identifier for the trading account. |
| `user_id` | `BIGINT` | No | - | `REFERENCES users(user_id)`, `UNIQUE` | User owning the account (1:1 with Trader users). |
| `owner_role` | `user_role` | No | - | - | Role of account owner (e.g., `'TRADER'`). |
| `cash_balance` | `NUMERIC(20,4)` | No | `0` | - | Settled cash balance in account currency. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | - | Account opening timestamp. |

---

### Table 4: `risk_limits`
*Stores pre-trade risk thresholds and limits governing an account.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `account_id` | `BIGINT` | No | - | `PRIMARY KEY`, `REFERENCES accounts(account_id)` | Account to which the risk limits apply. |
| `max_order_qty` | `BIGINT` | No | - | `CHECK (> 0)` | Maximum single order share/unit quantity. |
| `max_order_notional` | `NUMERIC(20,4)` | No | - | `CHECK (> 0)` | Maximum order value (`price * qty`). |
| `max_position_qty` | `BIGINT` | No | - | `CHECK (> 0)` | Maximum aggregate inventory allowed in any single asset. |
| `max_open_orders` | `INT` | No | - | `CHECK (> 0)` | Maximum concurrent active working orders allowed. |
| `price_collar_pct` | `NUMERIC(5,2)` | No | - | `CHECK (> 0)` | Allowable price deviation percentage from reference price. |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | - | Timestamp of last risk limit revision. |

---

### Table 5: `instruments`
*Stores tradable equity instruments, pricing rules, and tick increments.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `instrument_id`| `SMALLINT` | No | - | `PRIMARY KEY` | Unique identifier for the tradable instrument. |
| `symbol` | `TEXT` | No | - | `UNIQUE` | Ticker symbol (e.g., `'RELIANCE'`, `'TCS'`). |
| `name` | `TEXT` | No | - | - | Full legal company / security name. |
| `tick_size` | `NUMERIC(18,4)` | No | - | `CHECK (> 0)` | Minimum allowable price movement increment. |
| `min_price` | `NUMERIC(18,4)` | No | - | `CHECK (> 0)` | Minimum allowed order entry price. |
| `max_price` | `NUMERIC(18,4)` | No | - | `CHECK (> min_price)` | Maximum allowed order entry price. |
| `reference_price` | `NUMERIC(18,4)`| No | - | `CHECK (> 0)` | Previous day closing / reference benchmark price. |
| `lot_size` | `INT` | No | `1` | `CHECK (> 0)` | Minimum tradable lot quantity. |
| `is_active` | `BOOLEAN` | No | `TRUE` | - | Trading status flag (halted vs active). |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | - | Inception timestamp. |
| `sector` | `TEXT` | Yes | `NULL` | - | Industry classification (e.g., `'Energy'`, `'IT'`). |

---

### Table 6: `orders`
*Stores all incoming client order instructions, execution details, and statuses.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `order_id` | `BIGINT` | No | - | `PRIMARY KEY` | Internal engine sequence / order identifier. |
| `client_order_id` | `UUID` | No | - | `UNIQUE` | Client-provided idempotency identifier. |
| `account_id` | `BIGINT` | No | - | `REFERENCES accounts(account_id)` | Account placing the order. |
| `instrument_id`| `SMALLINT` | No | - | `REFERENCES instruments(instrument_id)` | Security being traded. |
| `side` | `order_side` | No | - | - | Buy or Sell direction. |
| `order_type` | `order_type` | No | - | - | Limit or Market execution type. |
| `time_in_force`| `time_in_force`| No | - | - | Validity policy (Day, GTC, IOC, FOK). |
| `price` | `NUMERIC(18,4)` | No | - | `CHECK (>= 0)` | Limit price (0 for market orders). |
| `quantity` | `BIGINT` | No | - | `CHECK (> 0)` | Total ordered share quantity. |
| `filled_qty` | `BIGINT` | No | `0` | `CHECK (>= 0 AND <= quantity)` | Cumulative executed quantity. |
| `status` | `order_status` | No | - | - | Current state (Open, Filled, Cancelled, etc.). |
| `status_reason`| `TEXT` | Yes | `NULL` | - | Detail or rejection reason. |
| `submitted_at` | `TIMESTAMPTZ` | No | - | - | Submission timestamp. |
| `updated_at` | `TIMESTAMPTZ` | No | - | - | Last modification timestamp. |
| `cancel_requested_at` | `TIMESTAMPTZ` | Yes | `NULL` | - | Timestamp cancellation was requested. |

---

### Table 7: `trades`
*Stores atomic trade executions generated by matching opposite buy and sell orders.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `trade_id` | `BIGINT` | No | - | `PRIMARY KEY` | Unique trade execution identifier. |
| `engine_seq` | `BIGINT` | No | - | `UNIQUE` | Strictly monotonic matching engine sequence number. |
| `instrument_id`| `SMALLINT` | No | - | `REFERENCES instruments(instrument_id)` | Traded security. |
| `executed_at` | `TIMESTAMPTZ` | No | - | - | Exact trade execution timestamp. |
| `price` | `NUMERIC(18,4)` | No | - | `CHECK (> 0)` | Execution match price. |
| `quantity` | `BIGINT` | No | - | `CHECK (> 0)` | Executed share quantity. |
| `buy_order_id` | `BIGINT` | No | - | `REFERENCES orders(order_id)` | Matched buyer order. |
| `sell_order_id`| `BIGINT` | No | - | `REFERENCES orders(order_id)` | Matched seller order. |
| `buyer_account_id` | `BIGINT` | No | - | `REFERENCES accounts(account_id)` | Buyer's trading account. |
| `seller_account_id`| `BIGINT` | No | - | `REFERENCES accounts(account_id)` | Seller's trading account. |
| `aggressor_side` | `order_side` | No | - | - | Side that crossed the book to initiate trade. |

---

### Table 8: `fills`
*Stores side-specific execution legs (one buyer fill and one seller fill per trade).*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `fill_id` | `BIGINT` | No | - | `PRIMARY KEY` | Unique surrogate key for the fill leg. |
| `trade_id` | `BIGINT` | No | - | `REFERENCES trades(trade_id)` | Parent trade match. |
| `order_id` | `BIGINT` | No | - | `REFERENCES orders(order_id)` | Order corresponding to this fill leg. |
| `account_id` | `BIGINT` | No | - | `REFERENCES accounts(account_id)` | Account receiving the fill. |
| `instrument_id`| `SMALLINT` | No | - | `REFERENCES instruments(instrument_id)` | Instrument traded. |
| `side` | `order_side` | No | - | - | Buy or Sell fill leg. |
| `price` | `NUMERIC(18,4)` | No | - | `CHECK (> 0)` | Execution price. |
| `quantity` | `BIGINT` | No | - | `CHECK (> 0)` | Executed share quantity. |
| `cash_delta` | `NUMERIC(20,4)` | No | - | - | Cash flow (- for buyer, + for seller). |
| `realized_pnl` | `NUMERIC(20,4)` | No | `0` | - | Realized profit or loss generated by this fill. |
| `executed_at` | `TIMESTAMPTZ` | No | - | - | Execution timestamp. |

---

### Table 9: `positions`
*Stores current inventory and average purchase cost per account and instrument.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `account_id` | `BIGINT` | No | - | `PK`, `REFERENCES accounts(account_id)` | Trading account. |
| `instrument_id`| `SMALLINT` | No | - | `PK`, `REFERENCES instruments(instrument_id)` | Instrument held. |
| `net_qty` | `BIGINT` | No | - | - | Net open position (+ long, - short, 0 flat). |
| `avg_cost` | `NUMERIC(18,6)` | No | - | `CHECK (avg_cost >= 0)` | Weighted average entry cost per share. |
| `realized_pnl` | `NUMERIC(20,4)` | No | `0` | - | Cumulative realized profit/loss. |
| `updated_at` | `TIMESTAMPTZ` | No | - | - | Timestamp of last position recalculation. |

---

### Table 10: `watchlists`
*Stores user watchlists for tracking securities.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `user_id` | `BIGINT` | No | - | `PK`, `REFERENCES users(user_id)` | User following the instrument. |
| `instrument_id`| `SMALLINT` | No | - | `PK`, `REFERENCES instruments(instrument_id)` | Instrument bookmarked. |
| `added_at` | `TIMESTAMPTZ` | No | `NOW()` | - | Timestamp added to watchlist. |

---

### Table 11: `surveillance_sessions`
*Stores 30-minute monitoring window aggregates and 8-dimensional feature vectors.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `session_id` | `BIGINT` | No | - | `PRIMARY KEY` | Unique surveillance session ID. |
| `account_id` | `BIGINT` | No | - | `REFERENCES accounts(account_id)` | Monitored trading account. |
| `instrument_id`| `SMALLINT` | No | - | `REFERENCES instruments(instrument_id)` | Monitored instrument. |
| `window_start` | `TIMESTAMPTZ` | No | - | - | Start of surveillance window. |
| `window_end` | `TIMESTAMPTZ` | No | - | `CHECK (> window_start)`| End of surveillance window. |
| `orders_placed`| `INT` | No | `0` | - | Total orders entered in window. |
| `orders_canceled`| `INT` | No | `0` | - | Total cancellations entered in window. |
| `trades_executed`| `INT` | No | `0` | - | Total trades completed in window. |
| `order_cancel_ratio` | `NUMERIC(8,6)`| No | `0` | - | Feature 1: Cancel count / Placed count. |
| `quote_to_trade_ratio`| `NUMERIC(14,4)`| No | `0` | - | Feature 2: Orders placed / Trades completed. |
| `median_lifetime_ms` | `NUMERIC(14,3)`| No | `0` | - | Feature 3: Median duration before cancellation (ms). |
| `size_skew` | `NUMERIC(14,4)`| No | `0` | - | Feature 4: Skewness between bid and ask order sizes. |
| `msg_rate_per_s`| `NUMERIC(14,4)`| No | `0` | - | Feature 5: Peak messaging velocity (orders/sec). |
| `book_imbalance_impact`| `NUMERIC(8,6)`| No | `0` | - | Feature 6: Correlated order book imbalance impact. |
| `opposite_side_fill_ratio`| `NUMERIC(8,6)`| No | `0` | - | Feature 7: Ratio of fills on opposite side of cancels. |
| `layering_depth`| `NUMERIC(8,3)`| No | `0` | - | Feature 8: Mean order book level depth of cancellations. |
| `features` | `DOUBLE PRECISION[]` / `vector(8)` | No | - | `CHECK (array_length(features,1)=8)` | 8-D normalized feature tensor. |
| `label` | `TEXT` | Yes | `NULL` | - | Diagnostic heuristic label. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | - | Session creation timestamp. |

---

### Table 12: `surveillance_patterns`
*Stores benchmark behavioral patterns of market abuse (spoofing, layering, stuffing).*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `pattern_id` | `SMALLINT` | No | - | `PRIMARY KEY` | Identifier for the pattern. |
| `name` | `TEXT` | No | - | `UNIQUE` | Pattern label (e.g., `'High Cancellation Rate'`, `'Layering'`). |
| `description` | `TEXT` | Yes | `NULL` | - | Regulatory and behavioral description. |
| `embedding` | `DOUBLE PRECISION[]` / `vector(8)` | No | - | `CHECK (array_length(embedding,1)=8)` | 8-D signature embedding vector. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | - | Pattern definition timestamp. |

---

### Table 13: `alerts`
*Stores compliance alerts generated when a surveillance session matches a suspicious pattern.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `alert_id` | `BIGINT` | No | - | `PRIMARY KEY` | Unique alert identifier. |
| `session_id` | `BIGINT` | No | - | `UNIQUE`, `REFERENCES surveillance_sessions(session_id)` | Monitored session that raised the alert. |
| `pattern_id` | `SMALLINT` | No | - | `REFERENCES surveillance_patterns(pattern_id)` | Best-matching abuse pattern. |
| `similarity` | `DOUBLE PRECISION`| No | - | `CHECK (>= 0 AND <= 1)` | Cosine similarity score (0.0 to 1.0). |
| `rule_flags` | `TEXT[]` | No | `'{}'` | - | Heuristic rules triggered. |
| `severity` | `alert_severity` | No | - | - | Severity rating (LOW, MEDIUM, HIGH, CRITICAL). |
| `status` | `alert_status` | No | `'OPEN'` | - | Investigation workflow status. |
| `assigned_to` | `BIGINT` | Yes | `NULL` | `REFERENCES users(user_id)` | Assigned compliance analyst. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | - | Alert trigger timestamp. |
| `resolved_at` | `TIMESTAMPTZ` | Yes | `NULL` | - | Resolution timestamp. |

---

### Table 14: `alert_notes`
*Stores analyst annotations, investigation findings, and full-text search vectors.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `note_id` | `BIGINT` | No | - | `PRIMARY KEY` | Unique note identifier. |
| `alert_id` | `BIGINT` | No | - | `REFERENCES alerts(alert_id)` | Alert being investigated. |
| `author_id` | `BIGINT` | No | - | `REFERENCES users(user_id)` | Analyst authoring the note. |
| `body` | `TEXT` | No | - | - | Full text of analyst commentary. |
| `body_tsv` | `TSVECTOR` | Yes | `NULL` | - | Pre-computed tsvector for full-text search. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | - | Note creation timestamp. |

---

### Table 15: `surveillance_feature_stats`
*Stores standardization metadata (mean, standard deviation, log transform) for feature scaling.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `position` | `SMALLINT` | No | - | `PRIMARY KEY` | Feature index in the 8-D vector (1 to 8). |
| `feature_name` | `TEXT` | No | - | `UNIQUE` | Metric identifier. |
| `log_transform`| `BOOLEAN` | No | `FALSE` | - | Whether log-scaling is applied prior to normalization. |
| `mean` | `DOUBLE PRECISION`| No | - | - | Baseline population mean. |
| `stddev` | `DOUBLE PRECISION`| No | - | `CHECK (stddev >= 0)` | Baseline population standard deviation. |

---

### Table 16: `audit_log`
*Immutable historical log of all critical state transitions across the platform.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `audit_id` | `BIGINT` | No | - | `PRIMARY KEY` | Sequential audit record ID. |
| `occurred_at` | `TIMESTAMPTZ` | No | `NOW()` | - | Wall-clock event timestamp. |
| `actor_user_id`| `BIGINT` | Yes | `NULL` | - | ID of user who initiated action (or NULL for system). |
| `action` | `TEXT` | No | - | - | Action name (e.g. `'ORDER_FILLED'`, `'LIMIT_EXCEEDED'`). |
| `entity_type` | `TEXT` | No | - | - | Target table / domain (`'orders'`, `'alerts'`, etc.). |
| `entity_id` | `TEXT` | No | - | - | Primary key identifier of target entity. |
| `old_data` | `JSONB` | Yes | `NULL` | - | Snapshot of state prior to modification. |
| `new_data` | `JSONB` | Yes | `NULL` | - | Snapshot of state following modification. |

---

### Table 17: `engine_offsets`
*Stores high-watermark consumer sequence numbers for matching engine trade projections.*

| Column | Data Type | Nullable | Default | Constraints | Description |
|---|---|---|---|---|---|
| `consumer` | `TEXT` | No | - | `PRIMARY KEY` | Consumer subscriber identifier. |
| `last_seq` | `BIGINT` | No | - | - | Last processed engine sequence number. |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | - | High-watermark update timestamp. |
