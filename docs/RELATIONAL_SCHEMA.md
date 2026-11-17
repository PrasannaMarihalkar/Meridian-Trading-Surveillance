# MERIDIAN — RELATIONAL SCHEMA & NORMALIZATION SPECIFICATION

**Institution:** PES University, Department of Computer Science and Engineering  
**Course:** DBMS Experiential Learning — Level 3  
**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Course Instructor:** Dr. Nagasundari S  
**Student:** Prasanna Marihalkar (USN: PES1UG24CS684)  

---

## 1. Formal Relational Schema Definitions

Primary keys are marked with `(PK)` and bolded. Foreign keys are annotated with `(FK references Entity.Attribute)`.

1. **`users`** (
   **`user_id`** (PK),
   `email` (UK),
   `username` (UK),
   `password_hash`,
   `role`,
   `is_active`,
   `failed_logins`,
   `locked_until`,
   `last_login_at`,
   `created_at`
)

2. **`sessions`** (
   **`session_id`** (PK, UUID),
   `user_id` (FK references `users.user_id`),
   `created_at`,
   `expires_at`,
   `ip_address`,
   `user_agent`
)

3. **`accounts`** (
   **`account_id`** (PK),
   `user_id` (FK references `users.user_id`, UK),
   `owner_role`,
   `cash_balance`,
   `created_at`
)

4. **`risk_limits`** (
   **`account_id`** (PK, FK references `accounts.account_id`),
   `max_order_qty`,
   `max_order_notional`,
   `max_position_qty`,
   `max_open_orders`,
   `price_collar_pct`,
   `updated_at`
)

5. **`instruments`** (
   **`instrument_id`** (PK),
   `symbol` (UK),
   `name`,
   `tick_size`,
   `min_price`,
   `max_price`,
   `reference_price`,
   `lot_size`,
   `is_active`,
   `created_at`,
   `sector`
)

6. **`orders`** (
   **`order_id`** (PK),
   `client_order_id` (UK, UUID),
   `account_id` (FK references `accounts.account_id`),
   `instrument_id` (FK references `instruments.instrument_id`),
   `side`,
   `order_type`,
   `time_in_force`,
   `price`,
   `quantity`,
   `filled_qty`,
   `status`,
   `status_reason`,
   `submitted_at`,
   `updated_at`,
   `cancel_requested_at`
)

7. **`trades`** (
   **`trade_id`** (PK),
   `engine_seq` (UK),
   `instrument_id` (FK references `instruments.instrument_id`),
   `executed_at`,
   `price`,
   `quantity`,
   `buy_order_id` (FK references `orders.order_id`),
   `sell_order_id` (FK references `orders.order_id`),
   `buyer_account_id` (FK references `accounts.account_id`),
   `seller_account_id` (FK references `accounts.account_id`),
   `aggressor_side`
)

8. **`fills`** (
   **`fill_id`** (PK),
   `trade_id` (FK references `trades.trade_id`),
   `order_id` (FK references `orders.order_id`),
   `account_id` (FK references `accounts.account_id`),
   `instrument_id` (FK references `instruments.instrument_id`),
   `side`,
   `price`,
   `quantity`,
   `cash_delta`,
   `realized_pnl`,
   `executed_at`
) *[Constraint: UNIQUE(trade_id, side)]*

9. **`positions`** (
   **`account_id`** (PK, FK references `accounts.account_id`),
   **`instrument_id`** (PK, FK references `instruments.instrument_id`),
   `net_qty`,
   `avg_cost`,
   `realized_pnl`,
   `updated_at`
)

10. **`watchlists`** (
    **`user_id`** (PK, FK references `users.user_id`),
    **`instrument_id`** (PK, FK references `instruments.instrument_id`),
    `added_at`
)

11. **`surveillance_sessions`** (
    **`session_id`** (PK),
    `account_id` (FK references `accounts.account_id`),
    `instrument_id` (FK references `instruments.instrument_id`),
    `window_start`,
    `window_end`,
    `orders_placed`,
    `orders_canceled`,
    `trades_executed`,
    `order_cancel_ratio`,
    `quote_to_trade_ratio`,
    `median_lifetime_ms`,
    `size_skew`,
    `msg_rate_per_s`,
    `book_imbalance_impact`,
    `opposite_side_fill_ratio`,
    `layering_depth`,
    `features`,
    `label`,
    `created_at`
) *[Constraint: UNIQUE(account_id, instrument_id, window_start)]*

12. **`surveillance_patterns`** (
    **`pattern_id`** (PK),
    `name` (UK),
    `description`,
    `embedding`,
    `created_at`
)

13. **`alerts`** (
    **`alert_id`** (PK),
    `session_id` (FK references `surveillance_sessions.session_id`, UK),
    `pattern_id` (FK references `surveillance_patterns.pattern_id`),
    `similarity`,
    `rule_flags`,
    `severity`,
    `status`,
    `assigned_to` (FK references `users.user_id`),
    `created_at`,
    `resolved_at`
)

14. **`alert_notes`** (
    **`note_id`** (PK),
    `alert_id` (FK references `alerts.alert_id`),
    `author_id` (FK references `users.user_id`),
    `body`,
    `body_tsv`,
    `created_at`
)

15. **`surveillance_feature_stats`** (
    **`position`** (PK),
    `feature_name` (UK),
    `log_transform`,
    `mean`,
    `stddev`
)

16. **`audit_log`** (
    **`audit_id`** (PK),
    `occurred_at`,
    `actor_user_id`,
    `action`,
    `entity_type`,
    `entity_id`,
    `old_data`,
    `new_data`
)

17. **`engine_offsets`** (
    **`consumer`** (PK),
    `last_seq`,
    `updated_at`
)

---

## 2. Functional Dependency (FD) Analysis

For every relation $R$, we identify the non-trivial functional dependencies $X \rightarrow Y$:

| Relation | Candidate Keys | Functional Dependencies ($X \rightarrow Y$) | Determinant Assessment |
|---|---|---|---|
| `users` | `{user_id}`, `{email}`, `{username}` | `user_id` $\rightarrow$ all attributes; `email` $\rightarrow$ all attributes; `username` $\rightarrow$ all attributes | Every determinant is a candidate key. |
| `sessions` | `{session_id}` | `session_id` $\rightarrow$ `{user_id, created_at, expires_at, ip_address, user_agent}` | Determinant is primary key. |
| `accounts` | `{account_id}`, `{user_id}` | `account_id` $\rightarrow$ all attributes; `user_id` $\rightarrow$ all attributes | Determinants are candidate keys. |
| `risk_limits` | `{account_id}` | `account_id` $\rightarrow$ `{max_order_qty, max_order_notional, max_position_qty, max_open_orders, price_collar_pct, updated_at}` | Determinant is primary key. |
| `instruments` | `{instrument_id}`, `{symbol}` | `instrument_id` $\rightarrow$ all attributes; `symbol` $\rightarrow$ all attributes | Determinants are candidate keys. |
| `orders` | `{order_id}`, `{client_order_id}` | `order_id` $\rightarrow$ all attributes; `client_order_id` $\rightarrow$ all attributes | Determinants are candidate keys. |
| `trades` | `{trade_id}`, `{engine_seq}` | `trade_id` $\rightarrow$ all attributes; `engine_seq` $\rightarrow$ all attributes | Determinants are candidate keys. |
| `fills` | `{fill_id}`, `{(trade_id, side)}` | `fill_id` $\rightarrow$ all attributes; `{trade_id, side}` $\rightarrow$ all attributes | Determinants are candidate keys. |
| `positions` | `{(account_id, instrument_id)}` | `{account_id, instrument_id}` $\rightarrow$ `{net_qty, avg_cost, realized_pnl, updated_at}` | Determinant is composite primary key. |
| `watchlists` | `{(user_id, instrument_id)}` | `{user_id, instrument_id}` $\rightarrow$ `{added_at}` | Determinant is composite primary key. |
| `surveillance_sessions` | `{session_id}`, `{(account_id, instrument_id, window_start)}` | `session_id` $\rightarrow$ all attributes; `{account_id, instrument_id, window_start}` $\rightarrow$ all attributes | Determinants are candidate keys. |
| `surveillance_patterns` | `{pattern_id}`, `{name}` | `pattern_id` $\rightarrow$ all attributes; `name` $\rightarrow$ all attributes | Determinants are candidate keys. |
| `alerts` | `{alert_id}`, `{session_id}` | `alert_id` $\rightarrow$ all attributes; `session_id` $\rightarrow$ all attributes | Determinants are candidate keys. |
| `alert_notes` | `{note_id}` | `note_id` $\rightarrow$ all attributes | Determinant is primary key. |
| `surveillance_feature_stats` | `{position}`, `{feature_name}` | `position` $\rightarrow$ all attributes; `feature_name` $\rightarrow$ all attributes | Determinants are candidate keys. |
| `audit_log` | `{audit_id}` | `audit_id` $\rightarrow$ all attributes | Determinant is primary key. |
| `engine_offsets` | `{consumer}` | `consumer` $\rightarrow$ `{last_seq, updated_at}` | Determinant is primary key. |

---

## 3. Normalization Proofs

### 3.1 First Normal Form (1NF)
- **Requirement:** All attributes must be atomic; no repeating groups or composite columns without structure.
- **Verification:** All columns store primitive scalar types (`BIGINT`, `NUMERIC`, `TEXT`, `TIMESTAMPTZ`, `BOOLEAN`). While `features` and `embedding` use array/vector notation (`DOUBLE PRECISION[]` / `vector(8)`), they represent fixed-dimensional coordinate tensors manipulated as mathematical units for vector similarity operations (pgvector), not repeating unnormalized record sets. Every relation has a defined primary key. Hence, the schema satisfies **1NF**.

### 3.2 Second Normal Form (2NF)
- **Requirement:** Must be in 1NF and have **no partial key dependencies** (no non-prime attribute may depend on a proper subset of any candidate key).
- **Verification:**
  - For all single-attribute candidate key tables, partial dependency is mathematically impossible.
  - In composite key tables:
    - In `positions` (`account_id`, `instrument_id`), `net_qty`, `avg_cost`, and `realized_pnl` depend strictly on both the account AND the instrument together. An account alone does not determine position; an instrument alone does not determine position.
    - In `watchlists` (`user_id`, `instrument_id`), `added_at` records the exact instant that specific user bookmarked that specific instrument.
  - Hence, no partial functional dependencies exist. The schema satisfies **2NF**.

### 3.3 Third Normal Form (3NF)
- **Requirement:** Must be in 2NF and have **no transitive dependencies** ($X \rightarrow Y$ and $Y \rightarrow Z$ where neither is a candidate key).
- **Verification:**
  - In `orders`, instrument-specific details (`symbol`, `tick_size`) are not duplicated in `orders`; only the foreign key `instrument_id` is stored. User details (`username`, `email`) are not duplicated; only `account_id` is stored.
  - In `trades`, order attributes (`order_type`, `time_in_force`) are referenced via `buy_order_id` and `sell_order_id`, eliminating transitive redundancy.
  - In `alerts`, pattern descriptions are normalized into `surveillance_patterns`.
  - In `alert_notes`, author details are normalized into `users`.
  - Hence, no transitive functional dependencies exist. The schema satisfies **3NF**.

### 3.4 Boyce-Codd Normal Form (BCNF)
- **Requirement:** For every non-trivial functional dependency $X \rightarrow Y$, the determinant $X$ must be a **superkey**.
- **Verification:**
  - As proven in Section 2, for every single non-trivial FD across all 17 tables, $X$ is either the primary key or an alternate unique candidate key.
  - There are no dependencies where a non-prime attribute determines a prime attribute or any portion of a key.
  - Hence, every relation in MERIDIAN satisfies **Boyce-Codd Normal Form (BCNF)**.
