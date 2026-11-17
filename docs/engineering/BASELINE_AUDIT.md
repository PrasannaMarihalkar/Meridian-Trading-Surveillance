# MERIDIAN — Baseline Engineering Audit & Forensic Assessment
**Document ID:** `MERIDIAN-ENG-AUDIT-001`  
**Execution Stage:** Stage 1 — Repository Reconnaissance & Forensic Audit  
**Target Repository:** `https://github.com/PrasannaMarihalkar/meridian-trading-surveillance`  
**Baseline Git Commit:** `2cfbd9c` (`main`)  
**Release Tag Ref:** `v1.0.0` (commit `c4fa0d1`)  
**Auditor:** Principal Systems Architect & Engineering Verification Lead  
**Date:** November 17, 2026  

---

## 1. Executive Summary

This forensic engineering audit provides an exhaustive, evidence-driven evaluation of the **MERIDIAN** software repository. MERIDIAN is designed as an institutional simulated trading system integrating a C++20 price-time matching engine, a PostgreSQL 16 relational ledger, an Express/TypeScript backend gateway, an 8-dimensional market surveillance heuristic engine, and a React 18 trading terminal.

The audit was executed directly against the local working tree at commit `2cfbd9c` and verified against remote CI runs (GitHub Actions run `44037140642`).

### 1.1 Summary of System Maturity
- **Database & Relational Modeling (PostgreSQL 16 / PGlite):** **EXCEPTIONAL.** All 17 normalized entities conforming strictly to BCNF/3NF are implemented. 4 relational views, 4 triggers (including automated settlement and immutable audit logging), cosine vector similarity functions, and all 17 college demonstration queries execute cleanly and deterministically.
- **Backend Architecture & Type Safety (Node.js / TypeScript):** **STRONG.** Express routes feature strict Zod 4.6.7 schema validation, JWT auth, RBAC middleware, and clean error handling. Zero TypeScript compilation errors (`tsc --noEmit`), zero ESLint warnings (`eslint --max-warnings 0`), and zero npm audit vulnerabilities.
- **Frontend Trading & Surveillance Terminal (React 18 / Tailwind):** **STRONG.** High-density dark-theme trading interface with real-time Level 2 depth ladder, surveillance alerts dashboard, order execution blotter, and an interactive PES University experiential learning query runner.
- **C++20 Order Book Implementation (`engine/`):** **SUBSTANTIAL BUT CONTAINS LOGIC DEFECTS.** Core price-time matching logic and lock-free SPSC ring buffer are structurally sound. However, a critical order status defect exists in IOC order cancellation, and container implementations diverge from low-latency claims.
- **Architecture & System Integration:** **CRITICAL ARCHITECTURAL DISCONNECT.** A major discrepancy was uncovered between claimed and actual runtime execution: **the Node.js backend does not invoke the C++ matching engine in its production request path**. Orders are matched exclusively via database-level SQL row-level locks (`SELECT ... FOR UPDATE`). The C++ IPC bridge is fully written but uncalled by `TradingService`.
- **CI/CD & Verification Rigor:** **ROBUST GATES BUT SYSTEM GAP.** CI enforces 10 blocking jobs (including TruffleHog full-history secret scanning and ASan/UBSan memory checks on unit tests). However, the standalone engine binary (`meridian_engine`) is omitted from the build, and the C++ bridge integration test (`tests/cpp_bridge.test.ts`) is skipped in CI.

---

## 2. Forensic Layer-by-Layer Findings

### Layer 1: Architecture & Systems Integration
**Claimed Architecture:** Continuous double auction engine with bidirectional stdio line-protocol IPC between Express API gateway and C++20 matching engine process, with database transaction persistence and replay fallback.
**Observed Actual Implementation:**
1. In `backend/services/tradingService.ts` (`submitOrder`, lines 110-210), order matching is performed entirely within PostgreSQL using an atomic transaction with `SELECT ... FOR UPDATE` row-level locks on resting orders.
2. The `CppEngineBridge` class exists in `backend/services/cppEngineBridge.ts`, implementing a child process manager over stdin/stdout (`ORDER`, `CANCEL`, `SNAPSHOT`). However, a codebase search reveals **zero invocations of `CppEngineBridge` across `backend/services/tradingService.ts`, `backend/server.ts`, or any route handler**.
3. In `tests/cpp_bridge.test.ts`, the test invokes `bridge.waitForReady(4000)`. If the C++ process is unavailable, it outputs `[WARN] C++ Engine process not available in this test environment. Skipping live IPC assertions.` and exits cleanly with return code 0, masking the absence of a live engine.
4. On Windows environments, `CppEngineBridge.spawnEngine()` attempts to launch `./engine/meridian_engine` via WSL (`spawn('wsl', ['-e', 'bash', '-c', cmd])`). If WSL cold-starts in >4 seconds, the bridge times out, skips tests, and leaves the WSL child process dangling.

### Layer 2: C++ Systems & Matching Engine Core
**Code Location:** `engine/include/`, `engine/src/`, `engine/tests/`, `engine/benchmarks/`
**Observed Actual Implementation:**
1. **Data Structures:** `engine/include/order_book.hpp` uses:
   ```cpp
   std::map<Price, std::list<Order>, std::greater<Price>> bids_;
   std::map<Price, std::list<Order>, std::less<Price>> asks_;
   std::unordered_map<OrderId, OrderLocation> order_map_;
   ```
   *Forensic Reality:* The documentation claims "pre-allocated intrusive doubly-linked lists and red-black tree index with zero dynamic memory allocation on the fast path". In reality, standard `std::list<Order>` and `std::unordered_map` are used. Every order insertion invokes heap allocation (`new _List_node<Order>` and hash bucket nodes).
2. **Immediate-or-Cancel (IOC) Status Defect:**
   In `engine/src/order_book.cpp` (lines 99-115):
   ```cpp
   if (order.leaves_qty() > 0 && order.order_type == OrderType::LIMIT) {
       order.status = (order.filled_qty > 0) ? OrderStatus::PARTIALLY_FILLED : OrderStatus::OPEN;
       // rests on book
   }
   return trades;
   ```
   When `order.order_type == OrderType::IOC` and `order.leaves_qty() > 0`, the remainder is correctly NOT placed on the book. However, `order.status` is **never updated to `OrderStatus::CANCELLED`**. Because `Order` initializes `status{OrderStatus::OPEN}` (`types.hpp:79`), an unfilled or partially filled IOC order exits `process_order()` with `status == OPEN`. This violates exchange order state invariants.
3. **SPSC Lock-Free Queue (`engine/include/spsc_queue.hpp`):**
   Verified genuine cache-line padding:
   ```cpp
   alignas(kCacheLineSize) std::atomic<size_t> head_{0};
   alignas(kCacheLineSize) std::atomic<size_t> tail_{0};
   ```
   Uses memory order acquire/release semantics (`std::memory_order_release`, `std::memory_order_acquire`). Array buffer capacity is fixed power-of-two with bitwise mask. Verified thread-safe for single-producer single-consumer.
4. **Packet Gap Detector (`engine/include/gap_detector.hpp`):**
   Tracks sequence gaps and out-of-order delivery. However, it maintains `std::unordered_set<uint64_t> seen_` on lines 25-29, allocating a heap node for every packet processed. In a high-frequency market data feed, this introduces unbounded memory consumption and garbage collection / allocator fragmentation.

### Layer 3: Relational Persistence Tier (PostgreSQL 16)
**Code Location:** `database/sql/01_schema.sql`, `02_views_triggers.sql`, `03_seed_data.sql`, `04_demo_queries.sql`
**Observed Actual Implementation:**
1. **Schema Compliance:** 17 normalized relational tables in BCNF. Foreign keys, check constraints, default timestamps, and uniqueness guarantees are properly enforced.
2. **Triggers & Settlement:**
   - `trg_fills_settlement`: Listens to `AFTER INSERT ON fills`. For `BUY` fills, debits cash balance and increments position shares; recalculates weighted average price. For `SELL` fills, credits cash and decrements position shares; calculates realized P&L.
   - `trg_orders_audit`: Records old and new status to `audit_log` with JSON payload on state transitions.
   - `trg_audit_log_immutable`: Rejects any `UPDATE` or `DELETE` on `audit_log` with a custom SQL exception, guaranteeing immutability.
   - `trg_alert_notes_tsv`: Generates tsvector tokens for investigator notes.
3. **Analytical Views:**
   - `v_top_of_book`: Best bid and best ask per instrument with aggregate volume.
   - `v_portfolio_summary`: Realized and unrealized P&L calculations per user account.
   - `v_trade_blotter`: Detailed trade execution blotter with buyer/seller names and notional value.
   - `v_surveillance_summary`: Alerts grouped by severity, pattern type, and resolution status.
4. **Stored Functions:**
   - `fn_cosine_similarity`: 8-dimensional Euclidean dot product divided by vector magnitudes, returning normalized similarity score in `[0.0, 1.0]`.
   - `fn_calculate_realized_pnl`: Computes realized P&L on position liquidation.
5. **Demonstration Queries:** All 17 official college demonstration queries (Q1-Q17) execute successfully, verifying multi-table joins, analytical aggregations, full-text searches, and cross-table entity counts.
6. **Test Environment Discrepancy:** Backend integration tests use `@electric-sql/pglite` (embedded WebAssembly Postgres). While functionally compliant for SQL syntax and triggers, PGlite runs single-threaded in-memory and does not test native PostgreSQL connection pooling, client-server serialization, or physical disk WAL persistence.

### Layer 4: Backend Gateway & Services
**Code Location:** `backend/`
**Observed Actual Implementation:**
1. **Type Safety & Linting:** Clean build. 0 TypeScript errors (`tsc --noEmit`), 0 ESLint warnings (`eslint backend/ --max-warnings 0`).
2. **Pre-Trade Risk Checks (`tradingService.ts:20-105`):**
   - Active instrument validation and price collar enforcement (rejection if price deviates >5% from reference price).
   - Maximum order quantity check (`max_order_qty`).
   - Maximum order notional check (`max_order_notional`).
   - Open orders count check (`max_open_orders`).
   - Cash balance sufficiency verification for BUY orders.
3. **Surveillance Service (`surveillanceService.ts`):**
   Computes 8-D feature vector over recent orders and trades:
   `[cancel_ratio, quote_to_trade_ratio, median_lifetime_ms, size_skew, msg_rate, book_imbalance, opposite_fill_ratio, layering_depth]`.
   Matches against 4 pre-seeded manipulation patterns: Spoofing/Layering, Quote Stuffing, Wash Trading, and Momentum Ignition.
4. **Rate Limiting (`middleware/rateLimiter.ts`):**
   In-memory sliding window using timestamps array. Effective against burst requests, but resets if server restarts and does not scale across multiple process workers without Redis.

### Layer 5: Frontend Interface & User Experience
**Code Location:** `frontend/`
**Observed Actual Implementation:**
1. Built with React 18, TypeScript, Tailwind CSS, and Lucide icons.
2. Single-bundle build via `esbuild` (`scripts/build_frontend.ts`) outputting to `frontend/public/bundle.js`.
3. Modules:
   - `TradingTerminal`: Order entry form, active orders blotter, executed trades feed, Level 2 depth ladder with visual depth bars.
   - `SurveillanceConsole`: Live alerts monitor, feature radar/metrics display, alert status transition workflow (`INVESTIGATING`, `CONFIRMED_ABUSE`, `DISMISSED`), note logging.
   - `CollegeShowcase`: PES University Level 3 syllabus requirements matrix, 17-query runner with tabbed result tables, BCNF schema visualizer.
   - `SystemAudit`: Live audit trail viewer with JSON delta inspection.

### Layer 6: Security, Secret Management & Hardening
**Observed Actual Implementation:**
1. **Authentication:** JWT with HMAC-SHA256, Bcrypt password hashing (10 salt rounds).
2. **Role-Based Access Control:** `ADMIN`, `COMPLIANCE`, `TRADER` roles enforced by `requireRole` middleware.
3. **Input Validation:** Zod schemas on all endpoints (`loginSchema`, `placeOrderSchema`, `cancelOrderSchema`, `alertNoteSchema`).
4. **Secret Scanning:** TruffleHog `v3.88.15` pinned in CI with `--only-verified` and `fetch-depth: 0`. Secondary regex grep scanner blocks hardcoded secrets. Zero verified secret leaks in git history.
5. **Dependency Security:** Zod upgraded to `4.6.7` resolving `GHSA-mrhx-c7xc-m3w5`. Zero vulnerabilities reported by `npm audit --audit-level=high`.

### Layer 7: Testing & CI/CD Automation
**Code Location:** `.github/workflows/ci.yml`, `tests/`
**Observed Actual Implementation:**
1. CI pipeline consists of 10 jobs:
   - `dependency-install`, `type-check`, `lint`, `db-schema-validate`, `backend-tests`, `frontend-build`, `cpp-build-and-test`, `secret-scan`, `npm-audit`, `ci-gate`.
2. All jobs must succeed; `ci-gate` strictly checks `results != 'success'` and exits with error code 1.
3. **Gaps in CI Verification:**
   - C++ engine job builds `test_order_book.cpp` into `test_ob` and runs ASan/UBSan, but does **NOT** build `engine/src/main.cpp` (`meridian_engine`).
   - `tests/cpp_bridge.test.ts` is omitted from `backend-tests` job in CI.
   - No integration test runs the Node.js backend against the compiled C++ binary in CI.

### Layer 8: Documentation Truthfulness & Academic Credibility
**Observed Discrepancies:**
1. **Intrusive List Claim:** `README.md` and `docs/ARCHITECTURE.md` state: *"Resting orders reside in pre-allocated intrusive doubly-linked lists. Inserting or removing resting orders takes O(1) time with zero dynamic allocation on the fast path."*
   *Reality:* The code uses `std::map<Price, std::list<Order>>`. `std::list` is a standard non-intrusive container requiring dynamic node allocation.
2. **IPC Integration Claim:** Architectural diagrams show the backend communicating with the C++ engine over stdio line protocol for order matching.
   *Reality:* The backend contains `CppEngineBridge`, but `TradingService` bypasses it and matches orders directly in SQL.

---

## 3. Comprehensive Finding Records

### Finding Record: `FINDING-ARCH-01`
- **Severity:** **CRITICAL**
- **Component:** Backend Architecture & Matching Engine Integration
- **File Reference:** `backend/services/tradingService.ts:110-210`, `backend/services/cppEngineBridge.ts:37-250`
- **Claimed Behavior:** Dual-mode matching architecture where orders can be dispatched to high-performance C++20 engine via IPC bridge or persisted to database.
- **Observed Actual Behavior:** `CppEngineBridge` is completely disconnected from `TradingService`. All order matching is executed via database SQL queries (`SELECT ... FOR UPDATE`).
- **Impact:** The C++ matching engine is an isolated subsystem that never participates in API-driven trading workflows.
- **Remediation Plan (Stage 2):**
  1. Add an execution mode toggle in `TradingService` (`ENGINE_MODE = 'CPP' | 'DATABASE'`).
  2. Wire `CppEngineBridge.getInstance().submitOrder()` into the order execution flow when in C++ mode.
  3. Ensure C++ trade executions are settled back to the database via standard `fills` and `trades` persistence.
  4. Implement an automatic fallback to database matching if the C++ engine child process is unavailable.

---

### Finding Record: `FINDING-CPP-01`
- **Severity:** **HIGH**
- **Component:** C++ Order Book Matching Logic
- **File Reference:** `engine/src/order_book.cpp:99-115`, `engine/include/types.hpp:79`
- **Claimed Behavior:** IOC (Immediate-or-Cancel) orders execute immediately against resting orders, and any unfulfilled portion is cancelled.
- **Observed Actual Behavior:** The unfulfilled portion of an IOC order is not added to the book, but its `status` is left as `OrderStatus::OPEN` because `order.status` is never updated to `OrderStatus::CANCELLED`.
- **Impact:** Calling code or IPC clients receive `ACK <order_id> OPEN <filled_qty> <trade_count>` for cancelled IOC balances, violating financial exchange semantics.
- **Remediation Plan (Stage 2):**
  1. In `OrderBook::process_order`, if `order.order_type == OrderType::IOC` and `order.leaves_qty() > 0`:
     - If `order.filled_qty > 0`, set `order.status = OrderStatus::PARTIALLY_FILLED` (with remainder cancelled) or mark lifecycle state as `CANCELLED`.
     - If `order.filled_qty == 0`, set `order.status = OrderStatus::CANCELLED`.
  2. Add unit tests in `engine/tests/test_order_book.cpp` specifically asserting IOC cancellation statuses for both fully unfilled and partially filled scenarios.

---

### Finding Record: `FINDING-CI-01`
- **Severity:** **HIGH**
- **Component:** Continuous Integration Pipeline
- **File Reference:** `.github/workflows/ci.yml:192-226`
- **Claimed Behavior:** Full C++ engine and integration verification in CI.
- **Observed Actual Behavior:** CI compiles only `engine/tests/test_order_book.cpp` with `engine/src/order_book.cpp`. The main standalone executable `meridian_engine` (`engine/src/main.cpp`) is never compiled.
- **Impact:** Compilation regressions in `engine/src/main.cpp` or IPC protocol changes can pass CI completely undetected.
- **Remediation Plan (Stage 2):**
  1. Update CI `cpp-build-and-test` job to compile `meridian_engine` using `g++ -std=c++20 -O2 engine/src/main.cpp engine/src/order_book.cpp -o engine/meridian_engine`.
  2. Run a smoke test piping test commands (`ORDER`, `CANCEL`, `SNAPSHOT`, `QUIT`) through `meridian_engine` in CI.

---

### Finding Record: `FINDING-CI-02`
- **Severity:** **HIGH**
- **Component:** IPC Integration Testing
- **File Reference:** `.github/workflows/ci.yml:140-155`, `tests/cpp_bridge.test.ts:7-11`
- **Claimed Behavior:** Automated verification of backend-to-engine IPC communication.
- **Observed Actual Behavior:** `tests/cpp_bridge.test.ts` is never invoked in GitHub Actions CI. Furthermore, if run without the engine binary, the test silently skips assertions and exits 0.
- **Impact:** IPC protocol breakage or serialization failures are never caught in CI.
- **Remediation Plan (Stage 2):**
  1. Add `meridian_engine` build before backend tests in CI.
  2. Execute `npx tsx tests/cpp_bridge.test.ts` as a required step.
  3. Change `tests/cpp_bridge.test.ts` to FAIL if `CI=true` and the engine is unavailable, rather than silently skipping.

---

### Finding Record: `FINDING-DOC-01`
- **Severity:** **MEDIUM**
- **Component:** Technical Documentation & Architectural Integrity
- **File Reference:** `README.md:26,54,78`, `docs/ARCHITECTURE.md:45-55`, `docs/CPP_ENGINE_REVIEW.md`
- **Claimed Behavior:** Intrusive doubly-linked lists and zero-allocation memory guarantees on the order book fast path.
- **Observed Actual Behavior:** The implementation uses `std::map<Price, std::list<Order>>` and `std::unordered_map`. Node allocations occur on every order insertion.
- **Impact:** Technical reviewers, faculty evaluators, and systems engineers will identify the discrepancy between standard container heap allocations and intrusive zero-allocation claims.
- **Remediation Plan (Stage 2):**
  1. Accurately document the container architecture in `README.md` and `docs/ARCHITECTURE.md`: explain that `std::map` provides logarithmic price-level lookup ($O(\log P)$) and `std::list` provides $O(1)$ FIFO order queueing.
  2. Honestly describe the memory allocation profile (standard library dynamic node allocation) and present intrusive pointer structures as a targeted low-latency enhancement roadmap.

---

### Finding Record: `FINDING-CPP-02`
- **Severity:** **MEDIUM**
- **Component:** UDP Packet Gap Detector
- **File Reference:** `engine/include/gap_detector.hpp:25-29`
- **Claimed Behavior:** High-performance UDP sequence gap tracking for multicast feeds.
- **Observed Actual Behavior:** Uses `std::unordered_set<uint64_t> seen_` without size bounds, allocating a heap node for every packet processed.
- **Impact:** Induces memory growth and latency jitter during extended market data capture.
- **Remediation Plan (Stage 2):**
  1. Replace unbounded `std::unordered_set` with a bounded ring buffer or sequence sliding window (e.g., 64-bit bitmap or fixed circular array) that tracks packet presence across a fixed sequence horizon.

---

### Finding Record: `FINDING-ARCH-02`
- **Severity:** **MEDIUM**
- **Component:** C++ Bridge Process Spawner
- **File Reference:** `backend/services/cppEngineBridge.ts:74-95`
- **Claimed Behavior:** Cross-platform IPC bridge connecting Node.js to C++ engine.
- **Observed Actual Behavior:** On Windows (`process.platform === 'win32'`), `spawnEngine()` unconditionally invokes WSL (`wsl -e bash -c ...`). If WSL is not installed, or if native Windows binaries (`meridian_engine.exe`) are present, it fails or hangs.
- **Impact:** Flaky local execution on Windows developer workstations without WSL.
- **Remediation Plan (Stage 2):**
  1. Add native binary detection: if `engine/meridian_engine.exe` exists, spawn it directly without WSL.
  2. If on Windows and native binary is absent, fallback to WSL if available, or gracefully fallback to database matching mode.

---

### Finding Record: `FINDING-DB-01`
- **Severity:** **MEDIUM**
- **Component:** Database Test Isolation
- **File Reference:** `tests/api.test.ts:15-30`, `database/db.ts:10-50`
- **Claimed Behavior:** Comprehensive PostgreSQL 16 testing.
- **Observed Actual Behavior:** Tests run exclusively against `@electric-sql/pglite` (in-memory WASM). Native PostgreSQL client-server network protocol, connection pooling, and multi-threaded concurrency are not tested in CI.
- **Impact:** Potential behavioral divergence between embedded SQLite-like WASM Postgres and multi-threaded native PostgreSQL 16 under concurrent load.
- **Remediation Plan (Stage 2):**
  1. Introduce an optional live PostgreSQL test runner in CI using the GitHub Actions `services: postgres:16` container.
  2. Validate transaction rollbacks and row-level locking concurrency against live PostgreSQL.

---

## 4. Architectural Invariants Established for Stage 2 & 3

To prevent regressions and ensure uncompromising engineering credibility, the following invariants are formally established:

1. **Truth in Documentation:** Every technical claim in `README.md`, `docs/`, and college reports must be verifiable in the source code. Simulated or stubbed behavior must never be presented as physical low-latency hardware performance.
2. **Preserve Working Functionality:** Never break or discard working features (PostgreSQL 16 BCNF schema, all 17 demo queries, React frontend, Zod validation, TruffleHog secret scanning).
3. **Double-Entry Financial Accounting:** Every trade must generate exactly two side-specific fills (`BUY` and `SELL`). Total debits must equal total credits. Positions must match cumulative fill history.
4. **Test-First Remediation:** Every defect fix (such as IOC order status or C++ bridge IPC) must be accompanied by an automated regression test that fails before the fix and passes after.
5. **Hermetic CI Verification:** CI must build all binaries (`meridian_engine`, `test_ob`, frontend bundle) and verify all integration points without silent skips.
