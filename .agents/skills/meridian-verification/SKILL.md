---
name: meridian-verification
description: Protocols and testing procedures for verifying MERIDIAN across C++ memory sanitizers, backend API tests, database BCNF constraints, TruffleHog secret scans, and CI gates.
---

# MERIDIAN Verification Skill

This skill provides step-by-step procedures for verifying the correctness, performance, security, and academic compliance of **MERIDIAN**. Use this during Stage 3 and throughout continuous development.

---

## 1. Quick Verification Checklist

Before certifying any build or submitting for academic review, run the following verification sequence:

| Step | Command | Target / Pass Condition |
| :--- | :--- | :--- |
| **1. TypeScript Type Check** | `npm run type-check` | 0 errors |
| **2. ESLint Quality** | `npm run lint` | 0 warnings (`--max-warnings 0`) |
| **3. Backend API Tests** | `npm test` | 9 passed, 0 failed |
| **4. C++ Order Book Tests** | `./test_ob` | All C++ tests passed |
| **5. C++ Memory Sanitizers** | `./test_ob_asan` | 0 leaks, 0 undefined behavior |
| **6. 17 Demo Queries** | `npm run demo:queries` | All 17 queries execute successfully |
| **7. Secret Scan** | `trufflehog git file://. --only-verified` | 0 verified secrets found |
| **8. Vulnerability Audit** | `npm audit --audit-level=high` | 0 high/critical vulnerabilities |

---

## 2. Verification Protocols

### Protocol 1: Backend API Test Suite
- **Command:** `npx tsx tests/api.test.ts`
- **What it verifies:**
  1. User Registration & Automatic Account Provisioning
  2. User Login & JWT Session Management
  3. Pre-Trade Risk Limits (Maximum order quantity check)
  4. Pre-Trade Price Collar Enforcement (Rejection on >5% deviation)
  5. Order Matching & Side-Specific Fill Generation (1 BUY & 1 SELL)
  6. Database Trigger Settlement (`trg_fills_settlement` position & balance update)
  7. Order Placement & Order Cancellation
  8. Surveillance Evaluation & Cosine Vector Pattern Matching
  9. Alert Investigation Workflow & Full-Text Search (`tsvector` / `tsquery`)

### Protocol 2: C++ Systems & Memory Safety Verification
- **Compilation (Linux / WSL / MSYS2):**
  ```bash
  # Standard optimized build
  g++ -std=c++20 -O2 -Wall -Wextra -pthread \
    -Iengine/include engine/src/order_book.cpp engine/tests/test_order_book.cpp -o test_ob
  ./test_ob

  # Sanitizer build (AddressSanitizer & UndefinedBehaviorSanitizer)
  g++ -std=c++20 -O1 -fsanitize=address,undefined -fno-omit-frame-pointer -pthread \
    -Iengine/include engine/src/order_book.cpp engine/tests/test_order_book.cpp -o test_ob_asan
  ./test_ob_asan
  ```
- **Pass Criteria:**
  - `test_ob` outputs `ALL TESTS PASSED`.
  - `test_ob_asan` exits with return code 0 and reports no heap use-after-free, buffer overflows, or undefined behavior.

### Protocol 3: C++ Standalone Engine & IPC Bridge Verification
- **Compilation of standalone engine:**
  ```bash
  g++ -std=c++20 -O2 -Wall -Wextra -pthread \
    -Iengine/include engine/src/order_book.cpp engine/src/main.cpp -o engine/meridian_engine
  ```
- **Smoke test line protocol:**
  ```bash
  echo -e "SNAPSHOT 1\nQUIT" | ./engine/meridian_engine
  ```
  Expected output: `SNAPSHOT 1 BIDS:0 ASKS:0`.
- **Bridge integration test:**
  ```bash
  npx tsx tests/cpp_bridge.test.ts
  ```
  Expected output:
  - Passive sell limit order placed (`status: OPEN`).
  - Aggressive buy order crosses spread and matches at passive price.
  - Residual order cancelled.
  - `ALL C++ ENGINE BRIDGE TESTS PASSED`.

### Protocol 4: Database & Academic Demonstration Query Verification
- **Command:** `npm run demo:queries`
- **What it verifies:**
  - Executes all 17 official PES University Level 3 queries against the active database.
  - Asserts that multi-table joins, analytical aggregations, vector similarity scores, tsvector text searches, and the cross-table audit query (Q17) return correct data.

### Protocol 5: Security & Secret Scanning Protocol
- **CI / Local Command:**
  ```bash
  # Pinned TruffleHog full-history scan
  trufflehog git file://. --only-verified

  # Secondary hardcoded pattern grep
  node scripts/security_audit.ts
  ```
- **Pass Criteria:** Zero verified API keys, private keys, passwords, or JWT secrets in tracked files or Git commit history.
