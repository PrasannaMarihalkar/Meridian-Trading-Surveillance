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
| **REQ-DBMS-10** | Native PostgreSQL CI Verification | **PASS WITH LIMITATION** | `tests/api.test.ts:15-30` (uses PGlite WASM) | **P2** | Add native PostgreSQL 16 container service to CI workflow alongside PGlite. | CI runs tests against both native PostgreSQL 16 network socket and PGlite. |
| **REQ-CPP-01** | Price-Time Continuous Double Auction | **VERIFIED PASS** | `engine/src/order_book.cpp:20-160` | - | FIFO matching logic matches resting bids/asks correctly. | Verified via `test_order_book.cpp` and ASan/UBSan build in CI. |
| **REQ-CPP-02** | Fixed-Point Integer Price Scaling | **VERIFIED PASS** | `engine/include/types.hpp:13-26` | - | Scale factor 10,000 maps floating prices to 64-bit signed integers. | Arithmetic verified; 0 floating-point rounding errors in matching. |
| **REQ-CPP-03** | Immediate-or-Cancel (IOC) Order Lifecycle | **DEFECT IDENTIFIED** | `engine/src/order_book.cpp:99-115`, `engine/include/types.hpp:79` | **P0** | When IOC unfulfilled remainder is cancelled, set `order.status = OrderStatus::CANCELLED`. | Add test in `test_order_book.cpp` checking `order.status == CANCELLED` for unfilled/partially filled IOC. |
| **REQ-CPP-04** | Intrusive Container Memory Guarantees | **DOCUMENTATION DISCREPANCY** | `engine/include/order_book.hpp:40-60`, `README.md:26,78` | **P3** | Update documentation to truthfully reflect `std::map` and `std::list` standard containers. | Documentation matches actual C++ source code with zero false claims. |
| **REQ-CPP-05** | Lock-Free SPSC Ring Buffer Queue | **VERIFIED PASS** | `engine/include/spsc_queue.hpp:1-85` | - | Cacheline-aligned head/tail (`alignas(64)`), acquire/release memory order. | Inspect header; verify atomic operations and absence of locks/mutexes. |
| **REQ-CPP-06** | UDP Multicast Sequence Gap Detector | **PASS WITH LIMITATION** | `engine/include/gap_detector.hpp:22-60` | **P2** | Replace unbounded `std::unordered_set` with fixed sliding sequence window to avoid heap alloc. | Unit test verifying gap detection under packet drop, duplicate, and out-of-order packets. |
| **REQ-INT-01** | Backend-to-C++ Engine IPC Integration | **MISSING INTEGRATION** | `backend/services/tradingService.ts:110-160`, `backend/services/cppEngineBridge.ts:37-250` | **P0** | Wire `CppEngineBridge` into `TradingService` with configurable execution mode and DB fallback. | Submit order via API; assert C++ engine processes match and DB persists fills. |
| **REQ-INT-02** | Standalone C++ Engine Executable Build in CI | **DEFECT IDENTIFIED** | `.github/workflows/ci.yml:207-226`, `engine/CMakeLists.txt:20` | **P1** | Build `meridian_engine` in CI `cpp-build-and-test` job and run smoke verification. | CI artifact contains `meridian_engine`; executes without runtime crash. |
| **REQ-INT-03** | C++ IPC Bridge CI Integration Test | **DEFECT IDENTIFIED** | `.github/workflows/ci.yml:140-155`, `tests/cpp_bridge.test.ts:7-11` | **P1** | Add `tests/cpp_bridge.test.ts` to CI test runner; require live engine to be running (fail on absence). | Test passes with live matched trades reported across IPC boundary. |
| **REQ-INT-04** | Cross-Platform C++ Process Spawner | **PASS WITH LIMITATION** | `backend/services/cppEngineBridge.ts:74-95` | **P2** | Check for native binary (`meridian_engine.exe` on Windows) before attempting WSL launch. | C++ bridge connects cleanly on native Windows and Linux environments. |
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
| **REQ-TEST-01** | End-to-End API Test Suite | **VERIFIED PASS** | `tests/api.test.ts:1-320` | - | 9 passing test cases covering registration, auth, risk limits, matching, triggers, surveillance, FTS. | `npm test` runs 9 assertions; 9 passed, 0 failed. |
| **REQ-TEST-02** | C++ Unit Tests with Memory Sanitizers | **VERIFIED PASS** | `engine/tests/test_order_book.cpp`, `.github/workflows/ci.yml:218-226` | - | Compiled with `-fsanitize=address,undefined` in CI; blocking on failure. | ASan/UBSan test run exits 0 with zero memory errors or undefined behavior. |
| **REQ-TEST-03** | All-Checks-Pass CI Gatekeeper | **VERIFIED PASS** | `.github/workflows/ci.yml:285-325` (`ci-gate`) | - | Aggregates all 9 prerequisite jobs; fails if any job status is not 'success'. | Remote run `44037140642` passed all 10 checks. |

---

## 3. Prioritized Stage 2 Implementation Targets

From the matrix above, the following actionable remediation targets are prioritized for **Stage 2**:

1. **Target 1 (P0): Connect C++ Engine Bridge to Backend Trading Flow (`REQ-INT-01`)**
   - Introduce `ENGINE_MODE` (`'CPP' | 'DATABASE'`) in `backend/services/tradingService.ts`.
   - Dispatch orders to `CppEngineBridge` when in C++ mode; synchronize trades and fills back into PostgreSQL.
   - Maintain full database fallback if the C++ engine process is offline.
2. **Target 2 (P0): Fix C++ Immediate-or-Cancel (IOC) Status Defect (`REQ-CPP-03`)**
   - Correctly set `order.status = OrderStatus::CANCELLED` for cancelled unfulfilled IOC balances in `engine/src/order_book.cpp`.
   - Add explicit unit tests in `engine/tests/test_order_book.cpp`.
3. **Target 3 (P1): Compile Standalone C++ Engine and Enforce IPC Bridge Tests in CI (`REQ-INT-02`, `REQ-INT-03`)**
   - Compile `meridian_engine` in `.github/workflows/ci.yml`.
   - Execute `tests/cpp_bridge.test.ts` against the live binary in CI, failing if assertions cannot be verified.
4. **Target 4 (P2): Gap Detector Heap Allocation Hardening (`REQ-CPP-06`)**
   - Refactor `engine/include/gap_detector.hpp` to replace unbounded `std::unordered_set` with a fixed-size sequence sliding window or bitmap ring buffer.
5. **Target 5 (P2): Cross-Platform Process Spawning (`REQ-INT-04`)**
   - Support native Windows binary execution in `backend/services/cppEngineBridge.ts` before falling back to WSL.
6. **Target 6 (P3): Documentation Truthfulness Reconciliation (`REQ-CPP-04`)**
   - Harmonize `README.md` and `docs/ARCHITECTURE.md` to accurately describe the standard library container architecture (`std::map` and `std::list`).
