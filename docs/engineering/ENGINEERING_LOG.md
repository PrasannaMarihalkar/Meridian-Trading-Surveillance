# MERIDIAN — Engineering Execution Log & Architectural Ledger
**Project:** MERIDIAN (Simulated High-Performance Trading System & Surveillance Engine)  
**Repository:** `https://github.com/PrasannaMarihalkar/meridian-trading-surveillance`  
**Author / Maintainer:** Prasanna Marihalkar (`PES1UG24CS684`)  
**Lead Architect:** Principal Systems Architect & Technical Quality Lead  

---

## 1. System Baseline State

- **Current Git Branch:** `main`
- **Baseline Git Commit:** `2cfbd9c` (*docs(security): document CI security audit findings, remediation matrix, and privacy recommendations*)
- **Published Release Tag:** `v1.0.0` (commit `c4fa0d1`)
- **Remote CI Run Status:** GitHub Actions run `44037140642` — `completed success` (10/10 jobs green)
- **Dependency Audit Status:** 0 vulnerabilities (`npm audit --audit-level=high`), Zod `4.6.7`
- **Lint & Type Status:** 0 ESLint warnings (`eslint --max-warnings 0`), 0 TypeScript errors (`tsc --noEmit`)

---

## 2. Chronological Engineering Log

### Entry 001: Stage 1 Forensic Audit & Engineering Reconnaissance
- **Date:** November 17, 2026
- **Status:** **STAGE 1 COMPLETED**
- **Action Type:** Forensic Reconnaissance, Static Code Inspection, Test Suite Verification, Architectural Blueprint Creation

#### Activities Executed:
1. Conducted exhaustive inspection of all repository source directories: `backend/`, `database/`, `engine/`, `frontend/`, `scripts/`, `tests/`, `docs/`, `.github/workflows/`.
2. Verified PostgreSQL 16 schema integrity (`database/sql/01_schema.sql`): confirmed all 17 tables conform to Boyce-Codd Normal Form (BCNF). Verified 4 triggers, 4 views, cosine similarity function, and 17 official demonstration queries.
3. Executed end-to-end integration test suite (`tests/api.test.ts`): verified 9/9 passing assertions covering user registration, authentication, pre-trade risk controls, price collars, order matching, settlement triggers, surveillance vector evaluation, and full-text search.
4. Inspected C++20 engine codebase (`engine/include/`, `engine/src/`, `engine/tests/`): verified price-time FIFO matching logic, fixed-point integer pricing, and lock-free SPSC circular queue cacheline alignment (`alignas(64)`).
5. Uncovered critical architectural discrepancies and software defects:
   - **`FINDING-ARCH-01` (Critical):** `TradingService.submitOrder` does not call `CppEngineBridge`. Order matching is performed exclusively within PostgreSQL via SQL `SELECT ... FOR UPDATE` row locks.
   - **`FINDING-CPP-01` (High):** Immediate-or-Cancel (IOC) unfulfilled remainder does not rest on book, but order status is erroneously left as `OPEN` instead of `CANCELLED`.
   - **`FINDING-CI-01` (High):** CI pipeline builds `test_ob` but omits compiling the standalone `meridian_engine` executable (`engine/src/main.cpp`).
   - **`FINDING-CI-02` (High):** `tests/cpp_bridge.test.ts` is omitted from CI workflows and silently skips assertions if the C++ engine process is absent.
   - **`FINDING-DOC-01` (Medium):** Documentation claims "pre-allocated intrusive doubly-linked lists with zero dynamic allocation", whereas code uses standard `std::map<Price, std::list<Order>>` with standard library heap allocation.
   - **`FINDING-CPP-02` (Medium):** `GapDetector` uses an unbounded `std::unordered_set<uint64_t>`, inducing heap allocation on every packet.
   - **`FINDING-ARCH-02` (Medium):** `CppEngineBridge.spawnEngine()` unconditionally invokes WSL on Windows, failing or hanging when native Windows binaries are present.
6. Formulated formal engineering deliverables:
   - `docs/engineering/BASELINE_AUDIT.md`: Exhaustive 8-layer forensic assessment and finding records.
   - `docs/engineering/ACCEPTANCE_MATRIX.md`: System requirements mapped to code evidence, priority, and pass criteria.
   - `docs/engineering/IMPLEMENTATION_PLAN.md`: Phased, prioritized technical blueprint for Stage 2 execution.
   - `AGENTS.md`: Permanent immutable engineering invariants and architectural constraints.
   - `.agents/skills/meridian-implementation/SKILL.md`: Guided rules for safe C++, backend, and database changes.
   - `.agents/skills/meridian-verification/SKILL.md`: Verification protocols and test execution procedures.
   - `.agents/skills/meridian-release/SKILL.md`: Release engineering, academic viva preparation, and tagging standards.

#### Invariants Enforced:
- No application source code, C++ engine code, database migrations, CI configurations, or dependencies were altered during Stage 1.
- All discovered discrepancies and defects were documented with absolute empirical fidelity.

---

### Entry 002: Stage 2 Architecture Gate & Pre-Implementation Decision
- **Date:** November 17, 2026
- **Status:** **APPROVED & COMPLETED**
- **Decision Record:** `docs/engineering/ENGINEERING_EXECUTION_INTEGRATION_DECISION.md` (Rev 2.0)
- **Key Architectural Directives:**
  1. PostgreSQL `DATABASE` mode confirmed as sole authoritative production matching engine for Stage 2.
  2. Automatic cross-engine fallback and dual-engine active replication prohibited to eliminate state bifurcation.
  3. Client-supplied idempotency key contract required (`clientOrderId` scoped to authenticated principal).
  4. C++ matching engine preserved as decoupled high-throughput component communicating via hardened correlated stdio IPC.

---

### Entry 003: Stage 2 Controlled Implementation & Defect Elimination
- **Date:** November 17, 2026
- **Status:** **COMPLETED & EMPIRICALLY VERIFIED**
- **Auditor:** Principal Systems Architect & Engineering Verification Lead
- **Activities & Verified Outcomes:**
  1. **P0 C++ Immediate-or-Cancel (IOC) Status Defect Elimination (`REQ-CPP-03`):**
     - Corrected unfulfilled remainder logic in `engine/src/order_book.cpp` to set `order.status = OrderStatus::CANCELLED`.
     - Updated `OrderBook::process_order(Order& order)` pass-by-reference signature in `order_book.hpp` and `order_book.cpp` so mutated status and filled quantities propagate to callers.
     - Resolved `-Winterference-size` compiler warning in `engine/include/spsc_queue.hpp` with pinned constant `kCacheLineSize = 64`.
     - Added 3 regression test cases in `engine/tests/test_order_book.cpp` covering unfilled, partially filled, and fully filled IOC orders. Verified pass with 0 leaks/0 UB under AddressSanitizer and UndefinedBehaviorSanitizer.
  2. **P0 Client-Supplied Idempotency Contract & Account Ownership Isolation (`REQ-INT-01`):**
     - Updated `backend/routes/orderRoutes.ts` to accept optional client-supplied `clientOrderId: z.string().uuid()` and strictly derive account identity from authenticated principal (`req.user.accountId`), eliminating client-side spoofing.
     - Enhanced `backend/services/tradingService.ts` with fast-path idempotency lookup returning original order and executions on legitimate retry, rejecting differing duplicate payloads with 409 Conflict, and catching concurrent `23505` unique violations.
     - Added Test 10 and Test 11 to `tests/api.test.ts`. `npm test` verified: **11 passed, 0 failed**.
  3. **P1 Bounded UDP Sequence Gap Detector (`REQ-CPP-06`):**
     - Replaced unbounded `std::unordered_set` in `engine/include/gap_detector.hpp` with a pre-allocated 64K circular bitmap (`std::array<uint64_t, 1024>`, exactly 8,280 bytes).
     - Achieved $O(1)$ constant-time lookup and zero dynamic heap allocation on packet ingress.
     - Verified duplicate handling, gaps, out-of-order packet resolution, and stale packet rejection in `test_order_book.cpp`.
  4. **P1 Standalone C++ Engine Executable & CI Integration (`REQ-INT-02`, `REQ-INT-03`):**
     - Compiled standalone executable `engine/meridian_engine` with `engine/src/main.cpp` and `engine/src/order_book.cpp`.
     - Updated `.github/workflows/ci.yml` `cpp-build-and-test` job to compile `meridian_engine`, run CLI line-protocol smoke test, and execute `tests/cpp_bridge.test.ts`.
  5. **P1 Hardened IPC Bridge with Request-Response Correlation (`REQ-INT-01`, `REQ-INT-04`):**
     - Rewrote `backend/services/cppEngineBridge.ts` replacing naive FIFO queue with request correlation maps (`pendingOrders`, `pendingCancels`, `pendingSnapshots`).
     - Added 5s timeout safeguards, full Level 2 snapshot parsing (`bids` and `asks`), process lifecycle cleanup, and native Windows executable detection before WSL fallback.
     - Verified with 6-step test suite in `tests/cpp_bridge.test.ts`: **6/6 passed**.
  6. **P2 Database Concurrency, Row-Locking & Financial Parity Verification (`REQ-TEST-04`):**
     - Implemented `ExecutionMutex` in `TradingService` to guarantee strict sequential price-time determinism and eliminate ID allocation race conditions (`MAX(order_id) + 1`).
     - Created `tests/concurrency.test.ts`: fired 10 concurrent async BUY orders (10 shares each) against a resting 50-share SELL order.
     - Invariant verification: exactly 50 shares filled (zero overfills), exactly 1 BUY fill and 1 SELL fill per trade, double-entry cash balance conservation ($70,000 debit == $70,000 credit), and position parity (+50 vs -50). **All passed**.
  7. **P3 Documentation Truthfulness Reconciliation (`REQ-CPP-04`):**
     - Reconciled `README.md`, `docs/ARCHITECTURE.md`, `docs/PERFORMANCE_REPORT.md`, `docs/FINAL_RELEASE_AUDIT.md`, and `docs/RELEASE_NOTES.md`.
     - Eliminated all false claims of intrusive memory pools and zero dynamic allocation on order book fast path; accurately documented `std::map<Price, std::list<Order>>`.
     - Explicitly documented PostgreSQL `DATABASE` mode as the sole production-authoritative matching engine.

---

### Entry 004: Stage 3 Independent Audit Findings, Hardening & Verification
- **Date:** November 17, 2026
- **Status:** **ALL FINDINGS RESOLVED & EMPIRICALLY VERIFIED**
- **Auditor:** Principal Systems Architect & Independent Security/Database Specialist
- **Findings & Verified Outcomes:**
  1. **PostgreSQL Transaction Connection Affinity Defect Elimination (`REQ-DBMS-10`):**
     - **Confirmed Defect:** In commit `788434f`, `database/db.ts` and `TradingService.submitOrder()` used `pool.query()` for `BEGIN`, transaction statements, and `COMMIT`. Because `node-postgres` acquires an idle connection per `pool.query()`, statements executed across differing physical connections, causing uncommitted transaction leaks and failed rollbacks.
     - **Resolution:** Implemented `ITransactionClient` and `db.transaction<T>(fn)` in `database/db.ts`. Native `pg.Pool` acquires a dedicated `pg.PoolClient`, executes `BEGIN`, statements, and `COMMIT` on that exact connection, catches errors and runs `ROLLBACK`, and guarantees `client.release()` in a `finally` block.
     - **Verification:** Created `tests/test_transaction_affinity.ts`. Verified on Native PostgreSQL 16 (WSL) and PGlite: 5 concurrent interleaved transactions (odd fail, even succeed) resulted in exactly 0 leaked rows, clean rollbacks on failing connections, and 0 leaked connections in the pool.
  2. **Bounded Zero-Allocation UDP Packet Gap Detector (`REQ-CPP-06`):**
     - **Confirmed Defect:** `std::vector<Gap> gaps_` in `engine/include/gap_detector.hpp` dynamically allocated heap memory on packet arrival (`push_back`, `insert`, `erase`), violating zero-allocation claims. Furthermore, forward jump bit clearing used a linear loop over sequence numbers.
     - **Resolution:** Replaced `std::vector<Gap>` with pre-allocated inline `std::array<Gap, kMaxTrackedGaps>` (`kMaxTrackedGaps = 512`) and zero-allocation C++20 `std::span<const Gap> gaps()`. Replaced sequence loop with word-level batch bit clearing (`clear_index_range`), achieving $O(\min(\lceil \Delta / 64 \rceil, 1024))$ bounded clearing time. Contiguous memory footprint: exactly 20,560 bytes.
     - **Verification:** Expanded `engine/tests/test_order_book.cpp` with exhaustive tests covering large jumps (50,000 packets), full-window clears (>65,536), out-of-order gap splits and head/tail resolution, duplicates, stale packets, and max gap table saturation (512 gaps). Verified clean under GCC `-O2` and AddressSanitizer/UBSan.
  3. **Idempotency Enforcement & API Contract Hardening (`REQ-INT-01`):**
     - **Confirmed Defect:** Frontend `TradingTerminal.tsx` was not supplying `clientOrderId` or idempotency headers, leaving network retries vulnerable to duplicate execution.
     - **Resolution:** Implemented strict idempotency validation in `backend/routes/orderRoutes.ts`: accepts `Idempotency-Key` or `X-Idempotency-Key` headers or body `clientOrderId`, validates UUID format, enforces header/body equality (400 Bad Request on mismatch), rejects missing keys (400 Bad Request), rejects differing payloads (409 Conflict), and enforces account isolation (403 Forbidden). Added `Idempotency-Key` and `X-Idempotency-Key` to CORS `allowedHeaders` in `backend/server.ts`. Updated `TradingTerminal.tsx` to generate client-side UUID and send in both headers and body.
     - **Verification:** Added Tests 12-15 to `tests/api.test.ts`. Verified 15/15 integration tests passing on Native PostgreSQL 16 and PGlite.
  4. **Multi-Connection Concurrency & CI PostgreSQL Service Container (`REQ-TEST-04`):**
     - **Native PG Bug Caught:** In native PostgreSQL (`pg`), `orders.quantity` (`BIGINT`) is returned as a string (`'50'`). Strict equality `totalFilled === activeOrder.quantity` (`50 === '50'`) failed, falsely marking fully filled orders as `PARTIALLY_FILLED`, allowing a subsequent match to attempt a 0-quantity trade and violating `trades_quantity_check`. Fixed by parsing quantities with `parseInt(String(...), 10)` and adding `AND (quantity - filled_qty) > 0` to matching candidate selection.
     - **Rollback Isolation Test:** Added Step 4 to `tests/concurrency.test.ts`: verified that Connection A's forced rollback rolled back 100% of writes (0 residual rows, cash intact) without interfering with concurrent Connection B's commit.
     - **CI Pipeline Hardening:** Updated `.github/workflows/ci.yml` with a native `postgres:16` service container, running `init_db.ts`, `test_transaction_affinity.ts`, `api.test.ts`, and `concurrency.test.ts` against Native PostgreSQL 16 as a mandatory blocking check, followed by embedded PGlite verification.

---

### Entry 005: Final Comprehensive Engineering Remediation & Teacher-Demo Readiness
- **Date:** November 18, 2026
- **Status:** **ALL 10 FINDINGS FULLY REMEDIATED & EMPIRICALLY VERIFIED**
- **Branch:** `fix/final-teacher-demo-readiness`
- **Auditor / Lead Engineer:** Principal Systems Architect & Technical Quality Lead
- **Evaluation Target:** Academic Viva & Technical Demonstration Readiness for Faculty Evaluator Dr. Nagasundari S (PES University)
- **Remediated Findings & Verified Outcomes:**
  1. **Phase 1: Real Session Lifecycle & Immediate Token Revocation (`REQ-SEC-08`):**
     - **Defect:** JWT verification only checked cryptographic signature; logout lacked durable session invalidation. Active tokens remained valid post-logout or if a user was deactivated.
     - **Resolution:** Added `sessionId: string` to `AuthTokenPayload` and `sessions` table. Updated `authenticate` middleware in `backend/middleware/auth.ts` to query `sessions` and check `users.is_active = TRUE`. Added `POST /api/auth/logout` in `backend/routes/authRoutes.ts` with session row deletion and audit logging.
     - **Verification:** Verified in `tests/test_auth_rbac_hardening.ts` Test 3: revoked tokens return HTTP 401 Unauthorized immediately.
  2. **Phase 1: Public Registration Lockdown & Admin Provisioning (`REQ-SEC-07`):**
     - **Defect:** Public `POST /api/auth/register` accepted arbitrary roles, allowing self-escalation to `ADMIN` or `ANALYST`.
     - **Resolution:** Public registration strictly forces role to `TRADER`. Added protected `POST /api/auth/users` with `requireRole('ADMIN')` for provisioning administrative and surveillance personnel.
     - **Verification:** Verified in `tests/test_auth_rbac_hardening.ts` Tests 1 & 2: public registration requesting `ADMIN` forces `TRADER`, unauthenticated calls to `/api/auth/users` return 401, non-admin calls return 403.
  3. **Phase 1: Order Cancellation & Surveillance RBAC Enforcement (`REQ-SEC-09`):**
     - **Defect:** Role-based permission checks permitted `ANALYST` to cancel trader orders. `GET /patterns` was unauthenticated. Surveillance assignment accepted arbitrary analyst IDs without role verification.
     - **Resolution:** Updated `backend/routes/orderRoutes.ts` to strictly restrict cancellation to owning `TRADER` or `ADMIN` (ANALYST receives 403 Forbidden). Protected `GET /patterns` with `requireRole('ANALYST', 'ADMIN')`. Enforced analyst ID foreign-key and active-status verification in `backend/services/surveillanceService.ts`.
     - **Verification:** Verified in `tests/test_auth_rbac_hardening.ts` Tests 4 & 5.
  4. **Phase 1: WebSocket Confidentiality & Client Authentication (`REQ-SEC-10`):**
     - **Defect:** WebSockets allowed unauthenticated connections and broadcasted sensitive `SURVEILLANCE_ALERT` frames globally to all clients, including unprivileged traders.
     - **Resolution:** Added JWT authentication via `?token=` query parameter and `{ type: 'AUTH', token }` control frames in `backend/websocket.ts`. Segmented channel routing: `SURVEILLANCE_ALERT` is broadcast strictly to authenticated `ANALYST` and `ADMIN` sockets.
     - **Verification:** Verified in `tests/test_auth_rbac_hardening.ts` Test 6.
  5. **Phase 1: Gateway Hardening (Trust Proxy, CORS, Error Sanitization):**
     - Added `app.set('trust proxy', 1)` in `backend/server.ts` for reverse-proxy client IP resolution. Restrained CORS origin to configurable whitelist. Sanitized 500 error responses to prevent database stack-trace leakage in production.
  6. **Phase 2: Correct MARKET Order SQL Parameter Binding (`REQ-TRD-01`):**
     - **Defect:** In `backend/services/tradingService.ts`, SQL query parameter array differed between MARKET orders (3 params) and LIMIT orders (4 params), causing SQL placeholder misalignment errors under native PostgreSQL.
     - **Resolution:** Refactored candidate selection to use dynamic parameter placeholder indexing (`$1, $2, ...`), aligning parameters correctly for both order types.
     - **Verification:** Verified in `tests/test_trading_risk_integrity.ts` Test 1: market orders match resting limit liquidity without error.
  7. **Phase 2: Time-In-Force (IOC / FOK) Execution Modeling (`REQ-TRD-02`):**
     - **Defect:** Immediate-or-Cancel (IOC) and Fill-or-Kill (FOK) order types were not strictly modeled in SQL matching engine; residual quantities could mistakenly rest on book.
     - **Resolution:** Implemented strict IOC lifecycle (sweeps available liquidity, immediately marks remainder as `CANCELLED`, 0 book resting) and strict FOK lifecycle (checks cumulative available liquidity before executing matches; if insufficient, cancels order immediately with 0 fills).
     - **Verification:** Verified in `tests/test_trading_risk_integrity.ts` Tests 2 & 3.
  8. **Phase 3: Financial Pre-Trade Risk Controls (`REQ-RSK-01`, `REQ-RSK-02`):**
     - Enforced `max_position_qty` check against projected net position (`currentPosition +/- qty`).
     - Enforced instrument lot size multiples (`qty % lot_size === 0`) and tick size multiples (`(price * 100) % (tick_size * 100) === 0`).
     - Enforced reserved cash purchasing power guard (`cash_balance - reserved_cash >= order_notional`).
     - Enforced 5% price collar protection for MARKET orders against reference price.
     - **Verification:** Verified in `tests/test_trading_risk_integrity.ts` Tests 4, 5, 6, 7.
  9. **Phase 4: Atomic Relational Sequences & Deadlock Elimination (`REQ-DBMS-11`, `REQ-DBMS-12`):**
     - **Defect:** Entity ID allocation used vulnerable `MAX(id) + 1` subqueries subject to race conditions under concurrent transactions. Multi-account matching risked database deadlocks.
     - **Resolution:** Added 10 explicit PostgreSQL sequences in `database/sql/01_schema.sql` (`user_id_seq`, `account_id_seq`, `order_id_seq`, `trade_id_seq`, `fill_id_seq`, `engine_seq_gen`, `surveillance_sessions_id_seq`, `alerts_id_seq`, `alert_notes_id_seq`, `audit_log_id_seq`). Added sequence synchronization in `scripts/init_db.ts`. Replaced `MAX(id)+1` in services with atomic `nextval(...)`. Implemented strictly ascending numerical account lock ordering (`account_id IN ($1, $2) ORDER BY account_id FOR UPDATE`) in `tradingService.ts`.
     - **Verification:** Concurrency tests and demo queries pass with 0 deadlocks and 0 ID collisions.
  10. **Phase 5: Statistical Surveillance Rigor (`REQ-SURV-04`):**
      - Replaced arithmetic mean `AVG()` with true statistical median `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ...)` for `median_lifetime_ms`.
      - Replaced order count ratio with volume-weighted `size_skew` (`Math.abs(buyVol - sellVol) / totalVolume`).
      - Added division-by-zero guards for zero-volume or zero-order windows.
      - Enforced cosine similarity threshold `similarity >= 0.85` for alert generation.
      - **Verification:** Verified in `tests/test_trading_risk_integrity.ts` Test 8.
  11. **Phase 6: C++ Engine Hardening & Sanitizer Verification (`REQ-CPP-07`, `REQ-CPP-08`):**
      - Added duplicate order ID rejection (`active_order_ids`), price/quantity validation, unknown instrument rejection, and structured error responses in `engine/src/main.cpp`.
      - Recompiled with GCC `-std=c++20 -O2 -fsanitize=address,undefined -Wall -Wextra` under WSL with 0 errors / 0 warnings.
      - Expanded `tests/cpp_bridge.test.ts` to 12 comprehensive tests including crash recovery and IPC edge cases (12/12 passed).
  12. **Phase 7: Frontend Idempotency Key Persistence (`REQ-UI-05`):**
      - Updated `frontend/src/components/TradingTerminal.tsx` to preserve `activeIdempotencyKey` across network retries and submission failures, resetting only upon confirmed success or user edit.
      - Rebuilt frontend with `npm run build:frontend`.
  13. **Phase 8: Runtime Modernization, Docker & CI Alignment (`REQ-OPS-01`):**
      - Upgraded Node.js target to Node 22 LTS in `.github/workflows/ci.yml` and `Dockerfile`.
      - Hardened container with non-root `USER node` and `HEALTHCHECK`.
      - Updated `package.json` `test:all` script to execute all 6 automated test suites (57/57 tests passing across Native PG 16 and PGlite).
  14. **Phase 9: WebSocket Single-Use Tickets, Origin Validation & Replay Defense (`REQ-SEC-11`):**
      - Implemented `wsTicketManager` generating 30-second TTL single-use tickets with SHA-256 storage and atomic deletion upon redemption.
      - Validated origin hostnames against allowed list (`isAllowedOrigin`).
      - Verified in `tests/test_auth_rbac_hardening.ts` (9/9 passed).
  15. **Phase 10: PostgreSQL Advisory Locks & Position Bounds (`REQ-TRD-03`, `REQ-RSK-03`):**
      - Added `SELECT pg_advisory_xact_lock($1)` on `instrumentId` for cross-process transaction serialization at the database engine level.
      - Bounded short exposure for SELL orders: `Math.abs(currentNet - committedSells - qty) <= max_position_qty`.
      - Bounded purchasing power reservation for MARKET BUY orders to upper 5% price collar (`refPrice * 1.05`).
      - Verified in `tests/test_trading_risk_integrity.ts` (13/13 passed).

- **Final System Status:** **`READY FOR VERIFIED TEACHER DEMO`** (57/57 tests passing across Native PostgreSQL 16 and PGlite, 17/17 demo queries verified).


