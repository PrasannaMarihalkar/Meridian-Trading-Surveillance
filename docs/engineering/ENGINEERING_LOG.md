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

### Entry 002: Stage 2 Implementation (Planned)
- **Target Date:** Pending Stage 2 Initiation
- **Status:** **QUEUED**
- **Objectives:**
  1. Fix IOC order status defect in `engine/src/order_book.cpp` and add tests in `engine/tests/test_order_book.cpp`.
  2. Implement dual-mode matching (`CPP` vs `DATABASE`) in `backend/services/tradingService.ts` with automatic fallback.
  3. Compile `meridian_engine` and enforce live `tests/cpp_bridge.test.ts` execution in `.github/workflows/ci.yml`.
  4. Harden `engine/include/gap_detector.hpp` against heap allocations using fixed-size sequence sliding window.
  5. Support native Windows binary spawning in `backend/services/cppEngineBridge.ts`.
  6. Reconcile `README.md` and `docs/` with actual container architecture (`std::map` and `std::list`).
