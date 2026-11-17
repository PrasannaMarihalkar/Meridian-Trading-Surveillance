# MERIDIAN Security Review

**Date:** 2026-11-17  
**Reviewer:** Security Review Agent  
**Project:** MERIDIAN — Fintech Trading & Surveillance Platform  
**Scope:** Backend authentication, authorization, network controls, SQL safety, secrets management, dependency vulnerabilities  

> [!IMPORTANT]
> This review is a point-in-time analysis. Security is never absolute. Findings are graded **CRITICAL / HIGH / MEDIUM / LOW / INFO** using impact × exploitability. All code snippets are verbatim from source.

---

## Security Architecture Overview

MERIDIAN is an Express.js REST API backed by PGlite (embedded PostgreSQL) with a WebSocket broadcast channel and a React SPA. The backend applies:

- **Authentication:** JWT (HS256), validated on every protected route via `authenticate` middleware.
- **Authorization (RBAC):** Three roles — `TRADER`, `ANALYST`, `ADMIN` — enforced by `requireRole()` middleware and per-route role filtering.
- **Input validation:** Zod schema parsing on all write endpoints.
- **Rate limiting:** In-memory per-route+IP sliding-window limiter.
- **SQL queries:** Exclusively parameterized (`$1`, `$2`, ...) via the PGlite/pg driver.
- **Password hashing:** bcrypt with cost factor 10.

```
Client (Browser/WS) ──► Express (CORS/Rate-limit) ──► authenticate ──► requireRole ──► Route Handler ──► PGlite
                    └──► WebSocket /ws  ──────────────────── (NO AUTH) ──────────────────► Broadcast
```

---

## 1. Authentication Security

### 1.1 Password Hashing

**Algorithm:** bcrypt, cost factor 10.

```typescript
// authService.ts:27-28
const salt = await bcrypt.genSalt(10);
const passwordHash = await bcrypt.hash(params.password, salt);
```

**Assessment:** bcrypt with rounds=10 is acceptable for a college-grade project in 2026. Production hardening would use rounds=12–14 or Argon2id. Current value: ~100ms per hash on commodity hardware — adequate as a baseline deterrent.

**Brute-force lockout:** Accounts lock for 15 minutes after 5 consecutive failed login attempts. This is correctly implemented.

```typescript
// authService.ts:118-119
if (failedCount >= 5) {
  lockClause = `, locked_until = NOW() + INTERVAL '15 minutes'`;
}
```

**Assessment:** ✅ Good defensive posture. The lockout logic is applied server-side to the database row, not just in memory.

---

### 1.2 JWT Security

| Property | Value |
|---|---|
| Algorithm | **HS256** (HMAC-SHA256, symmetric) |
| Secret source | `process.env.JWT_SECRET \|\| 'meridian-super-secure-dev-secret-key-2026'` |
| Expiry | 12 hours fixed (`{ expiresIn: '12h' }`) |
| Token refresh | ❌ None — single-issue 12h tokens only |
| RS256 | ❌ Not used |

**Hardcoded fallback secret (CRITICAL):**

```typescript
// auth.ts:5
export const JWT_SECRET = process.env.JWT_SECRET || 'meridian-super-secure-dev-secret-key-2026';
```

If the application is deployed without a `.env` file or without setting `JWT_SECRET`, the fallback string `'meridian-super-secure-dev-secret-key-2026'` is used as the signing key. Because this string is in the public repository, **anyone who reads the source code can forge valid JWT tokens for any user, role, or account ID.** This is a critical production vulnerability.

**HS256 vs RS256:** HS256 is acceptable for a monolithic backend (the same process signs and verifies). RS256 would be needed if external services need to verify tokens without access to the secret. For this project, HS256 is fine provided the secret is properly protected.

**No token refresh:** A 12h fixed-expiry token with no refresh endpoint means a compromised token is valid for the full remaining window and cannot be selectively invalidated. This amplifies the risk of session invalidation issues described below.

---

### 1.3 Session Invalidation

**Finding: Logout is a no-op server-side (HIGH)**

```typescript
// authRoutes.ts:60-62
router.post('/logout', authenticate, (_req, res) => {
  res.json({ message: 'Successfully logged out' });
});
```

The logout endpoint:
1. Validates the JWT (via `authenticate`) — ✅
2. Returns a success message — ✅
3. **Does NOT invalidate the token or session record in the database** — ❌

The `sessions` table is written to on login (`INSERT INTO sessions ...`) but is **never queried on the authenticate path** and **never updated/deleted on logout**. The session record is decorative only.

After calling `/api/auth/logout`, a client holding the JWT can continue making authenticated API requests until the token's 12h expiry elapses. If a token is stolen, the legitimate owner cannot revoke it.

**Root cause:** `AuthService` has no `logout` static method. The route handler has no server-side invalidation logic whatsoever.

---

## 2. Authorization & RBAC

### 2.1 Role Enforcement on Admin/Analyst Endpoints

Verified with direct code inspection:

| Endpoint | Middleware Applied | TRADER blocked? |
|---|---|---|
| `GET /api/surveillance/alerts` | `authenticate, requireRole('ANALYST', 'ADMIN')` | ✅ Yes |
| `GET /api/surveillance/alerts/:id` | `authenticate, requireRole('ANALYST', 'ADMIN')` | ✅ Yes |
| `PUT /api/surveillance/alerts/:id/status` | `authenticate, requireRole('ANALYST', 'ADMIN')` | ✅ Yes |
| `GET /api/surveillance/sessions` | `authenticate, requireRole('ANALYST', 'ADMIN')` | ✅ Yes |
| `POST /api/surveillance/evaluate` | `authenticate, requireRole('ANALYST', 'ADMIN')` | ✅ Yes |
| `GET /api/system/audit-log` | `authenticate, requireRole('ADMIN', 'ANALYST')` | ✅ Yes |
| `GET /api/system/engine-offsets` | `authenticate, requireRole('ADMIN')` | ✅ Yes (ANALYST also blocked) |
| `PUT /api/accounts/:id/risk-limits` | `authenticate, requireRole('ADMIN')` | ✅ Yes |

**One gap — `GET /api/surveillance/patterns` is unauthenticated relative to roles:**

```typescript
// surveillanceRoutes.ts:129
router.get('/patterns', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
```

This route requires a valid JWT (`authenticate`) but applies **no `requireRole` restriction**, so any authenticated TRADER can retrieve all `surveillance_patterns`. This may be intentional (patterns are reference data), but if pattern definitions are sensitive (e.g., they describe the thresholds used to flag traders), exposing them to TRADERs enables gaming the surveillance system.

**`GET /api/system/college-queries` — unauthenticated relative to roles:**

```typescript
// systemRoutes.ts:72
router.get('/college-queries', authenticate, async (req: AuthenticatedRequest, res: Response) => {
```

Applies `authenticate` but no role guard. Any authenticated user can run arbitrary demo queries, which may expose sensitive data depending on what queries are in `04_demo_queries.sql`.

---

### 2.2 Horizontal Privilege Escalation (RBAC)

**Orders — TRADER isolation verified:**

```typescript
// orderRoutes.ts:55-57
if (req.user?.role === 'TRADER') {
  query += ` AND o.account_id = $${idx++}`;
  params.push(req.user.accountId);
}
```

A TRADER's `GET /api/orders` is filtered by their own `account_id` from the JWT payload — not from a URL/query parameter. ✅

**Order placement cross-account check:**

```typescript
// orderRoutes.ts:25-28
if (req.user?.role === 'TRADER' && req.user.accountId !== validated.accountId) {
  res.status(403).json({ error: 'Forbidden: You can only place orders for your own account' });
  return;
}
```
✅ Correctly enforced.

**Order cancellation cross-account check:**

```typescript
// orderRoutes.ts:96-99
if (req.user?.role === 'TRADER' && req.user.accountId !== targetAccountId) {
  res.status(403).json({ error: 'Forbidden: Cannot cancel order belonging to another trader' });
  return;
}
```
✅ Correctly enforced — the `targetAccountId` is fetched from the database (not from the request), so it cannot be spoofed.

**Accounts — TRADER isolation:**

```typescript
// accountRoutes.ts:17-20
if (req.user?.role === 'TRADER') {
  query += ' WHERE user_id = $1';
  params.push(req.user.userId);
}
```
✅ List filtered by own `user_id`. Detail endpoint additionally checks:
```typescript
// accountRoutes.ts:50-53
if (req.user?.role === 'TRADER' && req.user.accountId !== accountId) {
  res.status(403).json({ error: 'Forbidden: Access restricted to account owner' });
```
✅ Correctly enforced.

**Trades/Fills:**

```typescript
// tradeRoutes.ts:17-20
if (req.user?.role === 'TRADER') {
  query += ` AND (buyer_account_id = $${idx} OR seller_account_id = $${idx})`;
  params.push(req.user.accountId);
```
✅ Correctly enforced.

**Summary:** Horizontal escalation between TRADER accounts is effectively blocked across all order, account, and trade endpoints.

---

## 3. Network Security

### 3.1 CORS Configuration

**Finding: CORS wildcard in production (HIGH)**

```typescript
// server.ts:23-27
app.use(cors({
  origin: '*', // For development, allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

CORS is set to `origin: '*'` (allow all origins) with a comment acknowledging this is a development setting. This configuration is **not restricted to a specific production domain** and is **not configurable via environment variable**. 

A wildcard CORS does not directly enable CSRF attacks against APIs that require `Authorization: Bearer` headers (since custom headers trigger preflight), but it does:
- Allow any website to read responses from the API if the user is authenticated
- Fail to meet the principle of least privilege for a financial application

**`ALLOWED_ORIGIN` is not present in `.env.example`**, confirming there is no env-driven CORS restriction mechanism.

### 3.2 Content Security Policy (CSP)

**Finding: No CSP headers set (MEDIUM)**

```typescript
// server.ts — full file inspected
// No `helmet` import, no manual res.setHeader('Content-Security-Policy', ...)
```

The server does not use `helmet` or any equivalent middleware. No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, or other security headers are set.

### 3.3 Rate Limiting

**Implementation:** Custom in-memory sliding-window per route+IP, defined in `rateLimiter.ts`.

**Applied limits:**

| Route | Window | Limit | Behavior |
|---|---|---|---|
| `/api/auth/login` | 60s | 30 req | 429 with `Retry-After` |
| `/api/auth/register` | 60s | 15 req | 429 with `Retry-After` |
| `/api/*` (global) | 60s | 300 req | 429 with `Retry-After` |

**Key properties of the implementation:**

- **Fixed-window, not sliding-window:** Despite the comment in the code calling it "sliding-window", the implementation uses a `resetTime = now + windowMs` anchor set at first request. This is a fixed-window that resets atomically, making it vulnerable to boundary burst attacks (up to `2×maxRequests` in a short interval at window boundaries).
- **In-memory only:** State is stored in `const ipBuckets = new Map<string, RateLimitRecord>()`. It **does not survive process restart**. After a crash/restart, all rate limit counters reset to zero.
- **No distributed coordination:** In a multi-process or clustered deployment, each process would have its own independent counter, multiplying effective limits by the number of processes.
- **Stale entry cleanup:** Cleaned every 5 minutes via `setInterval(...).unref()` — correct and prevents unbounded memory growth.
- **IP spoofing via X-Forwarded-For:** The key uses the first value from `X-Forwarded-For`:
  ```typescript
  // rateLimiter.ts:19
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  ```
  Without a trusted proxy configured (`app.set('trust proxy', ...)` in Express), a client can spoof this header to bypass rate limits entirely.

### 3.4 WebSocket Authentication

**Finding: WebSocket has NO authentication (HIGH)**

```typescript
// websocket.ts:18-26
wss.on('connection', (ws: WebSocket, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[WS] Client connected from ${ip}. Total active clients: ${wss.clients.size}`);

  ws.send(JSON.stringify({
    type: 'CONNECTION_ACK',
    message: 'Connected to MERIDIAN Real-Time Exchange Stream',
    timestamp: new Date().toISOString()
  }));
```

The WebSocket connection handler:
1. Accepts **any client** without checking for a JWT token
2. Immediately sends a `CONNECTION_ACK` with exchange stream confirmation
3. Broadcasts `BOOK_UPDATE`, `TRADE_TICK`, and `SURVEILLANCE_ALERT` payloads to **all connected clients** without filtering by role or identity

There is no token validation in the upgrade handshake (e.g., via `req.headers.authorization` or query parameter `?token=...`). Any client — anonymous or not — that connects to `ws://host:4000/ws` receives the full market broadcast stream, including `SURVEILLANCE_ALERT` payloads that are restricted to `ANALYST/ADMIN` on the HTTP API.

---

## 4. Input Validation & SQL Safety

### 4.1 SQL Injection

**npm security audit result:** `found 0 vulnerabilities`

**Custom audit script result:** `0 unparameterized query lines found` (across 15 TypeScript backend files).

All database queries use parameterized placeholders (`$1`, `$2`, ...) exclusively. No string interpolation of user input into query strings was found across all inspected route files:

| File | Pattern | Status |
|---|---|---|
| `authService.ts` | `db.query('...', [params.email, ...])` | ✅ Parameterized |
| `orderRoutes.ts` | `db.query(query, params)` with `$${idx++}` | ✅ Parameterized |
| `tradeRoutes.ts` | `db.query(query, params)` with `$${idx++}` | ✅ Parameterized |
| `accountRoutes.ts` | `db.query('... WHERE account_id = $1', [accountId])` | ✅ Parameterized |
| `surveillanceRoutes.ts` | `db.query(query, params)` with `$${idx++}` | ✅ Parameterized |
| `systemRoutes.ts` | `db.query(query, params)` with `$${idx++}` | ✅ Parameterized |
| `instrumentRoutes.ts` | `db.query('... WHERE instrument_id = $1', [id])` | ✅ Parameterized |

**Note on the custom audit script:** The script (`security_audit.ts`) uses a heuristic that flags lines containing `.query(` that also contain `${` without `$` or `idx++`. This is a weak heuristic and would miss interpolations on query string continuation lines (e.g., `query += ` lines). Manual inspection confirms no such issues exist, but the script should not be relied upon as sole verification.

### 4.2 Zod Schema Validation

All write endpoints use Zod schemas before passing data to services:

| Endpoint | Schema |
|---|---|
| `POST /api/auth/register` | `RegisterSchema` — email, username(3-30), password(≥8), role enum |
| `POST /api/auth/login` | `LoginSchema` — identifier(≥1), password(≥1) |
| `POST /api/orders` | `PlaceOrderSchema` — accountId, instrumentId, side enum, orderType enum, price≥0, qty>0 |
| `POST /api/surveillance/evaluate` | `EvaluateSchema` — accountId, instrumentId (ints, positive) |
| `PUT /api/accounts/:id/risk-limits` | `UpdateRiskSchema` — all numerics, ranges enforced |

**Gap:** `LoginSchema` accepts `password: z.string().min(1)` — a single character satisfies it. This is intentional (login checks stored hash), but ensures no empty-string bypass.

---

## 5. Information Disclosure

### 5.1 Global Error Handler

```typescript
// server.ts:76-82
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[SERVER_ERROR]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});
```

**Assessment (MEDIUM):** The global error handler does **not** expose `err.stack` to the client — ✅. However, it does expose `err.message`, which may leak internal details such as database error messages (e.g., constraint names, column names, PGlite internal messages). In route-level catch blocks, `err.message` is returned directly too:

```typescript
// orderRoutes.ts:79
res.status(500).json({ error: err.message });
```

A PGlite constraint violation message like `"duplicate key value violates unique constraint \"users_email_key\""` would be returned to the client. This reveals schema internals (table/constraint names) and the database engine in use.

### 5.2 Health Endpoint Information Disclosure

```typescript
// systemRoutes.ts:14-24
res.json({
  status: 'HEALTHY',
  service: 'MERIDIAN Trading & Surveillance Core',
  version: '1.0.0',
  database: {
    alive: dbCheck.rows.length === 1,
    engine: db.isPGlite ? 'Embedded PostgreSQL (PGlite)' : 'PostgreSQL Native'
  },
  uptime_seconds: process.uptime(),
  memory_usage: process.memoryUsage()
});
```

`GET /api/system/health` is **unauthenticated** and reveals: service name, version, database engine type, process uptime, and memory layout. This is information a threat actor can use to fingerprint the system. In a production deployment this endpoint should require authentication or be IP-restricted.

### 5.3 403 Role Leakage

```typescript
// auth.ts:36-38
res.status(403).json({
  error: `Forbidden: Access restricted to roles: [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`
});
```

A 403 response tells the caller exactly which roles are permitted and confirms the caller's own role. This is an information disclosure: an attacker who has obtained a low-privilege token can probe all API endpoints and map the RBAC matrix by collecting 403 messages. Consider returning a generic `"Forbidden"` message.

---

## 6. Environment & Secrets Management

### 6.1 JWT_SECRET Hardcoded Fallback

```typescript
// auth.ts:5  ← THE CRITICAL LINE
export const JWT_SECRET = process.env.JWT_SECRET || 'meridian-super-secure-dev-secret-key-2026';
```

**Risk:** If `JWT_SECRET` is not set in the deployment environment:
- The fallback `'meridian-super-secure-dev-secret-key-2026'` is used as the HMAC signing key.
- Since this string is committed to the repository, **anyone with repository read access can craft valid JWTs**, including tokens claiming `role: 'ADMIN'` with any `userId` and `accountId`.
- This would bypass all RBAC controls — `requireRole('ADMIN')`, trader isolation, audit log access — entirely.

**`.env.example` handling:**

```
# .env.example:4
JWT_SECRET=replace_with_a_secure_jwt_secret_for_production
```

The example file correctly documents this requirement, but the code still falls back gracefully to the insecure string rather than refusing to start.

**Missing at startup:** There is no startup validation that aborts the process if `JWT_SECRET` is not set:
```typescript
// server.ts — no JWT_SECRET guard found
```

### 6.2 Database Credentials

PGlite (embedded) requires no credentials — this is acceptable for a college project. If `DATABASE_URL` is set, credentials live in the `.env` file, which is excluded from git (confirmed by `.env.example` pattern). No hardcoded DB credentials found.

---

## 7. Dependency Vulnerabilities

**npm audit output (run 2026-11-17):**

```
found 0 vulnerabilities
```

All dependencies are free of known CVEs as of audit date. Key security-relevant packages in use:

| Package | Purpose | Version status |
|---|---|---|
| `bcrypt` | Password hashing | ✅ No known vulnerabilities |
| `jsonwebtoken` | JWT sign/verify | ✅ No known vulnerabilities |
| `zod` | Input validation | ✅ No known vulnerabilities |
| `cors` | CORS middleware | ✅ No known vulnerabilities |
| `ws` | WebSocket server | ✅ No known vulnerabilities |
| `express` | HTTP framework | ✅ No known vulnerabilities |

---

## 8. Verified Protections

The following security controls are **confirmed implemented and functional** by direct code inspection:

| Control | Implementation | Status |
|---|---|---|
| Password hashing with bcrypt(10) | `authService.ts:27-28` | ✅ |
| Account lockout after 5 failed logins | `authService.ts:118-119` | ✅ |
| JWT authentication on all protected routes | `auth.ts:11-26` applied universally | ✅ |
| TRADER horizontal escalation prevention (orders) | `orderRoutes.ts:25-28, 55-57, 96-99` | ✅ |
| TRADER horizontal escalation prevention (accounts) | `accountRoutes.ts:17-20, 50-53, 100-103` | ✅ |
| TRADER horizontal escalation prevention (trades) | `tradeRoutes.ts:17-20, 53-55` | ✅ |
| Surveillance endpoints restricted to ANALYST/ADMIN | `surveillanceRoutes.ts` throughout | ✅ |
| Audit log restricted to ADMIN/ANALYST | `systemRoutes.ts:31` | ✅ |
| Engine offsets restricted to ADMIN only | `systemRoutes.ts:61` | ✅ |
| Risk limits update restricted to ADMIN only | `accountRoutes.ts:70` | ✅ |
| SQL parameterization across all routes | Verified by inspection + audit script | ✅ |
| Zod schema validation on all write endpoints | `authRoutes, orderRoutes, accountRoutes, surveillanceRoutes` | ✅ |
| Rate limiting on login (30/min) and register (15/min) | `server.ts:48-49` | ✅ |
| npm audit: 0 known vulnerabilities | `npm audit` output | ✅ |
| Password hash not returned on login | `authService.ts:163` `const { password_hash, ...cleanUser }` | ✅ |

---

## 9. Residual Risks

Honest assessment of unresolved risks remaining after the above analysis. Not inflated; every entry is evidence-backed.

| ID | Risk | Severity | Exploitability |
|---|---|---|---|
| R1 | Hardcoded JWT_SECRET fallback allows any repo reader to forge admin tokens | **CRITICAL** | High — requires only source code read access |
| R2 | WebSocket /ws accepts unauthenticated connections and broadcasts SURVEILLANCE_ALERT payloads to all | **HIGH** | High — trivially connect with curl/wscat |
| R3 | Logout does not invalidate JWT server-side; stolen tokens remain valid for 12h | **HIGH** | Medium — requires token theft first |
| R4 | CORS wildcard (`origin: '*'`) in production build | **HIGH** | Medium — requires a malicious site the authenticated user visits |
| R5 | No CSP, X-Frame-Options, or security headers (no helmet) | **MEDIUM** | Medium — exploitable via XSS if injected |
| R6 | `err.message` returned to clients may leak DB constraint/column names | **MEDIUM** | Low — schema info, not credentials |
| R7 | Health endpoint unauthenticated — leaks version, DB engine, memory layout | **MEDIUM** | Low — reconnaissance value only |
| R8 | Rate limiter is in-memory only — does not survive restart; bypassable via X-Forwarded-For spoofing | **MEDIUM** | Medium — mitigated by account lockout for login |
| R9 | 403 responses reveal the allowed roles and caller's role | **LOW** | Low — reconnaissance |
| R10 | `GET /api/surveillance/patterns` accessible to all authenticated users (no role guard) | **LOW** | Low — depends on sensitivity of pattern definitions |
| R11 | `GET /api/system/college-queries` accessible to all authenticated users | **LOW** | Low — demo queries only, read-only |
| R12 | bcrypt rounds=10 is below 2026 production recommendation of 12–14 | **LOW** | Low — only matters if hash database is exfiltrated |
| R13 | No token refresh — 12h fixed-expiry tokens; no revocation path without server-side session validation | **LOW** | Low — operational risk |

---

## 10. Recommended Hardening Steps (Prioritised)

### Priority 1 — CRITICAL: Fix before any public deployment

**[H1] Remove JWT_SECRET hardcoded fallback — throw on missing env var**

```typescript
// auth.ts — REPLACE:
export const JWT_SECRET = process.env.JWT_SECRET || 'meridian-super-secure-dev-secret-key-2026';

// WITH:
if (!process.env.JWT_SECRET) {
  throw new Error('[FATAL] JWT_SECRET environment variable is not set. Refusing to start.');
}
export const JWT_SECRET = process.env.JWT_SECRET;
```

Also rotate and change the string immediately — it is now publicly known.

---

**[H2] Add JWT authentication to WebSocket upgrade**

```typescript
// websocket.ts — add before wss.on('connection', ...)
wss.on('headers', (headers, req) => { /* noop */ });

// In connection handler, extract and verify token from query param or Authorization header:
wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token) { ws.close(4001, 'Unauthorized'); return; }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    // Store decoded on ws for per-user filtering
    (ws as any).user = decoded;
  } catch {
    ws.close(4001, 'Token expired or invalid');
    return;
  }
  // ... rest of handler
});
```

Additionally, filter `SURVEILLANCE_ALERT` broadcast to only clients with ANALYST/ADMIN role.

---

### Priority 2 — HIGH: Fix before beta user testing

**[H3] Implement server-side token invalidation on logout**

Option A (simple): Add a `revoked_tokens` table or in-memory Set; check on each `authenticate` call.  
Option B (better): Query `sessions` table on `authenticate` using the token's `jti` claim; delete session row on logout.

```typescript
// authRoutes.ts logout handler should call:
await db.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at > NOW()', [req.user.userId]);
```

Also set `expiresIn: '1h'` with a refresh token endpoint to reduce the blast radius of stolen tokens.

---

**[H4] Restrict CORS to known origin via environment variable**

```typescript
// server.ts — REPLACE:
app.use(cors({ origin: '*', ... }));

// WITH:
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

Add `ALLOWED_ORIGIN=https://meridian.example.com` to `.env.example`.

---

### Priority 3 — MEDIUM: Fix before production hardening

**[H5] Add security headers with helmet**

```bash
npm install helmet
```
```typescript
// server.ts — add after app = express():
import helmet from 'helmet';
app.use(helmet());
// Or with explicit CSP:
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    connectSrc: ["'self'", "ws://localhost:4000"]
  }
}));
```

**[H6] Sanitize error messages returned to clients**

Replace `res.status(500).json({ error: err.message })` in route catch blocks with:
```typescript
res.status(500).json({ error: 'An internal error occurred' });
// Log the full error server-side only
console.error('[ROUTE_ERROR]', err);
```

**[H7] Authenticate the health endpoint or strip sensitive fields**

Remove `memory_usage`, `database.engine`, and `uptime_seconds` from the unauthenticated health response, or add `authenticate` middleware.

**[H8] Use `express-rate-limit` with a Redis store in place of the custom in-memory limiter**

This fixes restart-reset, multi-process issues, and X-Forwarded-For spoofing in one step:
```bash
npm install express-rate-limit rate-limit-redis ioredis
```

---

### Priority 4 — LOW: Polish for submission completeness

**[H9] Add `requireRole('ANALYST', 'ADMIN')` to `GET /api/surveillance/patterns`** if pattern definitions are considered sensitive.

**[H10] Add `requireRole('ADMIN')` to `GET /api/system/college-queries`** to restrict demo query execution.

**[H11] Genericize 403 responses** — remove the role enumeration from the message body. Return `{ error: 'Forbidden' }` only.

**[H12] Increase bcrypt cost factor to 12** for stronger password storage:
```typescript
const salt = await bcrypt.genSalt(12); // was 10
```

**[H13] Add startup validation for all required environment variables** (JWT_SECRET, NODE_ENV) in a dedicated `validateEnv()` function called before `server.listen`.

---

*End of MERIDIAN Security Release Review — 2026-11-17*
