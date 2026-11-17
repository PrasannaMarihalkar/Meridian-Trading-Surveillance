# MERIDIAN — Phase 10 Release Review

**Date:** 2026-11-17  
**Reviewer:** Independent Release Review Agent  
**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Institution:** PES University, DBMS Experiential Learning — Level 3  
**Author:** Prasanna Marihalkar (USN: PES1UG24CS684)  
**Repository:** `C:\Users\prasa\.gemini\antigravity\scratch\meridian`  

---

## 1. Verified Current State

### 1.1 Git Log (8 Commits, Linear History)

| Commit | Message |
|--------|---------|
| `257fa8a` | test(audit): complete independent engineering verification and release audit |
| `d5b83fa` | test: add integration test suite and complete project documentation |
| `e3e9971` | feat(ui): implement responsive trading terminal, surveillance console, and showcase |
| `754d29a` | feat(backend): implement REST APIs, RBAC auth, risk limits, and vector surveillance |
| `ddb5b57` | feat(engine): implement C++20 limit order book, lock-free SPSC queue, and benchmarks |
| `38d351a` | feat(db): implement relational schema, triggers, seed data, and college queries |
| `f0711a6` | docs: establish college requirements, Chen ER model, and architecture |
| `27f7fa2` | chore: establish project development tooling and container configuration |

**Branch:** `main` — clean working tree, nothing to commit.

### 1.2 Test Run Results (`npx tsx tests/api.test.ts`)

All 9 integration tests passed on a live PGlite embedded PostgreSQL instance:

```
=== MERIDIAN END-TO-END INTEGRATION TEST SUITE ===

[DB] Initializing embedded PostgreSQL (PGlite) at ...database/pgdata...
[DB] Embedded PostgreSQL engine ready.
[TEST] User Registration & Automatic Account Provisioning                    ✓ PASSED
[TEST] User Login & Session Invalidation Check                               ✓ PASSED
[TEST] Pre-Trade Risk Limit Enforcement (Exceeding max_order_qty)            ✓ PASSED
[TEST] Pre-Trade Price Collar Rejection (Deviating > 5%)                     ✓ PASSED
[TEST] Order Matching & Side-Specific Fill Generation (1 BUY & 1 SELL)      ✓ PASSED
[TEST] Database Trigger Verification (Position Update on Fill)               ✓ PASSED
[TEST] Order Placement and Order Cancellation                                ✓ PASSED
[TEST] Surveillance Evaluation & Cosine Vector Pattern Matching              ✓ PASSED
[TEST] Alert Investigation Workflow & Full-Text Search (tsvector)            ✓ PASSED

================================================================
TEST SUMMARY: 9 PASSED, 0 FAILED
================================================================
```

### 1.3 Server Status (Port 4000)

**LIVE.** `netstat -ano | findstr :4000` confirms the server is actively LISTENING on all interfaces (`0.0.0.0:4000` and `[::]:4000`, PID 24336) with 3 established connections at time of review. The server starts via `npx tsx backend/server.ts` and the PGlite embedded database initializes automatically — zero external dependencies required.

---

## 2. Existing Strengths (Evidence-Backed)

### 2.1 Working End-to-End System
The full trading workflow — registration → authentication → risk validation → order matching → fill generation → position update → surveillance — is verifiably correct across 9 automated integration tests. No test failures, no skips.

### 2.2 Zero-Config Embedded Database (PGlite)
`database/db.ts` uses `@electric-sql/pglite` by default when `DATABASE_URL` is not set. The persisted PGlite data directory (`database/pgdata`) means no external PostgreSQL instance is needed for the demo. This is a significant operational strength for a college submission.

### 2.3 Correct Price-Time Priority Matching Logic in TypeScript
`backend/services/tradingService.ts` implements a correct price-time priority continuous double auction:
- BUY aggressors match against resting SELLs ordered `price ASC, submitted_at ASC`.
- SELL aggressors match against resting BUYs ordered `price DESC, submitted_at ASC`.
- Self-trade prevention: `account_id <> $4` clause in candidate query prevents wash trading.
- IOC/MARKET unfilled residue is immediately CANCELLED.

### 2.4 Risk Management Layer
Pre-trade filters verified in source (`tradingService.ts` lines 19–103):
- `max_order_qty` / `max_order_notional` rejection.
- 5% price collar relative to `reference_price`.
- `max_open_orders` count gate.
- Cash sufficiency check for BUY orders.

### 2.5 RBAC and Authentication
`backend/middleware/auth.ts`: JWT verification with `jsonwebtoken`. `requireRole()` middleware enforces role scope per route. Trader-to-own-account enforcement at `orderRoutes.ts` lines 25–28, 96–97. Account lockout after 5 failed logins (`authService.ts` lines 118–119). Session records written on every login.

### 2.6 Parameterised SQL Everywhere
Every database query in `tradingService.ts`, `authService.ts`, `surveillanceService.ts`, and all route handlers uses `$1 / $2 / ...` placeholder syntax. No string interpolation into SQL was found across any reviewed file. SQL injection risk is effectively zero.

### 2.7 Surveillance Engine with Vector Cosine Similarity
`surveillanceService.ts` constructs an 8-dimensional feature vector from real order-flow data (cancel ratio, quote-to-trade ratio, lifetime, size skew, message rate, book imbalance, opposite-fill ratio, layering depth) and computes cosine similarity against seeded patterns. The algorithm is implemented from scratch in TypeScript with no external ML dependency. Test 8 verified it triggers alerts on simulated spoofing sequences.

### 2.8 Well-Structured Documentation
16 markdown files in `/docs` cover architecture, database design, ER diagram, API reference, security, demo guide, and deployment. Three PDF ER diagram exports and a project synopsis DOCX exist for the college submission package.

---

## 3. Real Weaknesses (With Specific File References)

### 3.1 Matching Engine Concurrency / Atomicity Gap
`tradingService.ts` runs multiple sequential `db.query()` calls without wrapping the entire match-and-fill sequence in a **single database transaction**. If the process crashes mid-match (e.g., between `INSERT INTO trades` and the `UPDATE orders SET filled_qty` calls), the database will be in a partially settled state — a trade exists without the resting order being marked filled. This is a correctness defect for a financial system.

**File:** `backend/services/tradingService.ts` — `submitOrder()` method (lines 109–257). There is no `BEGIN` / `COMMIT` / `ROLLBACK` wrapping the matching loop.

### 3.2 Manual Sequential ID Generation is Not Safe Under Load
Trade IDs, Fill IDs, and Order IDs are computed via `SELECT COALESCE(MAX(id), seed) + 1` patterns. Under concurrent requests (even two simultaneous orders), two threads can read the same MAX and produce duplicate IDs. PostgreSQL sequences (`SERIAL` / `GENERATED ALWAYS AS IDENTITY`) would prevent this.

**File:** `backend/services/tradingService.ts` lines 115–116, 176–179, 209–211.

### 3.3 Surveillance Feature Engineering Has Hard-Coded Shortcut Values
Features 6 (`book_imbalance_impact`), 7 (`opposite_side_fill_ratio`), and 8 (`layering_depth`) are **not calculated from real market data**. They are set via hard-coded conditional rules based solely on `cancelRatio`:
```typescript
const bookImbalance = cancelRatio > 0.7 ? 0.75 : 0.15;   // surveillanceService.ts:90
const oppFillRatio  = cancelRatio > 0.8 ? 0.08 : 0.45;   // surveillanceService.ts:93
const layeringDepth = cancelRatio > 0.75 ? 3.5 : 0.5;    // surveillanceService.ts:96
```
Only 5 of 8 features are genuinely data-driven. This reduces the surveillance engine's real discriminative power.

### 3.4 WebSocket Broadcasts No Real-Time Market Events
`backend/websocket.ts` exports `broadcastMarketData()` but it is **never called** from `tradingService.ts` after a trade executes. When a match occurs, no `BOOK_UPDATE` or `TRADE_TICK` event is emitted to connected clients. The WebSocket server confirms connections and responds to PINGs, but delivers no live order-book or trade-tick data.

**File:** `backend/websocket.ts` — `broadcastMarketData()` defined but unused at runtime. `backend/services/tradingService.ts` — no import or call to `broadcastMarketData`.

### 3.5 JWT Secret Falls Back to a Hard-Coded Dev String
If `JWT_SECRET` is not set in the environment, `auth.ts` falls back to `'meridian-super-secure-dev-secret-key-2026'` (line 5). Any deployment that forgets to set the env var ships with a known, public JWT signing secret — all tokens can be forged.

**File:** `backend/middleware/auth.ts` line 5.

### 3.6 CORS Origin is Wildcard `'*'`
`backend/server.ts` line 24: `origin: '*'`. This allows any domain to make credentialed cross-origin requests. Acceptable for a dev demo; unacceptable in production.

### 3.7 No Database Transaction Isolation for Reading Candidates
The candidate order query in `tradingService.ts` (lines 152–164) reads the order book outside a transaction. Resting orders selected as match candidates could be cancelled by another concurrent request between the read and the subsequent `UPDATE`. The order would be matched against quantity that no longer exists.

---

## 4. CRITICAL: C++ Engine Integration Reality

### Finding: **NO — The C++ engine is NOT called at runtime by the Node.js backend.**

This is the most architecturally significant finding of this review.

#### Evidence

**1. `tradingService.ts` has zero C++ references.**  
A complete read of `backend/services/tradingService.ts` (all 334 lines) finds:
- No `import` of any native addon (`*.node`), FFI library, or child-process module.
- No `child_process.spawn()` / `execFile()` call.
- No stdio pipe, socket, or IPC mechanism to any external process.
- No reference to the string `"meridian_engine"`, `"engine"`, or any binary path.
- The matching loop (lines 143–236) is pure TypeScript operating directly on PostgreSQL.

**2. `engine/src/main.cpp` is a standalone stdio-protocol binary.**  
The C++ binary reads commands from `stdin` (`while (std::getline(std::cin, line))`) and writes results to `stdout`. It is architecturally designed to be driven by an external process via IPC — but **no Node.js code makes such a connection**. The binary is an isolated executable that could be integrated but is not.

**3. `backend/server.ts` imports nothing from `engine/`.**  
Server startup imports only: `express`, `http`, `path`, `cors`, `dotenv`, the route modules, `initWebSocketServer`, `getDatabase`, and `rateLimiter`. No engine process is spawned on boot.

**4. `package.json` has no engine build or start step.**  
The `scripts` section contains `start`, `dev`, `test`, `db:init`, `demo:queries`, and `build:frontend`. There is no script to compile or launch `meridian_engine`.

#### Actual Runtime Execution Path (ASCII)

```
HTTP POST /api/orders
        │
        ▼
  orderRoutes.ts
  authenticate() → JWT verify
  PlaceOrderSchema.parse() → Zod validation
        │
        ▼
  TradingService.submitOrder()
  ┌─────────────────────────────────────────────────────────┐
  │            PURE TYPESCRIPT MATCHING ENGINE              │
  │  validateRiskLimits()  → PostgreSQL queries             │
  │  INSERT INTO orders    → PostgreSQL                     │
  │  SELECT candidates     → PostgreSQL (price-time sort)   │
  │  for each resting order:                                │
  │    INSERT INTO trades  → PostgreSQL                     │
  │    INSERT INTO fills×2 → PostgreSQL                     │
  │    UPDATE resting order→ PostgreSQL                     │
  │  UPDATE active order   → PostgreSQL                     │
  └─────────────────────────────────────────────────────────┘
        │
        ▼
  Response: { order, trades[] }

  ┌─────────────────────────────────────────────────────────┐
  │            C++ ENGINE (engine/meridian_engine)          │
  │  Standalone ELF/EXE binary                              │
  │  Reads: stdin  (ORDER / CANCEL / SNAPSHOT commands)     │
  │  Writes: stdout (ACK / TRADE / SNAPSHOT responses)      │
  │  Status at runtime: NOT RUNNING / NOT CONNECTED         │
  └─────────────────────────────────────────────────────────┘
```

#### What the C++ Code Actually Is

The C++ codebase (`engine/src/order_book.cpp`, `include/order_book.hpp`, `include/types.hpp`, `include/spsc_queue.hpp`) is a **high-quality, complete, independently correct** implementation of:
- A price-time priority limit order book (`OrderBook::process_order()`).
- Lock-free SPSC ring buffer (`SPSCQueue<T, Capacity>`).
- Nanosecond-timestamped trade generation.
- Stdin/stdout command protocol for integration.

It is **production-quality C++20 code** that simply is not wired into the runtime system. The TypeScript matching logic in `tradingService.ts` duplicates its function.

#### Architectural Claim vs. Reality

The `docs/ARCHITECTURE.md` diagram (Section 2) depicts a `TCP / Lock-Free Ring` connection from the Node.js Gateway to the `MATCHING ENGINE (C++20)`, and claims "UDP Multicast ITCH-Style Feed" and "Gap Detection & TCP Retransmission". **None of these exist at runtime.** The architecture document describes an aspirational or proposed design, not the implemented system.

---

## 5. Production Readiness Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| No DB transaction wrapping match loop | **CRITICAL** | Partial trade settlement on crash |
| Duplicate ID race condition under concurrency | **HIGH** | Use PostgreSQL SERIAL / SEQUENCE |
| JWT secret has hard-coded fallback | **HIGH** | `auth.ts` line 5; fail-hard if unset |
| WebSocket delivers no live market data | **MEDIUM** | `broadcastMarketData()` never called |
| CORS wildcard `origin: '*'` | **MEDIUM** | Restrict to known frontend origin in prod |
| Rate limiter is in-memory (single process only) | **MEDIUM** | Will not work behind load balancer; use Redis |
| No HTTPS/TLS at app layer | **MEDIUM** | Acceptable via reverse proxy; must be documented |
| Surveillance features 6–8 are approximations | **MEDIUM** | Real book-impact calculation needed |
| No graceful shutdown / connection draining | **LOW** | Abrupt termination may corrupt in-flight state |
| No `helmet` or security headers middleware | **LOW** | X-Frame-Options, CSP, HSTS missing from Express |

---

## 6. Security Concerns

### Genuine Strengths (Verified)
- **bcrypt** with 10 salt rounds for password storage (`authService.ts` line 27).
- **5-attempt lockout** with 15-minute window (`authService.ts` lines 118–120).
- **100% parameterised SQL** — no interpolation found anywhere.
- **Trader-scoped authorization** in order routes — traders cannot touch other accounts.
- **`.gitignore`** properly excludes `.env`, `node_modules`, pgdata binaries.

### Concerns
1. **Hard-coded JWT fallback secret** (`auth.ts` line 5): In a forgotten-env-var deployment this becomes a known public key. The correct pattern is to `throw new Error('JWT_SECRET must be set')` at startup if absent.
2. **Sessions table is insert-only**: JWT tokens cannot be revoked before expiry (12 hours). There is no token blacklist or session invalidation mechanism. A stolen token is valid for up to 12 hours.
3. **No `helmet` middleware**: Express is missing security headers (Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, HSTS).
4. **`cors({ origin: '*' })`**: Any website can make authenticated requests if a user visits it while logged in.

---

## 7. Frontend UX Concerns

### Strengths
- Responsive React SPA with Tailwind CSS dark theme — appropriate for a trading terminal aesthetic.
- Clear tab navigation: Trading Terminal / Surveillance / Audit Trail / College Showcase.
- Live WebSocket connection indicator (pulses green when connected).
- Role-aware UI: Surveillance tab content gates on user role.

### Concerns
1. **No mobile navigation fallback**: The `nav` element has `hidden md:flex`. On mobile screens the main navigation is completely invisible with no hamburger/dropdown replacement.
2. **WebSocket shows "LOB FEED LIVE" but delivers nothing**: The connection is live (confirmed by `netstat`) but `broadcastMarketData()` is never called after trade execution. The "LIVE" indicator misleads users into thinking they receive streaming data.
3. **User type stored as `any`**: `App.tsx` line 12: `const [user, setUser] = useState<any>(null)`. No TypeScript safety for the user object throughout the frontend.
4. **College Showcase tab**: A "CollegeShowcase" component exists specifically to demonstrate DBMS concepts for the evaluator — this is appropriate for submission but would be removed in a real product.

---

## 8. College Submission Status

### Requirement Fulfillment Matrix

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Relational schema (BCNF) with ≥10 tables | ✅ COMPLETE | 17 tables verified in PGlite schema |
| ER Diagram (Chen notation) | ✅ COMPLETE | `docs/college/MERIDIAN_ER_Diagram_Chen_Notation.pdf` |
| Advanced DB concepts (≥4 required, ≥7 implemented) | ✅ EXCEEDS | Transactions, Views, Stored Procs, Triggers, Multi-column Indexes, Vector Similarity Search, Full-Text tsvector |
| Project Synopsis | ✅ COMPLETE | `docs/college/Meridian_Project_Synopsis.docx` |
| Working demo | ✅ COMPLETE | Server live on :4000, all 9 tests pass |
| Multi-paradigm persistence | ✅ COMPLETE | Relational + Vector + Full-Text + JSONB audit log |
| Security implementation | ✅ COMPLETE | JWT, bcrypt, RBAC, rate limiting, lockout |

### Submission-Blocking Issue
**None.** The project is submittable as-is for the college evaluation. The C++ integration gap (Section 4) is an architectural honesty issue but does not block submission — the TypeScript matching engine is correct and demonstrable.

### Recommended Disclosure
When presenting to the evaluator, clearly state:
> "The C++ engine is a standalone implementation demonstrating C++20 systems programming skills. At runtime the Node.js backend uses its own TypeScript matching implementation directly against PostgreSQL. Integration via the C++ binary's stdio protocol is the next engineering phase."

---

## 9. Deployment Requirements

### Zero-Config Local Demo (Verified Working)
```bash
cd C:\Users\prasa\.gemini\antigravity\scratch\meridian
npm install          # already done
npx tsx backend/server.ts
# Server live at http://localhost:4000
```
No PostgreSQL installation required — PGlite starts automatically.

### Environment Variables
| Variable | Default | Required in Production |
|----------|---------|----------------------|
| `PORT` | `4000` | Optional |
| `JWT_SECRET` | ⚠️ Hard-coded fallback | **Must set** |
| `DATABASE_URL` | None (uses PGlite) | Recommended for production |
| `PGLITE_DATA_DIR` | `./database/pgdata` | Optional |

### Production Deployment Path
1. Set `JWT_SECRET` to a cryptographically random 256-bit value.
2. Set `DATABASE_URL` pointing to a managed PostgreSQL 16 instance.
3. Place behind NGINX/Cloudflare for HTTPS/WSS termination and static asset CDN.
4. Restrict CORS origin to the exact frontend domain.
5. Build the React frontend: `npx tsx scripts/build_frontend.ts`.

### Docker
`Dockerfile` and `docker-compose.yml` are referenced in `docs/DEPLOYMENT.md` and noted as verified in `FINAL_RELEASE_AUDIT.md`. Not independently verified in this review (no Docker socket available), but the config files are referenced as present.

---

## 10. Prioritised Implementation Plan

### P0 — Correctness (Fix Before Any Real Money Touches This)

1. **Wrap `submitOrder()` in a database transaction**  
   Add `BEGIN` / `COMMIT` / `ROLLBACK` around the entire match-and-fill sequence in `tradingService.ts`. Use `pg.PoolClient` transaction semantics or PGlite's `transaction()` API.

2. **Replace `SELECT MAX(id)+1` with PostgreSQL sequences**  
   Alter `orders`, `trades`, `fills`, `sessions`, `surveillance_sessions`, `alerts`, `alert_notes` tables to use `GENERATED ALWAYS AS IDENTITY`. Remove manual ID generation from service code.

3. **Fail-hard on missing `JWT_SECRET`**  
   In `backend/server.ts` startup block: `if (!process.env.JWT_SECRET) throw new Error('[BOOT] JWT_SECRET must be set in .env')`.

### P1 — Integration Completeness (High Impact)

4. **Wire `broadcastMarketData()` after trade execution**  
   In `tradingService.ts` `submitOrder()`, after the matching loop completes and trades are confirmed, call:
   ```typescript
   import { broadcastMarketData } from '../websocket';
   // After match loop:
   if (trades.length > 0) {
     broadcastMarketData({ type: 'TRADE_TICK', data: { trades }, timestamp: new Date().toISOString() });
     broadcastMarketData({ type: 'BOOK_UPDATE', data: await TradingService.getOrderBookSnapshot(input.instrumentId), timestamp: new Date().toISOString() });
   }
   ```

5. **Optionally wire C++ engine via child_process stdio**  
   Spawn `meridian_engine` in `server.ts`, route order submissions through it via the documented `ORDER` / `CANCEL` / `SNAPSHOT` text protocol, and use its ACK/TRADE responses to populate the database. This would make the architecture diagram accurate. Complexity: ~200 lines of TypeScript IPC wrapper.

### P2 — Security Hardening

6. **Add `helmet` middleware** (`npm install helmet`), one line in `server.ts`.
7. **Restrict CORS origin** to `process.env.FRONTEND_ORIGIN || 'http://localhost:4000'`.
8. **Implement token revocation** — add a `revoked_tokens` table or session invalidation flag; check on each authenticated request.

### P3 — Surveillance Accuracy

9. **Calculate features 6–8 from real data** instead of hard-coded conditionals. Requires joining trades against book snapshots.

### P4 — UX Polish

10. **Add mobile navigation** (hamburger menu or bottom tab bar for viewport < 768px).
11. **Add TypeScript typing to `user` state** in `App.tsx` (replace `any` with the `User` type from `backend/types.ts`).

---

*Review completed: 2026-11-17 | All findings based on direct source code inspection, live test execution, and port verification. No synthetic defects.*
