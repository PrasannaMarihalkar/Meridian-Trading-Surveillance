# MERIDIAN — COMPREHENSIVE TEST REPORT & VERIFICATION MATRIX

**Date of Execution:** November 17, 2026  
**Institution:** PES University, Department of Computer Science and Engineering  
**Project:** MERIDIAN: High-Performance Order Matching Engine and Market Surveillance  
**Student:** Prasanna Marihalkar (USN: PES1UG24CS684)  
**Overall Status:** **100% PASSED (ALL VERIFICATION GATES SATISFIED)**  

---

## 1. Executive Summary

| Verification Category | Total Tests | Passed | Failed | Status | Evidence / Script |
|---|:---:|:---:|:---:|:---:|---|
| **Database Schema & 17 Entities** | 17 | 17 | 0 | **PASSED** | `scripts/init_db.ts` |
| **Official College SQL Queries** | 17 | 17 | 0 | **PASSED** | `scripts/run_demo_queries.ts` |
| **C++ Systems & Matching Engine** | 5 | 5 | 0 | **PASSED** | `engine/tests/test_order_book.cpp` |
| **C++ Latency & Throughput Benchmark** | 100,000 orders | 100,000 | 0 | **PASSED** | `engine/benchmarks/benchmark_engine.cpp` |
| **Backend End-to-End Workflows** | 9 | 9 | 0 | **PASSED** | `tests/api.test.ts` |
| **Frontend Production Build** | 1 Bundle | 1 | 0 | **PASSED** | `scripts/build_frontend.ts` |
| **REST Health & Smoke Tests** | 5 Endpoints | 5 | 0 | **PASSED** | Automated curl / Invoke-RestMethod |

---

## 2. Database Verification Details

Executed via `scripts/init_db.ts` on PostgreSQL engine:

```
[VERIFICATION] Verifying row counts across all 17 entities:

┌─────────┬──────────────────────────────┬───────┐
│ (index) │ entity                       │ count │
├─────────┼──────────────────────────────┼───────┤
│ 0       │ 'accounts'                   │ 3     │
│ 1       │ 'alert_notes'                │ 1     │
│ 2       │ 'alerts'                     │ 2     │
│ 3       │ 'audit_log'                  │ 4     │
│ 4       │ 'engine_offsets'             │ 3     │
│ 5       │ 'fills'                      │ 4     │
│ 6       │ 'instruments'                │ 5     │
│ 7       │ 'orders'                     │ 7     │
│ 8       │ 'positions'                  │ 4     │
│ 9       │ 'risk_limits'                │ 3     │
│ 10      │ 'sessions'                   │ 3     │
│ 11      │ 'surveillance_feature_stats' │ 8     │
│ 12      │ 'surveillance_patterns'      │ 4     │
│ 13      │ 'surveillance_sessions'      │ 3     │
│ 14      │ 'trades'                     │ 2     │
│ 15      │ 'users'                      │ 5     │
│ 16      │ 'watchlists'                 │ 5     │
└─────────┴──────────────────────────────┴───────┘
```
**Outcome:** All 17 tables created with correct foreign keys, check constraints, and populated with realistic data.

---

## 3. Official College Demonstration Queries (Q1 — Q17)

Executed via `scripts/run_demo_queries.ts`:

- **Q1. All registered users with roles & status:** Returned 5 rows (`prasanna_trader`, `asha_analyst`, `sys_admin`, `rahul_marketmaker`, `vikram_algo`).
- **Q2. Active instruments & price boundaries:** Returned 5 rows (RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK).
- **Q3. Orders with account owner & fill ratio:** Returned 7 orders showing calculated fill percentages.
- **Q4. Executed trades with buyer and seller details:** Returned 2 trades with notional calculations.
- **Q5. Side-specific fills (buyer & seller legs):** Returned 4 fills verifying `UNIQUE(trade_id, side)` and opposite cash deltas.
- **Q6. Current account positions & unrealized P&L:** Returned 4 positions with average costs and mark-to-market calculations.
- **Q7. User watchlists:** Returned 5 bookmarked instruments.
- **Q8. Aggregate order distribution by status:** Grouped by FILLED, OPEN, PARTIALLY_FILLED, CANCELLED.
- **Q9. Surveillance sessions with 8-D metrics:** Returned sessions showing order-cancel ratios up to 93.3%.
- **Q10. Compliance alerts & pattern similarity:** Matched Rapid Spoofing (97.8% similarity) and Layering (94.2%).
- **Q11. Investigation notes & analyst comments:** Returned full commentary.
- **Q12. Risk limits & open order utilization:** Grouped risk limits by account.
- **Q13. Correlated order volume and execution rate:** Analyzed trading efficiency per user.
- **Q14. High cancellation filter (> 0.50):** Flagged abusive accounts.
- **Q15. Full-text search on analyst notes:** English stemming query `cancelled orders` matched note #8101.
- **Q16. Audit log chronology with JSON state deltas:** Tracked state transitions from initial order placement to alert assignment.
- **Q17. College table verification count:** All 17 entities confirmed populated.

**Outcome:** 17 out of 17 college demonstration queries succeeded without error.

---

## 4. C++ Systems & Matching Engine Verification

Executed via `engine/tests/test_order_book.cpp` (compiled with GCC 13.3.0, C++20):

- `test_limit_order_matching`: Passed. Verified crossing orders produce trade executions and update book depth.
- `test_price_time_priority`: Passed. Verified higher bids match before lower bids, and FIFO orders at same tick match in arrival order.
- `test_ioc_and_cancellation`: Passed. Verified Immediate-Or-Cancel unfulfilled balances are discarded, and cancelled orders are removed from book depth.
- `test_spsc_queue_concurrency`: Passed. Transferred **100,000 items** across producer and consumer threads lock-free without data loss.
- `test_gap_detector`: Passed. Verified sequence gap detection, loss accounting, and out-of-order recovery.

### C++ Benchmark Results (`engine/benchmarks/benchmark_engine.cpp`):
- **Workload:** 100,000 limit orders matched against resting liquidity.
- **Throughput:** **4,147,530 orders/second**.
- **Latency Percentiles:**
  - **p50 (Median):** 153 nanoseconds (0.153 µs)
  - **p90:** 203 nanoseconds (0.203 µs)
  - **p99:** 447 nanoseconds (0.447 µs)
  - **p99.9:** 3,911 nanoseconds (3.911 µs)

---

## 5. Backend End-to-End Integration Test Suite

Executed via `tests/api.test.ts`:

```
=== MERIDIAN END-TO-END INTEGRATION TEST SUITE ===

[TEST] User Registration & Automatic Account Provisioning ... ✓ PASSED
[TEST] User Login & Session Invalidation Check ... ✓ PASSED
[TEST] Pre-Trade Risk Limit Enforcement (Exceeding max_order_qty) ... ✓ PASSED
[TEST] Pre-Trade Price Collar Rejection (Deviating > 5%) ... ✓ PASSED
[TEST] Order Matching & Side-Specific Fill Generation (1 BUY & 1 SELL) ... ✓ PASSED
[TEST] Database Trigger Verification (Position Update on Fill) ... ✓ PASSED
[TEST] Order Placement and Order Cancellation ... ✓ PASSED
[TEST] Surveillance Evaluation & Cosine Vector Pattern Matching ... ✓ PASSED
[TEST] Alert Investigation Workflow & Full-Text Search (tsvector) ... ✓ PASSED

================================================================
TEST SUMMARY: 9 PASSED, 0 FAILED
================================================================
```

---

## 6. Verification Conclusion

Every acceptance criterion defined by the project requirements has been executed and confirmed. The codebase is fully verified, operational, and prepared for college submission and technical demonstration.
