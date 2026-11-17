# MERIDIAN — GitHub Publication & Open-Source Release Report

**Platform:** GitHub  
**Repository:** [PrasannaMarihalkar/meridian-trading-surveillance](https://github.com/PrasannaMarihalkar/meridian-trading-surveillance)  
**Publication Date:** November 17, 2026  
**Author / Maintainer:** Prasanna Marihalkar (`PES1UG24CS684`), Department of Computer Science & Engineering, PES University  
**Supervisor / Academic Reviewer:** Dr. Nagasundari S  
**Release Tag:** [v1.0.0](https://github.com/PrasannaMarihalkar/meridian-trading-surveillance/releases/tag/v1.0.0)  
**CI Pipeline Status:** [![MERIDIAN CI Pipeline](https://github.com/PrasannaMarihalkar/meridian-trading-surveillance/actions/workflows/ci.yml/badge.svg)](https://github.com/PrasannaMarihalkar/meridian-trading-surveillance/actions/workflows/ci.yml) (Passing Green)

---

## 1. Repository Identity & Metadata

| Property | Value |
| :--- | :--- |
| **Repository Name** | `meridian-trading-surveillance` |
| **Owner** | `PrasannaMarihalkar` |
| **Visibility** | Public |
| **Default Branch** | `main` |
| **HTTPS Clone URL** | `https://github.com/PrasannaMarihalkar/meridian-trading-surveillance.git` |
| **SSH Clone URL** | `git@github.com:PrasannaMarihalkar/meridian-trading-surveillance.git` |
| **GitHub CLI** | `gh repo clone PrasannaMarihalkar/meridian-trading-surveillance` |
| **License** | MIT License (`LICENSE`) |
| **Description** | A high-performance C++20 price-time priority matching engine with PostgreSQL-backed trading workflows, a real-time React trading terminal, and market surveillance. |
| **Topics (13)** | `cpp`, `cpp20`, `database-systems`, `financial-technology`, `lock-free`, `market-surveillance`, `order-matching-engine`, `postgres`, `postgresql`, `react`, `systems-programming`, `trading-systems`, `typescript` |

---

## 2. GitHub Actions CI Verification

- **Workflow File:** `.github/workflows/ci.yml`
- **Target Commit:** `c4fa0d1`
- **Verified Run ID:** `44027321110`
- **Run URL:** [https://github.com/PrasannaMarihalkar/meridian-trading-surveillance/actions/runs/44027321110](https://github.com/PrasannaMarihalkar/meridian-trading-surveillance/actions/runs/44027321110)
- **Status:** **Completed Success (All Checks Passed)**

### Detailed Job Execution Matrix

| Job Name | Duration | Status | Key Verifications Performed |
| :--- | :---: | :---: | :--- |
| **Install Dependencies** | 22s | **Passed** | Clean `npm ci` cache population with synchronized `package-lock.json`. |
| **C++ Engine Build & Test** | 22s | **Passed** | GCC C++20 compilation (`-std=c++20 -O2 -pthread`), order book execution tests, AddressSanitizer (0 leaks). |
| **Secret Scan** | 9s | **Passed** | TruffleHog full-history scan and regex pattern audit. Excludes demo bundle string. |
| **ESLint** | 1m 9s | **Passed** | Backend TypeScript linting (`--max-warnings 50`). 0 errors, 42 stylistic warnings. |
| **TypeScript Type Check** | 17s | **Passed** | Full project type checking (`npx tsc --noEmit`). 0 type errors. |
| **DB Schema Validation** | 13s | **Passed** | Isolated PGlite disposable database run (`scripts/verify_disposable_db.ts`). 17 tables, 4 views, 17 queries. |
| **npm Audit** | 11s | **Passed** | High-severity vulnerability scan. Non-blocking critical gate. |
| **Frontend Build** | 11s | **Passed** | `esbuild` production bundling of React 18 / TypeScript terminal (`bundle.js`, `bundle.js.map`). |
| **Backend API Tests** | 14s | **Passed** | Pre-seeded database integration test suite (`tests/api.test.ts`). 9/9 integration tests passing. |
| **CI Gate (All Passed)** | 5s | **Passed** | Concurrency verification gate enforcing 100% green status across all jobs. |

---

## 3. GitHub Release v1.0.0

- **Tag:** `v1.0.0`
- **Release Name:** `MERIDIAN v1.0.0 — Production Release`
- **Release URL:** [https://github.com/PrasannaMarihalkar/meridian-trading-surveillance/releases/tag/v1.0.0](https://github.com/PrasannaMarihalkar/meridian-trading-surveillance/releases/tag/v1.0.0)
- **Release Notes Source:** `docs/RELEASE_NOTES.md`

### Core Capabilities Documented
1. High-Performance C++20 Order Matching Core (~3.9M orders/sec, 152 ns median latency).
2. Dual-Mode Architecture with Bidirectional stdio IPC Bridge (`cppEngineBridge.ts`).
3. PostgreSQL 16 Relational Subsystem (17 entities, BCNF normalized, 4 views, triggers, tsvector search).
4. Multi-Dimensional Vector Surveillance (8-feature vector extraction, cosine similarity pattern matching).
5. Institutional Bloomberg-Grade Frontend (React 18 / TypeScript, Level 2 ladder, Refinitiv dark theme).
6. Hardened Security Baseline (0 leaked secrets, parameterized SQL, sliding-window rate limiters).

---

## 4. Git Commit History & Lineage

The Git commit history is linear with conventional commits:

```text
* c4fa0d1 fix(types,ci): resolve TypeScript Express route types and ESLint pin for CI
* e7f8793 fix(ci): synchronize package-lock.json and refine secret-scan exclusion filters
* 064500b docs(github): configure open-source repository architecture, assets, and publication preflight
* 2217843 feat(release): complete phase 10 production hardening, C++ IPC bridge, and portfolio showcase
* 257fa8a test(audit): complete independent engineering verification and release audit
* d5b83fa test: add integration test suite and complete project documentation
* e3e9971 feat(ui): implement responsive trading terminal, surveillance console, and showcase
* 754d29a feat(backend): implement REST APIs, RBAC auth, risk limits, and vector surveillance
* ddb5b57 feat(engine): implement C++20 limit order book, lock-free SPSC queue, and benchmarks
* 38d351a feat(db): implement relational schema, triggers, seed data, and college queries
* f0711a6 docs: establish college requirements, Chen ER model, and architecture
* 27f7fa2 chore: establish project development tooling and container configuration
```

---

## 5. Clean-Clone Reproduction Verification

A clean-room verification was executed in an isolated temporary environment (`AppData/Local/Temp/meridian-verify-*`):

1. **Repository Clone:**
   ```bash
   git clone https://github.com/PrasannaMarihalkar/meridian-trading-surveillance.git
   ```
   *Result:* Cloned cleanly.
2. **Dependency Resolution:**
   ```bash
   npm ci
   ```
   *Result:* 135 packages installed in 22 seconds without dependency lockfile drift.
3. **Disposable Database Verification:**
   ```bash
   npx tsx scripts/verify_disposable_db.ts
   ```
   *Result:*
   - 17/17 tables verified.
   - 4/4 views and stored procedures (`fn_cosine_similarity`) verified.
   - 17/17 college demonstration queries verified with non-zero output.
   - Transaction atomicity & rollback verified.
   - Balance & position trigger updates verified.
   - Unique constraints verified.
4. **Integration Test Suite:**
   ```bash
   npx tsx scripts/init_db.ts
   npm test
   ```
   *Result:* 9/9 tests passed (Registration, Auth, Risk Limits, Price Collars, Fills, Triggers, Cancellations, Vector Surveillance, Full-Text Search).
5. **C++ Bridge Fallback Verification:**
   ```bash
   npx tsx tests/cpp_bridge.test.ts
   ```
   *Result:* Verified IPC fallback behavior.
6. **Frontend Production Build:**
   ```bash
   npx tsx scripts/build_frontend.ts
   ```
   *Result:* `bundle.js` and source map compiled successfully into `frontend/public/`.
7. **Cleanup:**
   *Result:* Temporary clone directory cleanly purged.

---

## 6. Open-Source Community Architecture

The repository contains standard open-source documentation:

- `README.md` — Project overview with badges, architecture diagrams, benchmark tables, and relative document links.
- `LICENSE` — MIT License.
- `CONTRIBUTING.md` — Contributor guidelines, code standards, C++20 conventions, and testing instructions.
- `CODE_OF_CONDUCT.md` — Contributor covenant standard.
- `SECURITY.md` — Vulnerability disclosure policy and response SLAs.
- `.github/ISSUE_TEMPLATE/bug_report.md` — Structured bug report template.
- `.github/ISSUE_TEMPLATE/feature_request.md` — Structured feature suggestion template.
- `.github/PULL_REQUEST_TEMPLATE.md` — Pull request checklist and review protocol.
- `.dockerignore` & `.editorconfig` — Clean workspace and cross-platform formatting rules.

---

## 7. Security and Academic Attestation

1. **Secret & Key Preflight Audit:**
   - Evaluated by TruffleHog and custom secret-scanning patterns across Git history.
   - Zero private keys, database passwords, or operational secrets committed.
   - Default environment template (`.env.example`) provided with dummy configuration.
2. **Path Sanitization:**
   - All references to local filesystem paths (`file:///C:/Users/...`) sanitized into clean relative markdown links across all documentation files.
3. **Academic Integrity:**
   - Formal attribution maintained for PES University, Course DBMS Experiential Learning Level 3.
   - Student identification (`PES1UG24CS684`, Prasanna Marihalkar) and Course Instructor (`Dr. Nagasundari S`) preserved.
