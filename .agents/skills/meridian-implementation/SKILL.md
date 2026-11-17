---
name: meridian-implementation
description: Operational protocols and engineering rules for implementing changes in MERIDIAN, covering C++ matching engine updates, backend dual-mode IPC integration, and database hardening.
---

# MERIDIAN Implementation Skill

This skill guides engineers and automated agents in safely implementing code changes in **MERIDIAN** during Stage 2 and future maintenance cycles.

---

## 1. Core Operating Principles

1. **Test-First Defect Remediation:** Always reproduce an issue with a failing test case in `engine/tests/` or `tests/` before applying code edits.
2. **Preserve Financial Invariants:** Double-entry bookkeeping must never be violated. Every trade requires 2 side-specific fills (`BUY` and `SELL`). Debits must equal credits.
3. **Zero Lint & Type Tolerances:** Run `npx tsc --noEmit` and `npm run lint` (`--max-warnings 0`) after every TypeScript change.

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

## 3. Protocol: Backend Dual-Mode IPC Integration

### Connecting `CppEngineBridge` to `TradingService`
1. **Execution Mode Configuration:**
   - Define execution modes: `CPP`, `DATABASE`, `HYBRID`. Default to `HYBRID`.
2. **Order Submission Flow in `TradingService.submitOrder`:**
   - Always run pre-trade risk validations (`validateRiskLimits`) first.
   - If `CPP` or `HYBRID` mode:
     - Check `CppEngineBridge.getInstance().isAvailable()`.
     - If available:
       - Send order to C++ engine via `bridge.submitOrder(...)`.
       - Receive execution result (`status`, `filledQty`, and array of `trades`).
       - Begin a database transaction (`BEGIN`).
       - Insert the order record with the resulting status and filled quantity.
       - For each trade returned by the engine, insert into `trades` table.
       - Insert the two side-specific fills into `fills` table (`BUY` and `SELL`).
       - Commit transaction (`COMMIT`).
       - Database trigger `trg_fills_settlement` will automatically update cash balances and positions.
     - If engine is offline:
       - Log operational warning: `[WARN] C++ Engine unavailable; executing in DATABASE fallback mode`.
       - Execute standard database matching transaction.

### Cross-Platform Engine Spawning in `cppEngineBridge.ts`:
1. Check for native binaries:
   - If Windows: check for `engine/meridian_engine.exe` first; spawn directly if found.
   - If only Linux binary exists, invoke WSL: `wsl -e bash -c "cd <wslPath> && ./engine/meridian_engine"`.
   - If neither is available, mark bridge as unavailable and proceed in database mode.
2. In `tests/cpp_bridge.test.ts`, ensure `bridge.shutdown()` is invoked in a `finally` block to prevent lingering child processes.

---

## 4. Protocol: Database & Schema Safety

1. Never alter the 17 core entity primary keys or foreign key constraint names without updating documentation.
2. Never remove `trg_audit_log_immutable` or allow direct mutations to `audit_log`.
3. When adding demo queries or migrations, test against both PGlite and native PostgreSQL 16.
