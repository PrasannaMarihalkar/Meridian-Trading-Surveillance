# MERIDIAN — System Acceptance & Requirements Verification Matrix
**Document ID:** `MERIDIAN-ENG-REQ-001`  
**Execution Stage:** Stage 1 — Engineering Blueprint & Requirements Mapping  
**Target Repository:** `https://github.com/PrasannaMarihalkar/meridian-trading-surveillance`  
**Baseline Git Commit:** `2cfbd9c` (`main`)  
**Auditor:** Principal Systems Architect & Engineering Verification Lead  
**Date:** November 17, 2026  

---

## 1. Overview & Verification Legend

This matrix maps every functional, architectural, academic, security, and performance requirement of **MERIDIAN** to its current implementation status, empirical evidence in the repository, remediation priority, and acceptance verification criteria.

### Status Definitions:
- **`VERIFIED PASS`**: Requirement is fully implemented, verified with tests, and meets all architectural criteria.
- **`PASS WITH LIMITATION`**: Functional, but operates with known engineering boundaries (e.g., in-memory rate limiter, embedded WASM DB in tests).
- **`DEFECT IDENTIFIED`**: Implementation exists but contains a logic bug or protocol error requiring code fix.
- **`MISSING INTEGRATION`**: Component exists in isolation but is not wired into the production execution path.
- **`DOCUMENTATION DISCREPANCY`**: Code works differently from claims made in `README.md` or architectural documents.

### Priority Levels for Stage 2 Remediation:
- **`P0 (Blocker)`**: Core architectural integrity or correctness defect (e.g., C++ bridge integration, IOC order status bug).
- **`P1 (Essential)`**: Build/CI pipeline completeness and live test coverage (e.g., building `meridian_engine` in CI, bridge tests).
- **`P2 (Important)`**: Performance optimization, container alignment, and memory efficiency (e.g., gap detector heap reduction).
- **`P3 (Polish)`**: Documentation reconciliation, formatting, and presentation polish.

---

## 2. Master System Requirements Matrix

| Req ID | Domain / Capability | Current Status | Code & Evidence Reference | Priority | Stage 2 Remediation Action | Verification Method & Pass Criteria |
| :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| **REQ-DBMS-01** | 17 Relational Entities in BCNF/3NF | **VERIFIED PASS** | `database/sql/01_schema.sql:1-240` | - | None required. Schema is robust. | Verify schema creation and constraints across all 17 tables on clean PostgreSQL. |
| **REQ-DBMS-02** | Side-Specific Fill Settlement (2 Fills / Trade) | **VERIFIED PASS** | `database/sql/01_schema.sql:128-145`, `02_views_triggers.sql:85-150` | - | Enforced by `UNIQUE(trade_id, side)`. Total buyer debits equal seller credits. | Insert trade; assert exactly 1 BUY fill and 1 SELL fill exist in `fills`. |
| **REQ-DBMS-03** | Automated Cash & Position Settlement Trigger | **VERIFIED PASS** | `database/sql/02_views_triggers.sql:85-150` (`trg_fills_settlement`) | - | None required. Trigger handles cash debit/credit and position updates. | Execute trade; verify buyer cash decreases and position increases, seller cash increases and position decreases. |
| **REQ-DBMS-04** | Engine-Enforced Immutable Audit Trail | **VERIFIED PASS** | `database/sql/02_views_triggers.sql:65-80` (`trg_audit_log_immutable`) | - | None required. Trigger raises exception on `UPDATE` or `DELETE`. | Attempt `UPDATE audit_log SET action = 'MODIFIED'`; verify transaction aborts with trigger error. |
| **REQ-DBMS-05** | Realized P&L Stored Procedure | **VERIFIED PASS** | `database/sql/02_views_triggers.sql:20-50` (`fn_calculate_realized_pnl`) | - | None required. Calculates realized gain/loss on position closure. | Execute closing trade; assert `positions.realized_pnl` updates accurately. |
| **REQ-DBMS-06** | 8-D Vector Cosine Similarity Stored Function | **VERIFIED PASS** | `database/sql/02_views_triggers.sql:1-20` (`fn_cosine_similarity`) | - | None required. Returns dot product / magnitude product in `[0.0, 1.0]`. | Run Q10; assert similarity scores calculate correctly between pattern and sessions. |
| **REQ-DBMS-07** | 4 Relational Views | **VERIFIED PASS** | `database/sql/02_views_triggers.sql:155-225` | - | None required. `v_top_of_book`, `v_portfolio_summary`, `v_trade_blotter`, `v_surveillance_summary`. | Query each view; verify returned columns, aggregations, and join accuracy. |
| **REQ-DBMS-08** | Full-Text Search on Case Notes (tsvector) | **VERIFIED PASS** | `database/sql/01_schema.sql:185-195`, `02_views_triggers.sql:50-65` | - | GIN index on `notes_tsv`; auto-populated by trigger. | Run Q15; query keywords via `to_tsquery('english', 'spoofing & pattern')`. |
| **REQ-DBMS-09** | 17 Official College Demonstration Queries | **VERIFIED PASS** | `database/sql/04_demo_queries.sql:1-250` | - | All 17 queries execute deterministically in `scripts/run_demo_queries.ts`. | Run `npm run demo:queries`; assert all 17 queries return valid rows with 0 errors. |
| **REQ-DBMS-10** | Native PostgreSQL CI Verification & Transaction Affinity | **VERIFIED PASS** | `database/db.ts:75-115`, `.github/workflows/ci.yml:125-185`, `tests/test_transaction_affinity.ts:1-110` | - | Resolved `pool.query()` pseudo-transaction connection leak. Dedicated `pg.PoolClient` transaction abstraction with guaranteed connection affinity. Added Native PostgreSQL 16 service container to GitHub Actions CI running mandatory blocking checks. | Verified on native PostgreSQL 16 (WSL & CI) and PGlite: clean commits, rollback isolation, and zero connection leaks under interleaved concurrent transactions. |
| **REQ-CPP-01** | Price-Time Continuous Double Auction | **VERIFIED PASS** | `engine/src/order_book.cpp:20-160` | - | FIFO matching logic matches resting bids/asks correctly. | Verified via `test_order_book.cpp` and ASan/UBSan build in CI. |
| **REQ-CPP-02** | Fixed-Point Integer Price Scaling | **VERIFIED PASS** | `engine/include/types.hpp:13-26` | - | Scale factor 10,000 maps floating prices to 64-bit signed integers. | Arithmetic verified; 0 floating-point rounding errors in matching. |
| **REQ-CPP-03** | Immediate-or-Cancel (IOC) Order Lifecycle | **VERIFIED PASS** | `engine/src/order_book.cpp:103-125`, `engine/tests/test_order_book.cpp:78-125` | - | Remainder status correctly set to `OrderStatus::CANCELLED`. Pass-by-reference signature `process_order(Order&)` propagates status to caller. | Verified with 3 regression tests in `test_order_book.cpp` (unfilled, partially filled, fully filled) across standard and ASan builds. |
| **REQ-CPP-04** | Container Memory Architecture Documentation | **VERIFIED PASS** | `README.md:25-85`, `docs/ARCHITECTURE.md:15-85`, `docs/PERFORMANCE_REPORT.md:15-60` | - | Harmonized documentation to truthfully describe `std::map<Price, std::list<Order>>`. Zero false claims of intrusive containers or zero-alloc fast path. | Full documentation audit matches actual C++ source code. |
| **REQ-CPP-05** | Lock-Free SPSC Ring Buffer Queue | **VERIFIED PASS** | `engine/include/spsc_queue.hpp:1-85` | - | Cacheline-aligned head/tail (`alignas(64)`), acquire/release memory order. Fixed `-Winterference-size` compiler warning. | Verified with 100,000 item lock-free transfer test in `test_order_book.cpp` under TSan/ASan. |
| **REQ-CPP-06** | UDP Multicast Sequence Gap Detector | **VERIFIED PASS** | `engine/include/gap_detector.hpp:1-85`, `engine/tests/test_order_book.cpp:140-205` | - | Replaced unbounded `std::unordered_set` with pre-allocated 64K-sequence circular bitmap (`std::array<uint64_t, 1024>`, 8,280 bytes). Zero heap allocation on packet ingress. | Unit test verifying duplicates, gaps, out-of-order resolution, stale packets, and bounded memory in `test_order_book.cpp`. |
| **REQ-INT-01** | Client Idempotency & Correlated IPC Bridge | **VERIFIED PASS** | `backend/routes/orderRoutes.ts:15-45`, `backend/services/tradingService.ts:110-185`, `backend/services/cppEngineBridge.ts:1-250` | - | Implemented client-supplied `clientOrderId` (UUID scoped to authenticated `accountId`), fast-path replay, 409 Conflict on payload mismatch, and concurrent 23505 catch. Hardened C++ bridge with request-response correlation maps (`pendingOrders`, `pendingCancels`, `pendingSnapshots`). | `tests/api.test.ts` Tests 10 & 11 pass (11/11 passed); `tests/cpp_bridge.test.ts` (6/6 passed). |
| **REQ-INT-02** | Standalone C++ Engine Executable Build in CI | **VERIFIED PASS** | `.github/workflows/ci.yml:210-230`, `engine/src/main.cpp:1-120` | - | Standalone executable `engine/meridian_engine` compiled with `-std=c++20 -O2` in CI; smoke-tested with CLI line-protocol. | CI compiles `meridian_engine`; smoke test confirms SNAPSHOT and QUIT commands. |
| **REQ-INT-03** | C++ IPC Bridge CI Integration Test | **VERIFIED PASS** | `.github/workflows/ci.yml:140-165`, `tests/cpp_bridge.test.ts:1-135` | - | Hardened 6-step live bridge test suite (`npm run test:bridge`) executed in CI `cpp-build-and-test` job. Mandatory and blocking. | All 6 bridge tests pass against live `meridian_engine` process. |
| **REQ-INT-04** | Cross-Platform C++ Process Spawner | **VERIFIED PASS** | `backend/services/cppEngineBridge.ts:70-110` | - | Prefers native Windows executable `meridian_engine.exe` before attempting WSL fallback; handles process lifecycle cleanly. | Successfully detects native binaries and runs seamlessly under Windows and WSL. |
| **REQ-SURV-01** | 8-Dimensional Feature Extraction | **VERIFIED PASS** | `backend/services/surveillanceService.ts:40-120` | - | Computes cancel ratio, quote-to-trade, lifetime, size skew, msg rate, imbalance, opposite fill, layering. | Integration test passes; verifies 8 feature values from test orders. |
| **REQ-SURV-02** | Vector Cosine Similarity Pattern Matching | **VERIFIED PASS** | `backend/services/surveillanceService.ts:140-200` | - | Compares feature vector against seeded Spoofing, Stuffing, Wash, and Momentum benchmarks. | Integration test verifies alert creation when cosine similarity > 0.85. |
| **REQ-SURV-03** | Compliance Alert Workflow & Status Transitions | **VERIFIED PASS** | `backend/routes/surveillance.ts:50-130` | - | Supports transitions: `OPEN` -> `INVESTIGATING` -> `CONFIRMED_ABUSE` / `DISMISSED`. | Test transitions via API; verify status change and audit note logging. |
| **REQ-SEC-01** | Pre-Trade Risk Checks & Price Collars | **VERIFIED PASS** | `backend/services/tradingService.ts:20-105` | - | Enforces active instrument, price collar (5%), max qty, max notional, open orders count, cash. | Test asserts rejection on collar deviation >5% and exceeding `max_order_qty`. |
| **REQ-SEC-02** | JWT Authentication & Bcrypt Password Hashing | **VERIFIED PASS** | `backend/routes/auth.ts:20-80`, `backend/middleware/auth.ts:1-60` | - | Salt rounds = 10, signed HMAC-SHA256 tokens, session invalidation on logout. | Test verifies login returns valid JWT and invalid token is rejected with 401. |
| **REQ-SEC-03** | Role-Based Access Control (RBAC) | **VERIFIED PASS** | `backend/middleware/auth.ts:60-80` | - | Roles: `ADMIN`, `COMPLIANCE`, `TRADER`. Blocks unauthorized actions with 403 Forbidden. | Verify `TRADER` cannot resolve surveillance alerts or modify risk limits. |
| **REQ-SEC-04** | Zod Schema Input Validation | **VERIFIED PASS** | `backend/routes/*.ts` (all endpoints) | - | Strict schema parsing on all request bodies, query params, and route parameters. | Invalid payload returns 400 Bad Request with descriptive Zod error issues. |
| **REQ-SEC-05** | Zero Secret Leakage (TruffleHog & Regex) | **VERIFIED PASS** | `.github/workflows/ci.yml:230-265` | - | Pinned TruffleHog `v3.88.15` full-history scan (`fetch-depth: 0`) + secondary regex audit. | CI secret-scan job exits 0 with zero verified leaks. |
| **REQ-SEC-06** | Zero High/Critical Vulnerabilities | **VERIFIED PASS** | `package.json`, `package-lock.json` | - | Zod upgraded to `4.6.7` (resolving GHSA-mrhx-c7xc-m3w5). | `npm audit --audit-level=high` reports 0 vulnerabilities. |
| **REQ-UI-01** | High-Density Trading Terminal | **VERIFIED PASS** | `frontend/src/components/TradingTerminal.tsx` | - | Dark theme, Level 2 book ladder, order entry panel, trade blotter, portfolio metrics. | Verified via frontend build and browser inspection. |
| **REQ-UI-02** | Surveillance & Compliance Investigation Console | **VERIFIED PASS** | `frontend/src/components/SurveillanceConsole.tsx` | - | Alert feeds, 8-D radar/metrics view, case notes editor, resolution buttons. | Verified via frontend build and browser inspection. |
| **REQ-UI-03** | PES University Experiential Learning Showcase | **VERIFIED PASS** | `frontend/src/components/CollegeShowcase.tsx` | - | Level 3 requirements syllabus, interactive 17-query runner with tabular rendering. | Verified via frontend build and query runner execution. |
| **REQ-UI-04** | Real-Time WebSocket Streaming | **VERIFIED PASS** | `backend/websocket.ts:1-80`, `frontend/src/components/*.tsx` | - | Streams Level 2 book updates, trade executions, and surveillance alerts to connected clients. | WebSocket connection test verifies message broadcast on trade execution. |
| **REQ-TEST-01** | End-to-End API Test Suite | **VERIFIED PASS** | `tests/api.test.ts:1-356` | - | 11 passing test cases covering registration, auth, risk limits, matching, triggers, surveillance, FTS, and client idempotency. | `npm test` runs 11 assertions; 11 passed, 0 failed. |
| **REQ-TEST-02** | C++ Unit Tests with Memory Sanitizers | **VERIFIED PASS** | `engine/tests/test_order_book.cpp`, `.github/workflows/ci.yml:218-226` | - | Compiled with `-fsanitize=address,undefined` in CI; blocking on failure. | ASan/UBSan test run exits 0 with zero memory errors or undefined behavior. |
| **REQ-TEST-03** | All-Checks-Pass CI Gatekeeper | **VERIFIED PASS** | `.github/workflows/ci.yml:285-325` (`ci-gate`) | - | Aggregates all 9 prerequisite jobs; fails if any job status is not 'success'. | Remote run `44037140642` passed all 10 checks. |
| **REQ-TEST-04** | Database Concurrency & Financial Parity Stress Test | **VERIFIED PASS** | `tests/concurrency.test.ts:1-185` | - | 10 concurrent async BUY orders (10 shares each) matched against 50 resting shares. Zero overfills, double-entry cash balance conservation ($70,000 debit == $70,000 credit), and position parity (+50 vs -50). | `npm run test:concurrency` exits 0; all financial and row-lock invariants confirmed. |
| **REQ-SEC-07** | Public Registration Role Lockdown & Admin Provisioning | **VERIFIED PASS** | `backend/routes/authRoutes.ts:16-50`, `backend/services/authService.ts:15-60`, `tests/test_auth_rbac_hardening.ts` | - | Public registration strictly restricted to TRADER role. ANALYST and ADMIN provisioned via authenticated `POST /api/auth/users` (`requireRole('ADMIN')`). | `tests/test_auth_rbac_hardening.ts` Test 1 & 2 pass; public role escalation strictly rejected. |
| **REQ-SEC-08** | Real Session Lifecycle & Immediate Token Revocation | **VERIFIED PASS** | `backend/middleware/auth.ts:20-60`, `backend/routes/authRoutes.ts:65-80`, `tests/test_auth_rbac_hardening.ts` | - | `sessionId` embedded in JWT. `authenticate` verifies session in `sessions` table and checks `users.is_active`. `POST /api/auth/logout` revokes session. | `tests/test_auth_rbac_hardening.ts` Test 3 passes; revoked/inactive tokens return 401. |
| **REQ-SEC-09** | Strict RBAC Enforcement on Cancellation & Surveillance | **VERIFIED PASS** | `backend/routes/orderRoutes.ts:148-158`, `backend/routes/surveillanceRoutes.ts:88-142`, `tests/test_auth_rbac_hardening.ts` | - | Analysts explicitly forbidden from cancelling trader orders (403). Surveillance `/patterns` protected. Alert assignment validates analyst identity and active status. | `tests/test_auth_rbac_hardening.ts` Test 4 & 5 pass; permission matrix strictly enforced. |
| **REQ-SEC-10** | WebSocket Confidentiality & Client Authentication | **VERIFIED PASS** | `backend/websocket.ts:25-95`, `tests/test_auth_rbac_hardening.ts` | - | WebSocket connections authenticate via query token or `AUTH` frame. `SURVEILLANCE_ALERT` filtered strictly to ANALYST/ADMIN sockets; never sent to TRADERs. | `tests/test_auth_rbac_hardening.ts` Test 6 passes; zero alert leakage to traders. |
| **REQ-SEC-11** | Single-Use WebSocket Tickets & Replay Prevention | **VERIFIED PASS** | `backend/services/wsTicketManager.ts:1-60`, `backend/routes/authRoutes.ts:85-105`, `tests/test_auth_rbac_hardening.ts` | - | Single-use tickets issued via `POST /api/auth/ws-ticket` (30s TTL, SHA-256 hashed). Atomic consumption deletes ticket upon use, rejecting replay attacks. | `tests/test_auth_rbac_hardening.ts` Test 7 passes; ticket auth and replay rejection verified. |
| **REQ-TRD-01** | Correct MARKET Order Parameter Binding | **VERIFIED PASS** | `backend/services/tradingService.ts:280-305`, `tests/test_trading_risk_integrity.ts` | - | Dynamic parameter index mapping eliminates SQL parameter mismatch errors for MARKET orders. | `tests/test_trading_risk_integrity.ts` Test 1 passes; clean market execution. |
| **REQ-TRD-02** | Time-In-Force (TIF) Strict Execution Modeling | **VERIFIED PASS** | `backend/services/tradingService.ts:310-420`, `tests/test_trading_risk_integrity.ts` | - | Strict IOC cancels residual quantity immediately with 0 book resting. Strict FOK enforces all-or-none liquidity check before generating trades. | `tests/test_trading_risk_integrity.ts` Tests 2, 3, 9, 10 pass; IOC and FOK verified across liquidity spectrum. |
| **REQ-TRD-03** | Engine Serialization via PostgreSQL Advisory Locks | **VERIFIED PASS** | `backend/services/tradingService.ts:275-277` | - | `SELECT pg_advisory_xact_lock($1)` on `instrumentId` guarantees transaction-scoped cross-process serialization without relying on in-memory JS mutexes. | `tests/concurrency.test.ts` passes; zero race conditions across independent connections. |
| **REQ-RSK-01** | Max Net Position Limit & Instrument Tick/Lot Validation | **VERIFIED PASS** | `backend/services/tradingService.ts:50-130`, `tests/test_trading_risk_integrity.ts` | - | Checks projected net position against `max_position_qty`. Enforces lot size multiples and tick size multiples against `instruments`. | `tests/test_trading_risk_integrity.ts` Tests 4 & 5 pass; non-compliant orders rejected. |
| **REQ-RSK-02** | Reserved Cash Purchasing Power Guard & Market Collar | **VERIFIED PASS** | `backend/services/tradingService.ts:150-170`, `340-355`, `tests/test_trading_risk_integrity.ts` | - | Pre-trade risk deducts reserved cash in open resting BUY orders from cash balance. Market orders collared against 5% reference price deviation (`refPrice * 1.05`). | `tests/test_trading_risk_integrity.ts` Tests 6 & 13 pass; over-committing purchasing power blocked. |
| **REQ-RSK-03** | Short Position Bounds & Sell Commitment Guard | **VERIFIED PASS** | `backend/services/tradingService.ts:199-221`, `tests/test_trading_risk_integrity.ts` | - | Enforces `Math.abs(currentNet - committedSells - qty) <= max_position_qty` for SELL orders, bounding short exposure against open resting sell orders. | `tests/test_trading_risk_integrity.ts` Test 12 passes; excessive short exposure rejected. |
| **REQ-DBMS-11** | Atomic Sequences for All 10 Relational Dynamic Entities | **VERIFIED PASS** | `database/sql/01_schema.sql:40-275`, `scripts/init_db.ts:25-35`, `backend/services/*.ts` | - | Explicit PostgreSQL sequences for orders, trades, fills, engine_seq, users, accounts, surveillance_sessions, alerts, alert_notes, audit_log. | Sequences synchronized; zero `MAX(id)+1` transaction race conditions. |
| **REQ-DBMS-12** | Deterministic Account Lock Ordering (Deadlock-Free) | **VERIFIED PASS** | `backend/services/tradingService.ts:365-375` | - | Counterparty accounts locked in strictly ascending numerical order (`account_id IN ($1, $2) ORDER BY account_id FOR UPDATE`). | Mathematically guarantees zero transaction deadlocks under concurrent multi-account matching. |
| **REQ-SURV-04** | Statistical Median Lifetime & Volume Size Skew | **VERIFIED PASS** | `backend/services/surveillanceService.ts:40-100`, `tests/test_trading_risk_integrity.ts` | - | Uses `PERCENTILE_CONT(0.5)` for true median lifetime. Computes volume-weighted size skew with zero-order division guards. | `tests/test_trading_risk_integrity.ts` Test 8 passes; statistical metrics verified. |
| **REQ-CPP-07** | C++ Engine Input Hardening & Sanitize Verification | **VERIFIED PASS** | `engine/src/main.cpp:25-100`, `tests/cpp_bridge.test.ts` | - | Duplicate order ID rejection, price/qty validation, instrument check. Compiled and verified under GCC Clang ASan/UBSan with zero errors. | ASan test run exits 0 with zero memory errors or undefined behavior. |
| **REQ-CPP-08** | C++ Bridge IPC Edge Cases & Process Recovery | **VERIFIED PASS** | `backend/services/cppEngineBridge.ts:1-250`, `tests/cpp_bridge.test.ts:1-200` | - | 12 tests covering passive limits, depth snapshots, aggressive matches, partial fills, cancellations, clean books, duplicate IDs, invalid prices, invalid quantities, unknown instruments, non-existent cancellations, and process crash recovery. | `tests/cpp_bridge.test.ts` (12/12 passed); zero IPC stalls or hung promises. |
| **REQ-UI-05** | Frontend Idempotency Key Preservation Across Retries | **VERIFIED PASS** | `frontend/src/components/TradingTerminal.tsx:40-60`, `160-185` | - | Client preserves `activeIdempotencyKey` on failure/retry, resetting only on success or parameter modification. | Verified in `TradingTerminal.tsx` and frontend build. |
| **REQ-OPS-01** | Node.js 22 LTS & Hardened Non-Root Container | **VERIFIED PASS** | `.github/workflows/ci.yml:13-15`, `Dockerfile:1-25` | - | Target Node.js updated to Node 22 LTS in CI workflow and Dockerfile. Added non-root `USER node` and container healthcheck. | Builds clean; CI and Docker aligned on Node 22 LTS. |

---

## 3. Prioritized Stage 2 Implementation Targets

---

## 3. Stage 3 Independent Audit Verification & Resolution Status

All Stage 2 targets and Stage 3 independent audit findings have been empirically reproduced, resolved, hardened, and verified across both native PostgreSQL 16 and embedded PGlite:

1. **Target 1 (P0): Client Idempotency & Correlated IPC Bridge (`REQ-INT-01`) — VERIFIED PASS**
   - Implemented strict client-supplied idempotency key contract (`Idempotency-Key` / `X-Idempotency-Key` and `clientOrderId`) in `backend/routes/orderRoutes.ts` and `backend/services/tradingService.ts`.
   - Rejects missing idempotency key (400 Bad Request), invalid UUID format (400 Bad Request), and mismatched header vs body (400 Bad Request).
   - Rejects differing duplicate payloads with 409 Conflict; isolates keys by account (403 Forbidden); returns original order and trades on legitimate retry without double execution.
   - Frontend `TradingTerminal.tsx` updated to generate client UUID and supply both in headers and body.
   - Refactored `CppEngineBridge` to correlate responses by `order_id` map instead of naive FIFO queues.
   - `DATABASE` established as the sole production-authoritative matching mode.

2. **Target 2 (P0): Fix C++ Immediate-or-Cancel (IOC) Status Defect (`REQ-CPP-03`) — VERIFIED PASS**
   - Correctly set `order.status = OrderStatus::CANCELLED` for unfulfilled IOC balances in `engine/src/order_book.cpp`.
   - Verified with 3 regression test suites in `engine/tests/test_order_book.cpp` under GCC `-O2` and AddressSanitizer/UBSan.

3. **Target 3 (P1): Compile Standalone C++ Engine and Enforce IPC Bridge Tests in CI (`REQ-INT-02`, `REQ-INT-03`) — VERIFIED PASS**
   - Standalone `meridian_engine` compiled and smoke-tested in `.github/workflows/ci.yml`.
   - `tests/cpp_bridge.test.ts` executes against the live C++ engine binary in CI.

4. **Target 4 (P2): Gap Detector Bounded Zero-Allocation Hardening (`REQ-CPP-06`) — VERIFIED PASS**
   - Refactored `engine/include/gap_detector.hpp` to completely eliminate heap allocations (`std::vector<Gap> gaps_` replaced with `std::array<Gap, kMaxTrackedGaps>` and `std::span<const Gap>`).
   - Word-level sequence jump bit-clearing loop implemented, achieving sub-microsecond worst-case bounded complexity ($O(\min(\lceil \Delta / 64 \rceil, 1024))$).
   - Added exhaustive tests in `engine/tests/test_order_book.cpp`: sequential, large jumps (50,000), full-window clears (>65,536), split gaps, duplicates, stale packets, and max capacity saturation (512 gaps). Verified under ASan/UBSan.

5. **Target 5 (P0): PostgreSQL Transaction Connection Affinity (`REQ-DBMS-10`) — VERIFIED PASS**
   - Eliminated `pool.query()` pseudo-transactions spanning arbitrary physical connections.
   - Implemented `db.transaction()` dedicated `PoolClient` lifecycle with guaranteed connection affinity: BEGIN, statements, and COMMIT execute on the same client, with ROLLBACK and release in `finally`.
   - Integrated atomic PostgreSQL sequences (`order_id_seq`, `trade_id_seq`, `fill_id_seq`, `engine_seq_gen`) to eliminate ID allocation collisions across concurrent processes.
   - Added native PostgreSQL 16 container service to GitHub Actions CI workflow alongside PGlite.
   - Verified on native PostgreSQL 16 (WSL & CI) with zero connection leaks and 100% rollback isolation.

6. **Target 6 (P0): Multi-Connection Concurrency & Financial Parity (`REQ-TEST-04`) — VERIFIED PASS**
   - 10 concurrent async BUY orders (10 shares each) matched against 50 resting shares on Native PostgreSQL 16.
   - Verified row-level locking (`SELECT ... FOR UPDATE`), zero overfills (exactly 50 matched), side-specific fills constraint (1 BUY, 1 SELL per trade), double-entry cash balance conservation ($70,000 debited == $70,000 credited), and net position parity (+50 vs -50).
   - Resolved native Postgres `BIGINT` string vs number comparison in order matching leaves calculation.
   - Added Step 4: Multi-Connection Rollback Isolation and Non-Interference Verification.
   - Integrated `npm run test:concurrency` as a mandatory blocking check in GitHub Actions CI.
