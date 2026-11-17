# MERIDIAN — DATABASE DESIGN SPECIFICATION

**Institution:** PES University, Department of Computer Science and Engineering  
**Course:** DBMS Experiential Learning — Level 3  
**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Course Instructor:** Dr. Nagasundari S  
**Student:** Prasanna Marihalkar (USN: PES1UG24CS684)  

---

## 1. Domain Organization & Entity Topologies

The MERIDIAN relational core consists of **17 normalized entities** grouped across four operational domains:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DOMAIN 1: IDENTITY & ACCOUNTS                   │
│   users (PK: user_id) ──── 1:N ──── sessions (PK: session_id)          │
│     │ 1:0..1                                                           │
│   accounts (PK: account_id) ──── 1:0..1 ──── risk_limits               │
└───────────────────────────┬────────────────────────────────────────────┘
                            │ 1:N (places)
┌───────────────────────────▼────────────────────────────────────────────┐
│                        DOMAIN 2: TRADING MASTER & EXECUTION            │
│   instruments (PK: instrument_id) ◄── N:1 ── orders (PK: order_id)     │
│     ▲                                            │ 1:N (matched)       │
│     │                                            ▼                     │
│     │                                       trades (PK: trade_id)      │
│     │                                            │ 1:2 (settles)       │
│     │                                            ▼                     │
│     └────── N:1 ─────────────────────────── fills (PK: fill_id)        │
│                                                  │ (settlement trigger)│
│                                                  ▼                     │
│   positions (Composite PK: account_id, instrument_id)                  │
│   watchlists (Composite PK: user_id, instrument_id)                    │
└───────────────────────────┬────────────────────────────────────────────┘
                            │ 1:N (observed in)
┌───────────────────────────▼────────────────────────────────────────────┐
│                        DOMAIN 3: MARKET SURVEILLANCE                   │
│   surveillance_sessions (PK: session_id) ── 1:0..1 ── alerts (alert_id)│
│   surveillance_patterns (PK: pattern_id) ── 1:N  ──┘                   │
│   alert_notes (PK: note_id, FK: alert_id, author_id)                   │
│   surveillance_feature_stats (PK: position)                            │
└────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│                        DOMAIN 4: SYSTEM TABLES                         │
│   audit_log (PK: audit_id, JSONB old_data/new_data)                    │
│   engine_offsets (PK: consumer)                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Resolutions to Known Design Questions

| Question | Original ERD Annotation | Discovered Flaw | Corrected Implementation & Engineering Justification |
|---|---|---|---|
| **1. `users.role` Uniqueness** | `UK` | Unique constraint on `role` permits only 1 Trader, 1 Analyst, and 1 Admin across the entire system. | **Removed `UK` on `role`.** Typed with `user_role` ENUM (`'TRADER'`, `'ANALYST'`, `'ADMIN'`). Multiple users can share identical roles. |
| **2. `accounts.owner_role` FK** | `FK` | ER diagram lacked a separate `roles` lookup table; pointing `owner_role` nowhere breaks referential integrity. | **Stored as typed `user_role NOT NULL`.** Enforces valid domain roles without introducing redundant normalization. |
| **3. `fills` Uniqueness** | `trade_id` (UK), `side` (UK) | Individual `UK` on `trade_id` forbids 2 fills per trade. Individual `UK` on `side` allows only 1 BUY fill in the entire database. | **Implemented `UNIQUE (trade_id, side)`.** Guarantees each trade has at most one buyer fill and one seller fill. |
| **4. `surveillance_sessions`** | `account_id` (UK), `instrument_id` (UK), `window_start` (UK) | Individual uniqueness forbids any account or instrument from being monitored in subsequent 30-min windows. | **Implemented `UNIQUE (account_id, instrument_id, window_start)`.** Validates that an account has at most one monitoring session per instrument per time window. |
| **5. Account to Risk Limits** | `1 : 0..1` | Risk limits are optional per account upon registration. | **`risk_limits.account_id` is both PK and FK.** Ensures an account has at most one limit configuration (`1 : 0..1`). |

---

## 3. Advanced Database Features Demonstrated

### 3.1 ACID Transactions
Multi-statement operations (such as order matching, trade execution, buyer fill creation, and seller fill creation) execute inside strict transaction boundaries. If seller inventory or buyer cash is insufficient, the transaction rolls back cleanly.

### 3.2 Automated Triggers
1. **`trg_fills_settlement`**: Fires `AFTER INSERT ON fills`. Recomputes the account's open inventory (`net_qty`), recalculates weighted average entry cost (`avg_cost`), calculates realized P&L on position reductions, and updates `cash_balance` via `cash_delta`.
2. **`trg_orders_audit`**: Fires `AFTER UPDATE ON orders`. Detects state transitions (`OPEN` $\rightarrow$ `FILLED`, `CANCELLED`) and inserts an immutable event snapshot with JSON old and new data into `audit_log`.
3. **`trg_alert_notes_tsv`**: Fires `BEFORE INSERT OR UPDATE ON alert_notes`. Generates PostgreSQL `tsvector` from note commentary using English stemming.

### 3.3 Stored Procedures & Functions
1. **`fn_cosine_similarity(vec_a, vec_b)`**: Computes cosine angle between 8-D normalized feature vectors:
   $$\text{sim}(\vec{A}, \vec{B}) = \frac{\sum_{i=1}^8 A_i B_i}{\sqrt{\sum A_i^2} \sqrt{\sum B_i^2}}$$
2. **`fn_calculate_realized_pnl`**: Implements weighted average cost inventory matching:
   $$\text{Realized P&L} = \min(\text{Position}, \text{Fill Qty}) \times (\text{Fill Price} - \text{Avg Cost})$$

### 3.4 Relational Views
- `v_top_of_book`: BBO aggregated from active orders per instrument.
- `v_portfolio_summary`: Mark-to-market valuations and unrealized P&L joined with real-time market prices.
- `v_trade_blotter`: Trade records with buyer and seller usernames and traded notionals.
- `v_surveillance_summary`: Compliance alerts joined with matched abuse patterns and analyst assignments.

### 3.5 Full-Text & Multi-Column Indexing
- GIN index on `alert_notes.body_tsv` supporting sub-millisecond keyword searches (`@@ plainto_tsquery('english', '...')`).
- Composite index on `orders(account_id, submitted_at DESC)`.
- Composite index on `trades(instrument_id, executed_at DESC)`.
- Unique composite index on `fills(trade_id, side)`.
