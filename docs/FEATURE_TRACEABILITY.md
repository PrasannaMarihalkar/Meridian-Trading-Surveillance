# MERIDIAN — Feature Traceability Matrix

**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Institution:** PES University, Dept. of Computer Science & Engineering  
**Course:** DBMS Experiential Learning — Level 3  
**Faculty Evaluator:** Dr. Nagasundari S  
**Student:** Prasanna Marihalkar (USN: `PES1UG24CS684`)  
**Audit Date:** November 17, 2026  

This document maps every college requirement to its precise implementation file(s), database artifact(s), demo SQL query, test evidence, and documentation reference.

---

## 1. College Requirements — Full Traceability

| # | Requirement | Implementation File(s) | Database Table(s) / View(s) | Demo SQL Query | Test Evidence | Documentation | Status |
|---|---|---|---|---|---|---|:---:|
| **R1** | 17 Normalized Relational Tables (BCNF) | `database/sql/01_schema.sql` | All 17 tables (see §2) | Q17 (Verification Count) | `scripts/verify_disposable_db.ts` | `docs/RELATIONAL_SCHEMA.md`, `docs/DATA_DICTIONARY.md` | ✅ PASS |
| **R2** | RBAC — 3 Roles (TRADER / ANALYST / ADMIN) | `backend/services/authService.ts`, `backend/middleware/auth.ts` | `users` (role ENUM) | Q1 (User Directory) | `tests/api.test.ts` Tests 1 & 2 | `docs/SECURITY.md` | ✅ PASS |
| **R3** | Account & Risk Limit Auto-Provisioning | `backend/services/authService.ts` | `accounts`, `risk_limits` | Q6 (Positions & Portfolio) | `tests/api.test.ts` Test 1 | `docs/ARCHITECTURE.md §4` | ✅ PASS |
| **R4** | Pre-Trade Risk Filters (Qty, Notional, 5% Collar) | `backend/services/tradingService.ts` (`validateRiskLimits`) | `orders`, `risk_limits`, `instruments` | Q3 (Orders with Fill Ratio) | `tests/api.test.ts` Tests 3 & 4 | `docs/SECURITY.md` | ✅ PASS |
| **R5** | C++20 Low-Latency Order Matching Engine | `engine/src/order_book.cpp`, `engine/src/main.cpp` | *(standalone binary — not wired to backend at runtime)* | *(benchmark only)* | `engine/tests/test_order_book.cpp` (5/5 PASS) | `docs/ARCHITECTURE.md §3`, `docs/CPP_ENGINE_REVIEW.md` | ✅ PASS |
| **R6** | SPSC Lock-Free Ring Buffer | `engine/include/spsc_queue.hpp` | *(engine-internal)* | *(benchmark only)* | `engine/tests/test_order_book.cpp` Test 4 (100K msgs, 0 drops) | `docs/ARCHITECTURE.md §3.2` | ✅ PASS |
| **R7** | UDP Packet Sequence Gap Detection | `engine/include/gap_detector.hpp` | *(engine-internal)* | *(benchmark only)* | `engine/tests/test_order_book.cpp` Test 5 | `docs/ARCHITECTURE.md §3.3` | ✅ PASS |
| **R8** | Side-Specific Trade Fills (BUY & SELL legs) | `backend/services/tradingService.ts` (`submitOrder`) | `fills` (`UNIQUE(trade_id, side)`) | Q5 (Fill Legs per Trade) | `tests/api.test.ts` Test 5 | `docs/DATA_DICTIONARY.md §fills` | ✅ PASS |
| **R9** | Settlement Trigger (`trg_fills_settlement`) | `database/sql/02_views_triggers.sql` | `fills` → `accounts`, `positions` | Q6 (Portfolio with Avg Cost) | `tests/api.test.ts` Test 6, `verify_disposable_db.ts` | `docs/ARCHITECTURE.md §4` | ✅ PASS |
| **R10** | Watchlist Management | `backend/routes/accountRoutes.ts`, `frontend/src/components/TradingTerminal.tsx` | `watchlists` | Q7 (Watchlists) | `tests/api.test.ts` (account endpoints) | `docs/USER_GUIDE.md` | ✅ PASS |
| **R11** | Vector Cosine Similarity Surveillance | `backend/services/surveillanceService.ts`, `database/sql/03_functions.sql` (`fn_cosine_similarity`) | `surveillance_sessions`, `surveillance_patterns` | Q9 (Surveillance Sessions), Q10 (Alerts) | `tests/api.test.ts` Test 8 | `docs/ARCHITECTURE.md §6` | ✅ PASS |
| **R12** | Market Abuse Alert Generation & Case Tracking | `backend/services/surveillanceService.ts`, `frontend/src/components/SurveillanceConsole.tsx` | `alerts`, `alert_notes` | Q10 (Alerts & Analyst), Q11 (Investigation Notes) | `tests/api.test.ts` Test 9 | `docs/ARCHITECTURE.md §6` | ✅ PASS |
| **R13** | Full-Text Search on Case Notes (`tsvector`) | `database/sql/02_views_triggers.sql` (`trg_alert_notes_tsv`), GIN index | `alert_notes` (`body_tsv tsvector`) | Q11 (Full-Text Notes Search) | `tests/api.test.ts` Test 9 | `docs/VIVA_PREPARATION.md Q12` | ✅ PASS |
| **R14** | Immutable Audit Log | `database/sql/02_views_triggers.sql` (`trg_orders_audit`), `backend/routes/systemRoutes.ts` | `audit_log` | Q14 (Audit Log) | `tests/api.test.ts` Test 7 | `docs/SECURITY.md` | ✅ PASS |
| **R15** | High-Watermark Stream Offset Tracking | `database/sql/01_schema.sql` (`engine_offsets`), views | `engine_offsets` | Q17 (Verification Count, includes offset row) | `scripts/verify_disposable_db.ts` | `docs/ARCHITECTURE.md` | ✅ PASS |
| **R16** | 17 Official Demonstration SQL Queries | `database/sql/04_demo_queries.sql`, `scripts/run_demo_queries.ts`, `frontend/src/components/CollegeShowcase.tsx` | All 17 tables + 4 views | Q1–Q17 (all) | `npm run demo:queries` (17/17 clean) | `docs/DEMO_GUIDE.md` | ✅ PASS |
| **R17** | Real-Time WebSocket Streaming | `backend/websocket.ts`, `frontend/src/components/TradingTerminal.tsx` | `trades`, `orders` (pushed on mutation) | *(live stream, not SQL query)* | `scripts/test_websocket.ts` (CONNECTION_ACK, PING/PONG) | `docs/API_DOCUMENTATION.md` | ✅ PASS |
| **R18** | Institutional Bloomberg-Grade Frontend | `frontend/src/` (React 18 / TypeScript / Tailwind) | Reads all tables via REST/WS | *(browser UI)* | Browser subagent QA, responsive layout verified | `docs/USER_GUIDE.md`, `docs/DEMO_GUIDE.md` | ✅ PASS |
| **R19** | Peter Chen Notation ER Diagram Pack | `docs/ER_DIAGRAM.md`, `docs/college/MERIDIAN_ER_Diagram_Chen_Notation.pdf` | *(documentation only)* | *(N/A)* | Cross-referenced with DDL, formal review | `docs/ER_DIAGRAM.md` | ✅ PASS |
| **R20** | Single-Command Zero-Config Execution | `package.json` (`npm start`), `Dockerfile`, `docker-compose.yml` | *(all, via embedded PGlite)* | *(N/A — startup check)* | Health endpoint `GET /api/health → 200 OK` | `docs/DEPLOYMENT.md` | ✅ PASS |

**Result: 20/20 requirements PASS**

---

## 2. The 17 Database Entities

| # | Table | Domain | Key Columns | Purpose |
|---|---|---|---|---|
| 1 | `users` | Identity | `user_id`, `role` ENUM | User registry with role-based access control |
| 2 | `sessions` | Auth | `session_id` (UUID), `expires_at` | Active JWT session tracking |
| 3 | `accounts` | Finance | `account_id`, `user_id`, `cash_balance` | Trading accounts with real-time cash ledger |
| 4 | `risk_limits` | Compliance | `account_id`, `max_order_qty`, `price_collar_pct` | Per-account pre-trade risk parameters |
| 5 | `instruments` | Market | `instrument_id`, `symbol`, `reference_price` | Tradable securities (RELIANCE, TCS, INFY, etc.) |
| 6 | `orders` | Trading | `order_id`, `side`, `status`, `filled_qty` | Order lifecycle ledger |
| 7 | `trades` | Trading | `trade_id`, `engine_seq`, `aggressor_side` | Matched execution records |
| 8 | `fills` | Settlement | `fill_id`, `(trade_id, side)` UNIQUE | Side-specific settlement legs |
| 9 | `positions` | Portfolio | `(account_id, instrument_id)` PK | Net inventory and realized P&L |
| 10 | `watchlists` | UX | `(user_id, instrument_id)` PK | User-curated instrument bookmarks |
| 11 | `surveillance_sessions` | Surveillance | `session_id`, `order_cancel_ratio`, `features` NUMERIC[] | 8-D behavioral feature window |
| 12 | `surveillance_patterns` | Surveillance | `pattern_id`, `embedding` NUMERIC[] | Known abuse pattern benchmarks |
| 13 | `alerts` | Compliance | `alert_id`, `similarity`, `severity`, `status` | Auto-generated market abuse case files |
| 14 | `alert_notes` | Compliance | `note_id`, `body_tsv` tsvector | Analyst investigation notes with FTS |
| 15 | `surveillance_feature_stats` | Analytics | `instrument_id`, `window_start` | Historical feature window statistics |
| 16 | `audit_log` | Governance | `event_id`, `action`, `old_data`, `new_data` JSONB | Immutable state-transition log |
| 17 | `engine_offsets` | Infrastructure | `consumer_name`, `last_seq` | High-watermark consumer offset tracking |

---

## 3. The 4 Database Views

| View | Source Tables | Purpose | Demo Query |
|---|---|---|---|
| `v_order_book_depth` | `orders`, `instruments` | Aggregated bid/ask depth per price level | Used by Level 2 ladder API |
| `v_account_portfolio` | `positions`, `accounts`, `users`, `instruments` | Net positions, avg cost, unrealized P&L | Q6 (Positions & Portfolio) |
| `v_market_activity` | `trades`, `instruments`, `engine_offsets` | Recent execution tape with instrument context | Q4 (Executed Trades) |
| `v_surveillance_alerts` | `alerts`, `surveillance_patterns`, `users`, `accounts` | Alert summary with analyst assignment | Q10 (Compliance Alerts) |

---

## 4. Database Triggers

| Trigger | Table | Event | Action |
|---|---|---|---|
| `trg_fills_settlement` | `fills` | `AFTER INSERT` | Updates `accounts.cash_balance`, recalculates `positions.net_qty`, `avg_cost`, `realized_pnl` |
| `trg_orders_audit` | `orders` | `AFTER UPDATE` | Writes JSON snapshot (`old_data → new_data`) into `audit_log` |
| `trg_alert_notes_tsv` | `alert_notes` | `BEFORE INSERT OR UPDATE` | Parses note body into English-stemmed `tsvector` for GIN index |

---

## 5. Stored Functions

| Function | Signature | Purpose |
|---|---|---|
| `fn_cosine_similarity` | `(a NUMERIC[], b NUMERIC[]) → NUMERIC` | Computes cosine similarity between two 8-D feature vectors |
| `fn_calculate_realized_pnl` | `(account_id INT, instrument_id INT, qty INT, price NUMERIC) → NUMERIC` | Weighted average cost P&L calculator |

---

## 6. The 17 Official Demo Queries

| Query | Title | Key SQL Concepts | File |
|---|---|---|---|
| Q1 | User Directory | Simple SELECT, ORDER BY | `04_demo_queries.sql:L10` |
| Q2 | Active Instruments | WHERE filter | `04_demo_queries.sql:L15` |
| Q3 | Orders with Fill Ratio | Multi-table JOIN, computed column, `ROUND()` | `04_demo_queries.sql:L22` |
| Q4 | Executed Trades | 4-way JOIN, notional calculation | `04_demo_queries.sql:L39` |
| Q5 | Trade Fill Legs (BUY & SELL) | 3-way JOIN, `ORDER BY trade_id, side` | `04_demo_queries.sql:L57` |
| Q6 | Positions & Portfolio | 4-way JOIN, unrealized P&L calculation | `04_demo_queries.sql:L74` |
| Q7 | Watchlists | 3-way JOIN | `04_demo_queries.sql:L91` |
| Q8 | Order Distribution by Status | `GROUP BY`, `COUNT`, `SUM`, aggregate | `04_demo_queries.sql:L103` |
| Q9 | Surveillance Sessions | 4-way JOIN, `ORDER BY cancel_ratio DESC` | `04_demo_queries.sql:L112` |
| Q10 | Compliance Alerts & Analysts | 3-way JOIN, `LEFT JOIN`, `COALESCE`, `ROUND` | `04_demo_queries.sql:L129` |
| Q11 | Investigation Notes (Full-Text) | 3-way JOIN, `tsvector`, `@@`, `plainto_tsquery` | `04_demo_queries.sql:L144` |
| Q12 | Audit Log History | JSONB, `old_data`, `new_data` inspection | `04_demo_queries.sql` |
| Q13 | Risk Limits by Account | JOIN, risk parameter display | `04_demo_queries.sql` |
| Q14 | Sessions & Login History | Sessions table with expiry tracking | `04_demo_queries.sql` |
| Q15 | Surveillance Pattern Library | Pattern embeddings, thresholds | `04_demo_queries.sql` |
| Q16 | Feature Stats Aggregation | `GROUP BY`, window statistics | `04_demo_queries.sql` |
| Q17 | College Verification Count | 17-way `UNION ALL`, row count per table | `04_demo_queries.sql` |

---

## 7. C++ Engine — Honest Integration Status

> **IMPORTANT:** The C++ matching engine (`engine/`) is a **standalone compiled binary** used for benchmarking and correctness verification. It is **not called at runtime by the Node.js/TypeScript backend**.

| Aspect | Detail |
|---|---|
| **What the C++ engine does** | Implements a price-time priority limit order book, SPSC lock-free ring buffer, and UDP gap detector as a self-contained C++20 binary |
| **How it is invoked** | Compiled and run manually in WSL/Linux: `./benchmark_engine`, `./test_order_book` |
| **IPC with backend?** | None. No sockets, pipes, shared memory, or HTTP calls between Node.js and the C++ binary |
| **What the backend uses for matching** | `backend/services/tradingService.ts` → pure TypeScript price-time priority matching against PostgreSQL order rows |
| **Benchmark numbers** | 4,345,181 orders/sec, 145 ns p50 latency (measured on standalone binary, not production path) |
| **Why this design** | College demonstration of systems programming concepts alongside relational database concepts; a production exchange would use IPC/FFI to wire them together |

---

## 8. RBAC Coverage

| Role | Capabilities | Restricted From |
|---|---|---|
| `TRADER` | Place/cancel orders, view own portfolio, view order book, manage watchlist | Surveillance console, alert investigation, admin audit logs |
| `ANALYST` | All TRADER capabilities + view all alerts, investigate cases, add notes, trigger surveillance scans | Admin system functions |
| `ADMIN` | All capabilities + view audit logs, system health, user management | *(Full access)* |

---

## 9. Rate Limiter Coverage

| Endpoint Group | Window | Limit | Implementation |
|---|---|---|---|
| `/api/auth/login` | 60 seconds | 30 req | `backend/middleware/rateLimiter.ts` |
| `/api/auth/register` | 60 seconds | 15 req | `backend/middleware/rateLimiter.ts` |
| `/api` (general) | 60 seconds | 300 req | `backend/middleware/rateLimiter.ts` |

**Implementation:** In-memory `Map<key, {count, resetTime}>` with sliding window expiry. Responds with `429 Too Many Requests`, `X-RateLimit-*` headers, and `Retry-After`.

---

*Generated for PES University DBMS Experiential Learning — Level 3 College Submission.*
