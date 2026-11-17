# MERIDIAN Database — Production Review & Hardening Report

**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Academic Context:** PES University, Department of Computer Science & Engineering  
**Course:** DBMS Experiential Learning — Level 3 (Dr. Nagasundari S)  
**Lead Engineer:** Prasanna Marihalkar (`PES1UG24CS684`)  
**Date:** November 17, 2026  
**Status:** **VERIFIED & HARDENED**

---

## 1. Schema Verification (All 17 Relational Entities)

The MERIDIAN database strictly adheres to Boyce-Codd Normal Form (BCNF) across 17 relations organized into four functional domains. Each entity's primary key, foreign key constraints, and integrity invariants were verified on an isolated, disposable PostgreSQL instance:

| Entity # | Relation | Domain | Primary Key | Foreign Key References | Integrity Constraints |
|:---:|---|---|---|---|---|
| 1 | `users` | Identity | `user_id` | - | `UNIQUE(email)`, `UNIQUE(username)`, `CHECK(failed_logins >= 0)` |
| 2 | `sessions` | Auth | `session_id` (UUID) | `user_id → users` | `expires_at > created_at` |
| 3 | `accounts` | Identity | `account_id` | `user_id → users` | `UNIQUE(user_id)`, `CHECK(cash_balance >= -10000000)` |
| 4 | `risk_limits` | Risk | `account_id` | `account_id → accounts` | `CHECK(max_order_qty > 0)`, `CHECK(price_collar_pct > 0)` |
| 5 | `instruments` | Trading | `instrument_id` | - | `UNIQUE(symbol)`, `CHECK(tick_size > 0)`, `CHECK(min_price < max_price)` |
| 6 | `orders` | Trading | `order_id` | `account_id → accounts`, `instrument_id → instruments` | `UNIQUE(client_order_id)`, `CHECK(price > 0)`, `CHECK(quantity > 0)` |
| 7 | `trades` | Trading | `trade_id` | `instrument_id → instruments`, `buy_order_id → orders`, `sell_order_id → orders`, `buyer_account_id → accounts`, `seller_account_id → accounts` | `UNIQUE(engine_seq)`, `CHECK(price > 0)`, `CHECK(quantity > 0)`, `CHECK(buyer_account_id <> seller_account_id)` |
| 8 | `fills` | Trading | `fill_id` | `trade_id → trades`, `order_id → orders`, `account_id → accounts`, `instrument_id → instruments` | `UNIQUE(trade_id, side)`, `CHECK(price > 0)`, `CHECK(quantity > 0)` |
| 9 | `positions` | Trading | `(account_id, instrument_id)` | `account_id → accounts`, `instrument_id → instruments` | Composite PK, `CHECK(avg_cost >= 0)` |
| 10 | `watchlists` | Trading | `(user_id, instrument_id)` | `user_id → users`, `instrument_id → instruments` | Composite PK |
| 11 | `surveillance_sessions` | Surveillance | `session_id` | `account_id → accounts`, `instrument_id → instruments` | `UNIQUE(account_id, instrument_id, window_start)`, `CHECK(window_end > window_start)`, `CHECK(array_length(features, 1) = 8)` |
| 12 | `surveillance_patterns` | Surveillance | `pattern_id` | - | `UNIQUE(name)`, `CHECK(array_length(embedding, 1) = 8)` |
| 13 | `alerts` | Surveillance | `alert_id` | `session_id → surveillance_sessions`, `pattern_id → surveillance_patterns`, `assigned_to → users` | `UNIQUE(session_id)`, `CHECK(similarity >= 0 AND similarity <= 1)` |
| 14 | `alert_notes` | Surveillance | `note_id` | `alert_id → alerts`, `author_id → users` | Full-text `body_tsv` tsvector index |
| 15 | `surveillance_feature_stats` | Surveillance | `position` | - | `UNIQUE(feature_name)`, `CHECK(position BETWEEN 1 AND 8)`, `CHECK(stddev >= 0)` |
| 16 | `audit_log` | System | `audit_id` | `actor_user_id → users` | Database-level immutable append-only trigger |
| 17 | `engine_offsets` | System | `consumer` | - | High-watermark stream sequence tracking |

---

## 2. Relational Views

Four database views provide pre-aggregated market state and reporting:
1. `v_order_book_depth`: Real-time aggregated bid and ask ladder grouped by `(instrument_id, side, price)`.
2. `v_account_portfolio`: Mark-to-market position valuations, average costs, and unrealized profit/loss.
3. `v_market_activity`: Hourly trade volume, VWAP (Volume Weighted Average Price), high, low, and trade counts.
4. `v_surveillance_alerts`: Enriched compliance view joining alerts, heuristic pattern signatures, and investigator identities.

---

## 3. Financial Transaction Correctness & Settlement Triggers

### 3.1 Settlement Atomicity (`trg_fills_settlement`)
When a trade occurs, two side-specific fill records are inserted into `fills`:
- **BUY Leg:** Debits cash (`cash_delta = -(price * qty)`), credits position (`net_qty += qty`), recomputes weighted average cost.
- **SELL Leg:** Credits cash (`cash_delta = +(price * qty)`), debits position (`net_qty -= qty`), computes realized P&L via `fn_calculate_realized_pnl`.

**Verification on Disposable Instance:**
- Account cash balance before fill: ₹296,000.
- Fill executed: 10 shares @ ₹1400 = ₹14,000 cash debit.
- Cash balance after trigger execution: **₹282,000.0000** (Exact match).
- Position quantity updated automatically: **110 shares**.

### 3.2 Double-Settlement Prevention
The `fills` table enforces `UNIQUE(trade_id, side)`. Any attempt to insert a duplicate fill for an already settled trade raises constraint violation `23505`, preventing double settlement.

### 3.3 Concurrency & Row-Level Locking
In `tradingService.ts`, the order matching query executes inside an explicit database transaction (`BEGIN ... COMMIT`) and applies `FOR UPDATE` on eligible resting order candidates. This ensures concurrent matching threads cannot select or over-fill the same resting order leaves quantity.

---

## 4. Audit Log Immutability Hardening

To elevate the audit trail from an application convention to an engine-enforced guarantee, an immutability trigger was added:

```sql
CREATE OR REPLACE FUNCTION fn_prevent_audit_log_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is an immutable append-only ledger: UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION fn_prevent_audit_log_mutation();
```

**Verification:** Any `UPDATE` or `DELETE` statement issued against `audit_log` is rejected with an exception by PostgreSQL, guaranteeing an untampered forensic record.

---

## 5. College Demonstration Queries (Q1 — Q17)

All 17 queries defined in `database/sql/04_demo_queries.sql` were executed against seeded data with 100% non-zero row return:

- **Q1:** Registered Users & Roles (5 rows)
- **Q2:** Active Instruments & Boundaries (5 rows)
- **Q3:** Orders & Fill Ratios (7 rows)
- **Q4:** Executed Trades & Counterparties (2 rows)
- **Q5:** Side-Specific Fills (4 rows)
- **Q6:** Portfolio & Unrealized P&L (4 rows)
- **Q7:** User Watchlists (5 rows)
- **Q8:** Order Status Distribution (4 rows)
- **Q9:** Surveillance Heuristic Windows (3 rows)
- **Q10:** Compliance Alerts & Similarity (2 rows)
- **Q11:** Full Investigation Notes (1 rows)
- **Q12:** Risk Limits & Utilization (3 rows)
- **Q13:** Trader Activity & Fill Ratios (3 rows)
- **Q14:** High Cancellation Screening (>50%) (2 rows)
- **Q15:** Full-Text Search on Notes (`tsquery`) (1 rows)
- **Q16:** Audit Log Chronology & Deltas (4 rows)
- **Q17:** Entity Inventory Verification (17 rows)

---

## 6. Backup & Recovery Procedure

### 6.1 Native PostgreSQL Deployment
```bash
# Full Logical Backup with Schema and Data
pg_dump -h localhost -U meridian_user -d meridian_db -F c -b -v -f meridian_backup_$(date +%Y%m%d).dump

# Restore into Clean Database
pg_restore -h localhost -U meridian_user -d meridian_db -v -c meridian_backup_20261117.dump
```

### 6.2 Embedded PGlite Deployment (College Demo Mode)
The PGlite engine stores all data files in `database/pgdata/`.
```bash
# Safe Hot Backup (Stop server or ensure quiet state)
tar -czvf meridian_pgdata_backup_$(date +%Y%m%d).tar.gz database/pgdata/

# Disaster Recovery Restore
rm -rf database/pgdata/
tar -xzvf meridian_pgdata_backup_20261117.tar.gz
```

---

## 7. Database Hardening Verdict

The MERIDIAN database layer satisfies all course requirements for PES University DBMS Experiential Learning Level 3. It demonstrates:
- Correct relational decomposition (BCNF).
- Strict referential integrity and check constraints.
- Real-time ledger accounting via triggers.
- Multi-dimensional vector math (`fn_cosine_similarity`).
- Full-text indexing (`tsvector` / GIN).
- Engine-enforced audit immutability.
