# MERIDIAN — CHEN NOTATION ENTITY-RELATIONSHIP (ER) MODEL

**Institution:** PES University, Department of Computer Science and Engineering  
**Course:** DBMS Experiential Learning — Level 3  
**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Course Instructor:** Dr. Nagasundari S  
**Student:** Prasanna Marihalkar (USN: PES1UG24CS684)  

---

## 1. College Notation Standards

As specified by the PES University DBMS Experiential Learning guidelines, this ER model strictly adheres to **Peter Chen Notation**:

- **Rectangle `[Entity]`:** Strong Entity Set.
- **Double Rectangle `[[Entity]]`:** Weak Entity Set (if applicable).
- **Diamond `<Relationship>`:** Relationship Set connecting entities.
- **Oval `(Attribute)`:** Attribute belonging to an entity or relationship.
- **Underlined Attribute `(<u>PK</u>)`:** Primary Key identifier.
- **Dashed Underlined Attribute `(---Discriminator---)`:** Partial Key of weak entity.
- **Double Oval `((Multi-valued))`:** Multi-valued attribute.
- **Dashed Oval `(Derived)`:** Derived attribute.
- **Lines & Cardinality:** Labeled with structural cardinalities (`1:1`, `1:N`, `M:N`, `1:0..1`).
- **Double Line:** Total participation (existence dependency).
- **Single Line:** Partial participation.

> [!IMPORTANT]
> The primary college submission PDF is preserved at [MERIDIAN_ER_Diagram_Chen_Notation.pdf](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/college/MERIDIAN_ER_Diagram_Chen_Notation.pdf), structured into 7 rigorous pages matching this specification.

---

## 2. Complete Entity Set (17 Entities)

The 17 entities are grouped across four logical domains:

### Domain 1: Identity & Account Management
1. **`USERS`**
   - *Key:* `user_id` (PK, Underlined)
   - *Attributes:* `email` (UK), `username` (UK), `password_hash`, `role`, `is_active`, `failed_logins`, `locked_until`, `last_login_at`, `created_at`
2. **`SESSIONS`**
   - *Key:* `session_id` (PK, UUID, Underlined)
   - *Attributes:* `user_id` (FK), `created_at`, `expires_at`, `ip_address`, `user_agent`
3. **`ACCOUNTS`**
   - *Key:* `account_id` (PK, Underlined)
   - *Attributes:* `user_id` (FK, UK), `owner_role`, `cash_balance`, `created_at`
4. **`RISK_LIMITS`**
   - *Key:* `account_id` (PK/FK, Underlined)
   - *Attributes:* `max_order_qty`, `max_order_notional`, `max_position_qty`, `max_open_orders`, `price_collar_pct`, `updated_at`

### Domain 2: Trading Master Data & Order Execution
5. **`INSTRUMENTS`**
   - *Key:* `instrument_id` (PK, Underlined)
   - *Attributes:* `symbol` (UK), `name`, `tick_size`, `min_price`, `max_price`, `reference_price`, `lot_size`, `is_active`, `created_at`, `sector`
6. **`ORDERS`**
   - *Key:* `order_id` (PK, Underlined)
   - *Attributes:* `client_order_id` (UK), `account_id` (FK), `instrument_id` (FK), `side`, `order_type`, `time_in_force`, `price`, `quantity`, `filled_qty`, `status`, `status_reason`, `submitted_at`, `updated_at`, `cancel_requested_at`
7. **`TRADES`**
   - *Key:* `trade_id` (PK, Underlined)
   - *Attributes:* `engine_seq` (UK), `instrument_id` (FK), `buy_order_id` (FK), `sell_order_id` (FK), `buyer_account_id` (FK), `seller_account_id` (FK), `price`, `quantity`, `aggressor_side`, `executed_at`
8. **`FILLS`**
   - *Key:* `fill_id` (PK, Underlined)
   - *Attributes:* `trade_id` (FK), `order_id` (FK), `account_id` (FK), `instrument_id` (FK), `side`, `price`, `quantity`, `cash_delta`, `realized_pnl`, `executed_at`
9. **`POSITIONS`**
   - *Key:* `(account_id, instrument_id)` (Composite PK, Underlined)
   - *Attributes:* `net_qty`, `avg_cost`, `realized_pnl`, `updated_at`
10. **`WATCHLISTS`**
    - *Key:* `(user_id, instrument_id)` (Composite PK, Underlined)
    - *Attributes:* `added_at`

### Domain 3: Market Surveillance & Compliance
11. **`SURVEILLANCE_SESSIONS`**
    - *Key:* `session_id` (PK, Underlined)
    - *Attributes:* `account_id` (FK), `instrument_id` (FK), `window_start`, `window_end`, `orders_placed`, `orders_canceled`, `trades_executed`, `order_cancel_ratio`, `quote_to_trade_ratio`, `median_lifetime_ms`, `size_skew`, `msg_rate_per_s`, `book_imbalance_impact`, `opposite_side_fill_ratio`, `layering_depth`, `features` (8-D vector), `label`, `created_at`
12. **`SURVEILLANCE_PATTERNS`**
    - *Key:* `pattern_id` (PK, Underlined)
    - *Attributes:* `name` (UK), `description`, `embedding` (8-D vector), `created_at`
13. **`ALERTS`**
    - *Key:* `alert_id` (PK, Underlined)
    - *Attributes:* `session_id` (FK, UK), `pattern_id` (FK), `similarity`, `rule_flags` (array), `severity`, `status`, `assigned_to` (FK), `created_at`, `resolved_at`
14. **`ALERT_NOTES`**
    - *Key:* `note_id` (PK, Underlined)
    - *Attributes:* `alert_id` (FK), `author_id` (FK), `body`, `body_tsv` (tsvector), `created_at`
15. **`SURVEILLANCE_FEATURE_STATS`**
    - *Key:* `position` (PK, Underlined)
    - *Attributes:* `feature_name` (UK), `log_transform`, `mean`, `stddev`

### Domain 4: System Audit & Offsets
16. **`AUDIT_LOG`**
    - *Key:* `audit_id` (PK, Underlined)
    - *Attributes:* `occurred_at`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `old_data` (JSONB), `new_data` (JSONB)
17. **`ENGINE_OFFSETS`**
    - *Key:* `consumer` (PK, Text, Underlined)
    - *Attributes:* `last_seq`, `updated_at`

---

## 3. Relationships and Cardinalities (Chen Notation)

### 3.1 Subsystem 1: Identity & Accounts
```
[USERS] ───── 1 ───── <SIGNS_IN> ───── N ───── [SESSIONS]
   │
   1
   │
 <OWNS> (Traders)
   │
 0..1
   │
[ACCOUNTS] ───── 1 ───── <HAS_LIMITS> ───── 0..1 ───── [RISK_LIMITS]
```
- **`<SIGNS_IN>`**: `USERS (1) : (N) SESSIONS`. A user may have 0 or more active login sessions. Each session belongs to exactly one user.
- **`<OWNS>`**: `USERS (1) : (0..1) ACCOUNTS`. In the institutional model, a trader owns at most one active cash account. Analysts and admins do not own trading accounts.
- **`<HAS_LIMITS>`**: `ACCOUNTS (1) : (0..1) RISK_LIMITS`. Risk limits are optionally assigned to an account.

### 3.2 Subsystem 2: Order Management & Trading
```
[ACCOUNTS] ───── 1 ───── <PLACES> ───── N ───── [ORDERS]
                                                    │
                                                    N
                                                    │
                                           <FOR_INSTRUMENT>
                                                    │
                                                    1
                                                    │
                                              [INSTRUMENTS]
```
- **`<PLACES>`**: `ACCOUNTS (1) : (N) ORDERS`. An account places many orders.
- **`<FOR_INSTRUMENT>`**: `ORDERS (N) : (1) INSTRUMENTS`. Each order specifies one tradable instrument.

### 3.3 Subsystem 3: Trade Execution & Settlement
```
                   ┌── 1 (Buyer Order) ──┐
[ORDERS] ──────────┤                     ├── <MATCHED_IN> ── 1 ── [TRADES]
                   └── 1 (Seller Order) ─┘                            │
                                                                      1
                                                                      │
                                                                 <SETTLES_INTO>
                                                                      │
                                                                      2
                                                                      │
                                                                   [FILLS]
```
- **`<MATCHED_IN>`**: An executed trade links two distinct orders: `buy_order_id` and `sell_order_id`.
- **`<SETTLES_INTO>`**: `TRADES (1) : (2) FILLS`. Every trade settles into exactly two fills: one for the buyer (`side = 'BUY'`) and one for the seller (`side = 'SELL'`). Enforced by `UNIQUE (trade_id, side)`.

### 3.4 Subsystem 4: Portfolio & Watchlists (Associative Entities)
```
[USERS] ───── 1 ───── <FOLLOWS> ───── N ───── [WATCHLISTS] ───── N ───── <CONTAINS> ───── 1 ───── [INSTRUMENTS]

[ACCOUNTS] ── 1 ───── <HOLDS> ─────── N ───── [POSITIONS]  ───── N ───── <HELD_IN>  ───── 1 ───── [INSTRUMENTS]
```
- **`WATCHLISTS`**: Resolves the `M:N` relationship between users and instruments.
- **`POSITIONS`**: Resolves the `M:N` holding relationship between trading accounts and instruments.

### 3.5 Subsystem 5: Market Surveillance
```
[ACCOUNTS] ───── 1 ───── <OBSERVED_IN> ───── N ───── [SURVEILLANCE_SESSIONS]
                                                              │
                                                              1
                                                              │
                                                           <RAISES>
                                                              │
                                                            0..1
                                                              │
[SURVEILLANCE_PATTERNS] ── 1 ── <MATCHED_TO> ── N ── [ALERTS]
```
- **`<OBSERVED_IN>`**: An account's trading activity across 30-minute windows forms surveillance sessions.
- **`<RAISES>`**: `SURVEILLANCE_SESSIONS (1) : (0..1) ALERTS`. Only abnormal sessions trigger alerts.
- **`<MATCHED_TO>`**: An alert is classified against a known manipulative pattern using vector cosine similarity.

### 3.6 Subsystem 6: Analyst Investigation
```
[USERS] (Analyst) ───── 1 ───── <WRITES> ───── N ───── [ALERT_NOTES] ───── N ───── <ANNOTATES> ───── 1 ───── [ALERTS]
```
- Compliance analysts investigate generated alerts and append timestamped, full-text searchable notes (`ALERT_NOTES`).

---

## 4. Visual Layout Summary

Detailed page-by-page Chen diagrams matching college viva expectations:
- **Page 1:** Identity & Account Management ([MERIDIAN_ER_Diagram_Chen_Notation.pdf, Page 1](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/college/MERIDIAN_ER_Diagram_Chen_Notation.pdf#page=1))
- **Page 2:** Order Management ([MERIDIAN_ER_Diagram_Chen_Notation.pdf, Page 2](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/college/MERIDIAN_ER_Diagram_Chen_Notation.pdf#page=2))
- **Page 3:** Trade Execution & Settlement ([MERIDIAN_ER_Diagram_Chen_Notation.pdf, Page 3](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/college/MERIDIAN_ER_Diagram_Chen_Notation.pdf#page=3))
- **Page 4:** Portfolio & Watchlist Associative Models ([MERIDIAN_ER_Diagram_Chen_Notation.pdf, Page 4](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/college/MERIDIAN_ER_Diagram_Chen_Notation.pdf#page=4))
- **Page 5:** Surveillance Architecture ([MERIDIAN_ER_Diagram_Chen_Notation.pdf, Page 5](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/college/MERIDIAN_ER_Diagram_Chen_Notation.pdf#page=5))
- **Page 6:** Alert Notes & System Auditing ([MERIDIAN_ER_Diagram_Chen_Notation.pdf, Page 6](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/college/MERIDIAN_ER_Diagram_Chen_Notation.pdf#page=6))
- **Page 7:** Global Summary Schema ([MERIDIAN_ER_Diagram_Chen_Notation.pdf, Page 7](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/college/MERIDIAN_ER_Diagram_Chen_Notation.pdf#page=7))
