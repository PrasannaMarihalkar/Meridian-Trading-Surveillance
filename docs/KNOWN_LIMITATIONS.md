# MERIDIAN — Known Limitations

**Project:** MERIDIAN v1.0.0  
**Document Type:** Honest Technical Limitations Disclosure  
**Author:** Prasanna Marihalkar (USN: PES1UG24CS684)  
**Date:** November 17, 2026

This document records every known technical limitation of the MERIDIAN platform, in accordance with principal engineering standards. These are not defects — they are deliberate scope decisions made for a college demonstration system, and are documented so that evaluators understand the gap between this implementation and a production-grade exchange.

---

## L1 — C++ Engine is Not Integrated with the Live Backend

**Severity:** Architectural (by design)  
**Affects:** Live order matching path

### What the README and architecture diagram suggest:
The ASCII diagram in `README.md` and `docs/ARCHITECTURE.md` shows an arrow from the Application Gateway to the C++ Systems Tier, labelled "IPC / POSIX / TCP Sockets". This implies the C++ engine is called at runtime.

### What actually happens:
The C++ matching engine (`engine/`) is a **standalone compiled binary** used exclusively for benchmarking and unit testing. It is **never called by the TypeScript backend at runtime**.

- There is no IPC, socket, pipe, shared memory, or FFI bridge between `backend/server.ts` and the C++ engine.
- Live order matching is performed entirely in TypeScript within `backend/services/tradingService.ts`, using SQL queries against the PGlite database.
- The C++ engine benchmark numbers (4.34M orders/sec, 145 ns p50) were measured on the **standalone binary only** and do **not** reflect the performance of the live web API.

### Actual live-path latency:
The live API path is: `HTTP Request → Express middleware → tradingService.ts → PGlite SQL → response`. This path operates at typical Node.js/embedded-database latency (single-digit milliseconds), not nanoseconds.

### Why this architecture was chosen:
Integrating a C++ engine into a Node.js backend requires a persistent child process, N-API/FFI bindings, or a local TCP socket — complexities beyond the scope of a DBMS coursework project. The C++ engine demonstrates systems programming competency independently, while the TypeScript backend demonstrates full-stack database engineering.

### What would be needed in production:
A production exchange would host the C++ matching engine as a persistent process, communicating with the order management system via a low-latency Unix domain socket or shared-memory ring buffer.

---

## L2 — PGlite is Not Native PostgreSQL

**Severity:** Infrastructure  
**Affects:** Database capabilities and scalability

MERIDIAN uses `@electric-sql/pglite` v0.2.16 — a WebAssembly port of PostgreSQL 16 that runs embedded in the Node.js process. This enables zero-config startup but has the following limitations compared to native PostgreSQL:

| Capability | PGlite | Native PostgreSQL |
|---|---|---|
| External connections (`psql`) | ❌ No TCP listener | ✅ Supported |
| `pg_dump` / `pg_restore` | ❌ Not available | ✅ Supported |
| `pgvector` extension | ❌ Not loadable | ✅ Supported (with install) |
| Full TimescaleDB | ❌ Not loadable | ✅ Supported (with install) |
| Multi-process access | ❌ Single-process only | ✅ Supported (many clients) |
| Horizontal scaling / replication | ❌ Not supported | ✅ Streaming replication |
| Persistent WAL / crash recovery | Limited | ✅ Full WAL with fsync |
| Write throughput | ~1,000–5,000 rows/sec | ~100,000+ rows/sec |

**Note:** PGlite implements standard PostgreSQL 16 SQL syntax, so all queries, triggers, views, functions, and constraints in this project will work identically on a native PostgreSQL 16 instance.

**Workaround for evaluators:** To run against native PostgreSQL, set the `DATABASE_URL` environment variable before starting:
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/meridian npm start
```

The `docker-compose.yml` configuration demonstrates this with a native PostgreSQL 16 Alpine container.

---

## L3 — In-Memory Rate Limiter

**Severity:** Operational  
**Affects:** Rate limiting in distributed or multi-restart scenarios

The rate limiter in `backend/middleware/rateLimiter.ts` stores client IP buckets in a JavaScript `Map` in process memory. This means:

1. **State is lost on restart:** All rate limit counters reset when the Node.js process restarts.
2. **Single-process only:** In a horizontally scaled deployment with multiple Node.js instances behind a load balancer, each instance maintains an independent counter — a client can bypass the limit by being routed to a different instance.

**Production fix:** Replace with a Redis-backed distributed rate limiter (e.g., `rate-limiter-flexible` with `ioredis`).

---

## L4 — JWT Sessions Are Not Server-Side Revocable

**Severity:** Security (acceptable for college demo)  
**Affects:** Session invalidation

JWTs are signed with a server secret and have a 12-hour expiration (`expiresIn: '12h'`). The `sessions` table in the database tracks session metadata but is **not checked on every request** — the JWT signature alone authorizes requests.

This means:
- If a JWT is stolen, it cannot be invalidated before its 12-hour expiry without changing the server's signing secret (which invalidates all sessions).
- The `POST /api/auth/logout` endpoint marks the session as logged out in the database, but a leaked token would still pass JWT verification middleware.

**Production fix:** Validate every request's session against the `sessions` table, or use short-lived JWTs (5 min) with a refresh token rotation system.

---

## L5 — No Real Money, No Real Trading

**Severity:** Informational  
**Affects:** All trading functionality

MERIDIAN is a **simulation platform**. All account balances, instruments, prices, and trades are synthetic seed data. No connection to any real exchange, broker API, or financial data feed exists. The system is not compliant with SEBI, NSE, BSE, or any financial regulatory framework.

---

## L6 — WSL ThreadSanitizer ASLR Requirement

**Severity:** Environment-specific (WSL2 only)  
**Affects:** ThreadSanitizer (TSan) build of C++ engine

On Windows Subsystem for Linux (WSL2 with Linux kernel 6.6), the ThreadSanitizer requires Address Space Layout Randomization (ASLR) to be disabled to function correctly, due to virtual memory mapping boundaries imposed by the WSL2 hypervisor.

The workaround is:
```bash
setarch x86_64 -R ./test_tsan
```

This does **not** affect:
- The correctness of the binary (the sanitizer still detects real races)
- Builds on native Linux or macOS
- The release binary (`benchmark_engine` without TSan)
- Windows-native builds (not applicable — C++ engine targets POSIX)

---

## L7 — Order Book Snapshot is Computed by SQL, Not an In-Memory LOB

**Severity:** Performance  
**Affects:** Level 2 order book API

The live order book depth shown in the Trading Terminal is computed by querying the `orders` table in real time:

```sql
SELECT price, SUM(quantity - filled_qty), COUNT(*)
FROM orders
WHERE instrument_id = $1 AND side = 'BUY' AND status IN ('OPEN', 'PARTIALLY_FILLED')
GROUP BY price ORDER BY price DESC LIMIT $2
```

This is correct and consistent, but is O(n) over open orders on each request, not O(1) from an in-memory sorted map. At seed data scale this is instantaneous; at production scale (millions of live orders) an in-memory LOB would be required.

---

## L8 — Brute-Force Lockout Tracks Failed Attempts in Memory

**Severity:** Operational  
**Affects:** Brute-force login protection across restarts

Failed login attempt counters are tracked in the `sessions` table / in-process memory. Like L3, these counters reset on process restart, allowing a brief window for brute-force attempts immediately after a restart.

---

## L9 — Frontend Bundle is Served as Static Files (No Hot Reload in Production)

**Severity:** Development experience only  
**Affects:** Frontend development workflow

The `npm run build:frontend` script uses `esbuild` to bundle the React application into `public/bundle.js`. This is a one-time build — changes to frontend source files require re-running the build script. There is no hot module replacement (HMR) for the production-mode static server.

**Workaround for development:** Use a separate Vite or Next.js dev server if iterating on the frontend.

---

## Summary Table

| # | Limitation | Impact | Production Fix |
|---|---|---|---|
| L1 | C++ engine not integrated with backend | Performance numbers don't reflect API path | FFI / Unix socket IPC |
| L2 | PGlite instead of native PostgreSQL | No external tools, single-process only | Set `DATABASE_URL` to native PG |
| L3 | In-memory rate limiter | Resets on restart, not distributed | Redis-backed `rate-limiter-flexible` |
| L4 | JWT not server-side revocable | Stolen tokens valid until expiry | Server-side session validation |
| L5 | Simulated trading only | Cannot be used for real trades | Full regulatory compliance required |
| L6 | WSL TSan ASLR workaround | Requires `setarch x86_64 -R` on WSL2 | Native Linux removes this need |
| L7 | SQL-computed order book | O(n) per request at scale | In-memory LOB with event sourcing |
| L8 | In-memory failed login counters | Reset on restart | Database-backed attempt counters |
| L9 | Static frontend bundle | No HMR | Vite dev server for development |
