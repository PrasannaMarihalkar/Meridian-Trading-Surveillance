# MERIDIAN — Engineering Standards, Invariants & Agent Guidelines
**Target Repository:** `https://github.com/PrasannaMarihalkar/meridian-trading-surveillance`  
**Scope:** Applicable to all AI agents, automated assistants, and human engineers contributing to MERIDIAN.  

---

## 1. Project Mission & Architectural Context

**MERIDIAN** is a simulated institutional trading platform and market surveillance system designed for PES University's DBMS Experiential Learning curriculum (Level 3) and professional portfolio evaluation.

The system integrates:
1. **Low-Latency Systems Core (C++20):** Price-time FIFO matching engine, lock-free SPSC circular ring buffer, fixed-point integer pricing, and multicast sequence gap tracking.
2. **Relational Persistence Tier (PostgreSQL 16):** 17 Boyce-Codd Normal Form (BCNF) tables, side-specific double-entry settlement triggers, immutable audit logging, tsvector full-text search, and 8-dimensional cosine vector similarity.
3. **Application Gateway (Node.js / TypeScript / Express):** Pre-trade risk filters (price collars, open orders, max notional), JWT/RBAC security, Zod input validation, WebSocket market data broadcast, and C++ engine IPC bridge.
4. **Institutional Trading Terminal (React 18 / Tailwind):** Level 2 order book ladder, trade blotter, compliance investigation console, and interactive college query runner.

---

## 2. Immutable Engineering Invariants

Every agent or engineer operating in this repository MUST strictly uphold the following invariants:

### Invariant 1: Uncompromising Truthfulness in Documentation
- Never present simulated, standard library, or database-level behavior as custom low-latency zero-allocation hardware execution.
- If the C++ engine uses `std::map` and `std::list`, document it as `std::map` and `std::list`. Never claim it uses intrusive memory pools unless intrusive memory pools are genuinely implemented and tested.
- If an order matching mode executes in PostgreSQL SQL, state clearly that it executes in PostgreSQL SQL.

### Invariant 2: Preserve Working Core Functionality
- Never rewrite, break, or discard working components.
- The 17 normalized tables, 4 views, 4 triggers, 17 demonstration SQL queries, Zod route schemas, and React UI components are verified and functional. Any change must extend, not break, existing features.

### Invariant 3: Double-Entry Financial Consistency
- In every trade execution, total cash debited must equal total cash credited.
- Every matched trade must produce exactly one `BUY` fill record and one `SELL` fill record in `fills`, enforced by `UNIQUE(trade_id, side)`.
- Positions and cash balances must reconcile exactly with cumulative fill history. Negative cash or oversold positions without margin are prohibited.

### Invariant 4: Test-First Defect Remediation
- Never patch a bug or defect in C++ or backend logic without first writing an automated test case that fails against the unpatched code.
- Verify that the test fails, apply the fix, and verify that the test passes cleanly without regressions.

### Invariant 5: Zero Tolerance for Secret Leaks or Permissive CI Gates
- Never commit plain-text credentials, API keys, or private tokens.
- Never add `continue-on-error: true` to security scanners (TruffleHog, secret regex audits, npm audit) or CI gates.
- All 10 CI jobs must pass cleanly (`result == 'success'`).

---

## 3. Subsystem Architecture & Modification Guidelines

### C++ Engine (`engine/`)
- **Standard:** C++20 (`-std=c++20`), strict warning compliance (`-Wall -Wextra -Wpedantic`).
- **Memory Safety:** Every test binary must execute cleanly under AddressSanitizer (`-fsanitize=address`) and UndefinedBehaviorSanitizer (`-fsanitize=undefined`).
- **Pricing:** Prices MUST use 64-bit signed fixed-point integer ticks (`Price`, scaled by 10,000). Never introduce floating-point arithmetic (`double` or `float`) into internal order book matching loops.
- **Order Lifecycle:** IOC (Immediate-or-Cancel) orders must have their unfulfilled balance cancelled immediately upon matching completion and their status set to `OrderStatus::CANCELLED`.

### Relational Database (`database/`)
- **Schema Normalization:** Schema must remain in Boyce-Codd Normal Form (BCNF). No redundant or unnormalized columns.
- **Triggers:** Financial ledger updates (cash balance debits/credits, position share updates, realized P&L calculations) MUST remain anchored in database triggers (`trg_fills_settlement`).
- **Audit Immutability:** `trg_audit_log_immutable` must remain active to guarantee that audit logs cannot be tampered with via SQL `UPDATE` or `DELETE`.

### Backend Gateway (`backend/`)
- **Type Rigor:** `npx tsc --noEmit` must pass with 0 errors. Never use `any` unless explicitly justified and lint-suppressed.
- **Linting:** ESLint 9 flat configuration must pass with zero warnings (`--max-warnings 0`).
- **Input Validation:** Every HTTP route receiving input must validate parameters, query strings, and body payloads with Zod schemas.

---

## 4. Definition of Done (DoD)

A task or pull request is considered complete ONLY when:
1. `npm run type-check` (`tsc --noEmit`) passes with 0 errors.
2. `npm run lint` (`eslint backend/ --max-warnings 0`) passes with 0 warnings.
3. `npm test` passes all end-to-end integration tests.
4. C++ unit tests compile and pass with 0 errors under ASan/UBSan sanitizers.
5. All 17 demonstration queries execute successfully via `npm run demo:queries`.
6. Secret scan (TruffleHog) verifies 0 secret leaks in git history.
7. Documentation and architectural diagrams accurately reflect actual code reality.
