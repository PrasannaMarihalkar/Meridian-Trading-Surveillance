# MERIDIAN Continuous Integration & Delivery (CI/CD)

**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Institution:** PES University, Department of Computer Science & Engineering  
**Lead Engineer:** Prasanna Marihalkar (`PES1UG24CS684`)  
**Date:** November 17, 2026  
**Pipeline Configuration:** `.github/workflows/ci.yml`

---

## 1. Pipeline Architecture

The MERIDIAN CI/CD pipeline runs on GitHub Actions on every push and pull request to `main`. It enforces strict quality gates across TypeScript, C++20, PostgreSQL schemas, and security controls before any release artifact is generated.

```
                  ┌──────────────────────┐
                  │  dependency-install  │
                  └──────────┬───────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
  ┌────────────┐     ┌──────────────┐     ┌─────────────┐
  │ type-check │     │     lint     │     │ db-validate │
  └──────┬─────┘     └──────────────┘     └──────┬──────┘
         │                                       │
         ├───────────────────┬───────────────────┘
         ▼                   ▼
  ┌──────────────┐    ┌───────────────┐
  │frontend-build│    │ backend-tests │
  └──────────────┘    └───────────────┘

  ┌──────────────────────────────────────────────┐
  │ PARALLEL INDEPENDENT JOBS:                   │
  │ • cpp-build-and-test (g++ C++20 + ASan)      │
  │ • secret-scan (TruffleHog + pattern grep)    │
  │ • npm-audit (0 vulnerability threshold)      │
  └──────────────────────────────────────────────┘
```

---

## 2. Job Specifications

| Job Name | Runs On | Dependencies | What It Validates | Command Executed |
|---|---|---|---|---|
| **`dependency-install`** | `ubuntu-latest` | None | Clean deterministic install from `package-lock.json` | `npm ci` |
| **`type-check`** | `ubuntu-latest` | `dependency-install` | TypeScript 5.7 static type consistency across all files | `npx tsc --noEmit` |
| **`lint`** | `ubuntu-latest` | `dependency-install` | Coding conventions and syntax standards | `npx eslint backend/ --ext .ts` |
| **`db-schema-validate`** | `ubuntu-latest` | `dependency-install` | DDL, 17 entities, 4 views, triggers, and rollback atomicity in PGlite | `npx tsx scripts/verify_disposable_db.ts` |
| **`backend-tests`** | `ubuntu-latest` | `type-check`, `db-schema-validate` | All 9 end-to-end integration test suites | `npx tsx tests/api.test.ts` |
| **`frontend-build`** | `ubuntu-latest` | `type-check` | Production bundle compilation and asset generation | `npx tsx scripts/build_frontend.ts` |
| **`cpp-build-and-test`** | `ubuntu-latest` | None (parallel) | C++20 compilation under GCC, 5 test suites, AddressSanitizer | `g++ -std=c++20 -O2 ... && ./test_ob` |
| **`secret-scan`** | `ubuntu-latest` | None (parallel) | Detects exposed private keys, credentials, or tokens | `trufflehog` + pattern search |
| **`npm-audit`** | `ubuntu-latest` | `dependency-install` | Known CVE vulnerability analysis on dependencies | `npm audit` |

---

## 3. Local Execution Commands

Developers can run every CI step locally with the exact commands executed in the pipeline:

```bash
# 1. Type Checking
npx tsc --noEmit

# 2. Database Schema & Rollback Validation
npx tsx scripts/verify_disposable_db.ts

# 3. Backend Integration Suite (9/9)
npx tsx tests/api.test.ts

# 4. Frontend Bundle Build
npx tsx scripts/build_frontend.ts

# 5. C++ Matching Engine Build & Test (WSL or Linux)
g++ -std=c++20 -O2 -pthread -Iengine/include engine/src/order_book.cpp engine/tests/test_order_book.cpp -o test_ob && ./test_ob

# 6. Dependency Security Audit
npm audit
```

---

## 4. Quality Gate Policy

All mandatory checks must exit with return code `0`. Any failure in type checking, database schema migration, backend integration tests, or C++ test suites halts the pipeline immediately and prevents merging.
