---
name: meridian-implementation
description: Operational protocols and engineering rules for implementing changes in MERIDIAN, covering C++ matching engine updates, backend dual-mode IPC integration, and database hardening.
---

# MERIDIAN Implementation Skill

This skill guides engineers and automated agents in safely implementing code changes in **MERIDIAN** during Stage 2 and future maintenance cycles.

---

## 1. Core Operating Principles

1. **Client-Supplied Idempotency:** Every order submission MUST accept a client-supplied `clientOrderId`. Never generate internal random UUIDs that defeat network retries. Scoped to `(account_id, client_order_id)`. Legitimate retries return original order and executions; mismatched payloads return `409 Conflict`.
2. **Single-Authority Execution (DATABASE Mode in Stage 2):** In Stage 2, PostgreSQL is the sole authoritative matching engine. Automatic cross-engine fallback is strictly prohibited. Authoritative C++ matching and shadow comparison are deferred until durable outbox sequencing and reconciliation harnesses are implemented.
3. **Test-First Defect Remediation:** Always reproduce an issue with a failing test case in `engine/tests/` or `tests/` before applying code edits.
4. **Preserve Financial Invariants:** Double-entry bookkeeping must never be violated. Every trade requires 2 side-specific fills (`BUY` and `SELL`). Debits must equal credits.
5. **Zero Lint & Type Tolerances:** Run `npx tsc --noEmit` and `npm run lint` (`--max-warnings 0`) after every TypeScript change.

---

## 2. Protocol: C++ Matching Engine Updates

### Working with `engine/`
- **Compiler flags:** All builds must compile with C++20:
  ```bash
  g++ -std=c++20 -O2 -Wall -Wextra -Wpedantic -pthread -Iengine/include engine/src/order_book.cpp <test_or_main> -o <binary>
  ```
- **Memory Sanitizers:** Always run memory checks when modifying order book logic:
  ```bash
  g++ -std=c++20 -O1 -fsanitize=address,undefined -fno-omit-frame-pointer -pthread \
    -Iengine/include engine/src/order_book.cpp engine/tests/test_order_book.cpp -o test_ob_asan
  ./test_ob_asan
  ```
- **Building the Standalone Interactive Binary:**
  ```bash
  g++ -std=c++20 -O2 -Wall -Wextra -pthread \
    -Iengine/include engine/src/order_book.cpp engine/src/main.cpp -o engine/meridian_engine
  ```

### Rules for C++ Matching Logic:
1. **Never use floating point numbers** for prices inside matching loops. All prices must remain 64-bit integer ticks (`Price`) scaled by `kPriceScale` (10,000).
2. **IOC Order Lifecycle:**
   - In `OrderBook::process_order()`, when an IOC order finishes matching against resting liquidity:
   - If `order.leaves_qty() > 0`:
     - Do NOT add remaining quantity to `bids_` or `asks_`.
     - If `order.filled_qty == 0`, set `order.status = OrderStatus::CANCELLED`.
     - If `order.filled_qty > 0`, set `order.status = OrderStatus::PARTIALLY_FILLED` (remainder cancelled).
3. **Gap Detector Optimization:**
   - Replace unbounded `std::unordered_set<uint64_t> seen_` with a bounded sliding window sequence history (e.g., ring buffer or bitset) to eliminate continuous heap allocations.

---

## 3. Protocol: Backend Integration & Correlated IPC Bridge

### Stage 2 Boundaries & Execution Rules
1. **DATABASE Mode as Sole Authoritative Engine:**
   - In Stage 2, `DATABASE` mode is the only production matching mode. Orders are matched atomically within PostgreSQL using `SELECT ... FOR UPDATE` row locks.
   - Automatic fallback between matching engines is **strictly prohibited**.
2. **Client-Supplied Idempotency Contract:**
   - `orderRoutes.ts` parses `clientOrderId` (UUID string) from the client request.
   - If `client_order_id` exists for that `account_id`:
     - If payload matches: return original order and executed trades (`200 OK`).
     - If payload differs: reject with `409 Conflict`.
3. **Correlated IPC Bridge Protocol:**
   - Replace naive FIFO shift (`requestQueue[0]`) in `cppEngineBridge.ts` with explicit correlation mapping:
     - Map in-flight promises by `order_id` (`Map<number, PendingPromise>`).
     - C++ engine echoes `order_id` in `ACK <order_id> ...` and `CANCELLED <order_id>`.
     - Eliminates head-of-line response desynchronization across stdio pipes.
4. **Cross-Platform Engine Spawning:**
   - Check for native binaries:
     - If Windows: check for `engine/meridian_engine.exe` first; spawn directly if found without invoking WSL.
     - If only Linux binary exists, invoke WSL: `wsl -e bash -c "cd <wslPath> && ./engine/meridian_engine"`.
     - If neither is available, mark bridge as unavailable for tests.
   - In `tests/cpp_bridge.test.ts`, ensure `bridge.shutdown()` is invoked in a `finally` block to prevent lingering child processes.

---

## 4. Protocol: Database & Schema Safety

1. Never alter the 17 core entity primary keys or foreign key constraint names without updating documentation.
2. Never remove `trg_audit_log_immutable` or allow direct mutations to `audit_log`.
3. When adding demo queries or migrations, test against both PGlite and native PostgreSQL 16.
