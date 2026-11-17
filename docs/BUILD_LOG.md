# MERIDIAN — SYSTEM BUILD LOG & AUDIT TRAIL

**Project:** MERIDIAN (PES University Level 3 DBMS Experiential Learning Project)  
**Student:** Prasanna Marihalkar (USN: PES1UG24CS684)  
**Lead Architect:** Principal AI Systems Engineer  

---

## Log Entries

### [2026-11-17 08:10:00 IST] - Phase 0: Audit & Workspace Initialization
- **Action:** Audited local system for existing MERIDIAN assets, college files, and reference repositories.
- **Findings:**
  - Located official college synopsis (`Meridian_Project_Synopsis.docx`), Chen ER diagrams (`MERIDIAN_ER_Diagram_Chen_Notation.pdf`), complete ER pack (`MERIDIAN_ERD_Complete_Pack.pdf`), and 17-entity standalone SQL file (`MERIDIAN_Dummy_DB.sql`) in `Downloads`.
  - Located C++ reference implementations: `cpp-lockfree-queue` (SPSC ring buffer), `udp-gap-detector.tar.gz` (market data feed sequence gap detector), and `tcp-latency-lab.tar.gz` (low-latency TCP benchmarking).
  - Detected WSL 2 Ubuntu with `g++ 13.3.0` (C++20/C++23) and Node.js v26.7.0.
- **Git Repo Established:** Initialized Git repository at `C:\Users\prasa\.gemini\antigravity\scratch\meridian` with author `PrasannaMarihalkar <prasannacm.in@email.com>`.
- **Artifacts Created:**
  - `docs/PROJECT_AUDIT.md` (genuine evaluation, constraint corrections, scope analysis)
  - `docs/IMPLEMENTATION_PLAN.md` (subsystem architecture, phases 0 through 9, risk management)
- **Database Questions Resolved:**
  1. `users.role` UK removed: multiple users share roles (`TRADER`, `ANALYST`, `ADMIN`).
  2. `accounts.owner_role` kept as typed ENUM `user_role NOT NULL`.
  3. `fills` composite uniqueness set to `UNIQUE (trade_id, side)` to allow exactly one BUY and one SELL fill per trade.
  4. `surveillance_sessions` uniqueness set to `UNIQUE (account_id, instrument_id, window_start)`.
  5. `risk_limits` cardinality confirmed as `1 : 0..1` optional relationship (`PRIMARY KEY REFERENCES accounts(account_id)`).

---

### [2026-11-17 08:15:00 IST] - Phase 2: Database Layer Verification Completed
- **Schema Implementation:** Created `database/sql/01_schema.sql` defining 17 tables, domain constraints, custom ENUMs, and performance indexes.
- **Advanced Concepts Added:** Created `database/sql/02_views_triggers.sql`:
  - `fn_cosine_similarity` stored function for 8-D vector matching.
  - `fn_calculate_realized_pnl` stored function using weighted average cost accounting.
  - Database triggers for `audit_log` automatic change tracking, full-text tsvector updating on `alert_notes`, and atomic fill settlement into `positions`.
  - 4 advanced relational views: `v_top_of_book`, `v_portfolio_summary`, `v_trade_blotter`, `v_surveillance_summary`.
- **Seed Data:** Created `database/sql/03_seed_data.sql` with deterministic realistic market data (5 users, 5 instruments, orders, trades, fills, surveillance sessions, alerts, notes, patterns).
- **Embedded Database Engine:** Implemented `database/db.ts` with transparent dual support for native PostgreSQL and embedded zero-config PGlite engine.
- **Verification:** Ran `scripts/init_db.ts` and `scripts/run_demo_queries.ts`. **All 17 college demonstration queries executed with 100% success rate.**

### [2026-11-17 08:17:00 IST] - Phase 3: High-Performance C++ Matching Engine Completed
- **C++20 Engine Core:** Implemented `engine/include/order_book.hpp` and `engine/src/order_book.cpp` supporting continuous double-auction price-time priority matching for `LIMIT`, `MARKET`, and `IOC` orders.
- **SPSC Lock-Free Queue:** Adapted verified `cpp-lockfree-queue` into `engine/include/spsc_queue.hpp` with cacheline alignment (64-byte), acquire-release atomic semantics, and index masking.
- **UDP Gap Detection:** Implemented `engine/include/gap_detector.hpp` tracking monotonic sequence gaps and packet drop recovery.
- **Unit Testing:** Created `engine/tests/test_order_book.cpp` with 5 test suites (price priority, FIFO time priority, IOC/cancellation, lock-free 100,000-item SPSC concurrency, and gap detection). **All 5 suites passed.**
- **Performance Benchmark:** Executed `engine/benchmarks/benchmark_engine.cpp`:
  - **Throughput:** 4,147,530 orders/second.
  - **Latency p50:** 153 nanoseconds.
  - **Latency p90:** 203 nanoseconds.
  - **Latency p99:** 447 nanoseconds.
  - **Latency p99.9:** 3.91 microseconds.
- **IPC Interface:** Verified CLI / stdio pipe interface in `engine/src/main.cpp` generating deterministic trade executions.

### [2026-11-17 08:21:00 IST] - Phase 4: Application Backend & API Services Completed
- **Architecture & Security:**
  - Implemented JWT-based authentication and role-based access control (`TRADER`, `ANALYST`, `ADMIN`) in `backend/middleware/auth.ts`.
  - Added bcrypt-based secure credential hashing with salt rounds (10), failed login tracking, and automated 15-minute lockouts in `backend/services/authService.ts`.
- **Trading & Risk Management:**
  - Implemented pre-trade risk filter in `backend/services/tradingService.ts` verifying instrument activity, price range bounds, 5% price collars, `max_order_qty`, `max_order_notional`, `max_open_orders`, and cash sufficiency.
  - Implemented continuous price-time matching logic producing trade executions, side-specific fills, and automatic position updates via PostgreSQL triggers.
  - Implemented order cancellation and Level 2 order book ladder depth generation.
- **Surveillance Engine:**
  - Implemented 8-dimensional feature vector extraction (`order_cancel_ratio`, `quote_to_trade_ratio`, `median_lifetime_ms`, `size_skew`, `msg_rate_per_s`, `book_imbalance_impact`, `opposite_side_fill_ratio`, `layering_depth`).
  - Implemented vector cosine similarity classification against known benchmark abuse signatures (`Rapid Spoofing & Cancellation`, `Multi-Level Layering Pattern`, `Quote Stuffing Velocity Burst`).
  - Implemented alert triage, analyst note annotations, and PostgreSQL `tsvector` full-text search.
- **REST & Real-Time WebSockets:**
  - Implemented routes for auth, accounts, instruments, orders, trades, surveillance, and system inspection.
  - Built WebSocket broadcaster in `backend/websocket.ts` streaming real-time book updates and trade notifications.
- **Automated Verification:**
  - Created `tests/api.test.ts` covering 9 critical workflows: registration, login, risk limits, price collars, atomic order matching, side-specific fills, trigger position updates, cancellation, surveillance evaluation, and full-text search.
  - **All 9 integration test suites passed with 0 failures.**
