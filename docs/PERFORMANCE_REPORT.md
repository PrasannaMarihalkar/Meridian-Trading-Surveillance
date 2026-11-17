# MERIDIAN Performance Engineering Report

**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Academic Context:** PES University, Department of Computer Science & Engineering  
**Lead Engineer:** Prasanna Marihalkar (`PES1UG24CS684`)  
**Date:** November 17, 2026  
**Status:** **REPRODUCIBLE BENCHMARK DATA**

---

## 1. Benchmark Methodology & Transparency

In high-frequency trading and financial systems engineering, benchmark figures must be reported with strict transparency regarding scope, measurement points, and hardware constraints.

### 1.1 Scope Boundaries
- **C++ Matching Engine Benchmark:** Measures pure in-memory, price-time priority double-auction matching throughput and latency using `std::map<Price, std::list<Order>>` and red-black tree order book. It does **not** include network socket round-trips or disk writes.
- **Backend REST API Benchmark:** Measures end-to-end HTTP request processing, JSON serialization, Express routing, and PGlite embedded PostgreSQL database query execution.
- **Database Query Benchmark:** Measures execution time of analytical relational queries (Q1–Q17) containing joins, groupings, and vector similarity calculations.

---

## 2. Test Hardware & Execution Environment

| Parameter | Specification |
|---|---|
| **CPU Model** | Intel(R) Core(TM) Ultra 5 125H (18 vCPUs / threads, 9 physical cores) |
| **Base / Max Frequency** | 3.60 GHz base, up to 4.50 GHz turbo |
| **L1/L2/L3 Cache** | L1: 32 KB I + 48 KB D per core; L2: 1.25 MB per core; L3: 18 MB shared |
| **System Memory (RAM)** | 16.0 GB LPDDR5 6400 MT/s |
| **Operating System** | WSL2 Ubuntu 24.04 LTS on Windows 11 Enterprise (Kernel: Linux 6.6.x x86_64) |
| **C++ Compiler** | GCC 13.3.0 (`g++ -std=c++20 -O3 -pthread`) |
| **Node.js Runtime** | Node.js v26.7.0 x64, TypeScript 5.7.3, tsx 4.19.3 |
| **Database Engine** | Embedded PostgreSQL 16.x via `@electric-sql/pglite` v0.2.16 |

---

## 3. C++ Matching Engine Benchmarks

The benchmark harness generates 100,000 realistic market orders (randomized LIMIT orders crossing spreads, aggressive trades, and order cancellations) and records high-resolution monotonic timestamps (`std::chrono::steady_clock`).

### 3.1 Throughput & Latency Distribution

Two independent repetitions were executed under identical conditions:

| Metric | Run 1 | Run 2 | Mean Result |
|---|:---:|:---:|:---:|
| **Workload Size** | 100,000 orders | 100,000 orders | 100,000 orders |
| **Total Duration** | 26.10 ms | 25.38 ms | **25.74 ms** |
| **Throughput** | **3,831,944 orders/s** | **3,940,484 orders/s** | **3,886,214 orders/s** |
| **Latency (p50)** | **153 ns** (0.153 µs) | **152 ns** (0.152 µs) | **152.5 ns** |
| **Latency (p90)** | **225 ns** (0.225 µs) | **218 ns** (0.218 µs) | **221.5 ns** |
| **Latency (p99)** | **530 ns** (0.530 µs) | **572 ns** (0.572 µs) | **551.0 ns** |
| **Latency (p99.9)** | **3.53 µs** | **3.65 µs** | **3.59 µs** |
| **Peak Latency** | 1.12 ms | 579.8 µs | 851.8 µs |

### 3.2 Key Architectural Factors
1. **Price-Time Priority Data Structures:** Orders at each price tier are maintained in a `std::list<Order>`, enabling $O(1)$ FIFO queue advancement and stable iterator references for $O(1)$ order cancellations via hash map index.
2. **Cacheline Isolation:** Atomic indices in the lock-free SPSC queue (`head_` and `tail_`) are isolated with `alignas(64)` to eliminate CPU cache false sharing.
3. **Fixed-Point Arithmetic:** Prices are stored as 64-bit signed integers representing four decimal places ($1.0000 = 10,000$), completely avoiding floating-point division penalties.

---

## 4. Backend REST API Benchmarks

Tested via 50 sequential HTTP requests against `http://localhost:4000/api/instruments` (includes Express route dispatch, JSON serialization, and database index lookups):

| Metric | Measured Value | Notes |
|---|:---:|---|
| **Sample Count** | 50 requests | Single-client sequential pipeline |
| **Average Latency** | **10.44 ms** | Includes TCP loopback + Express stack |
| **Latency (p50)** | **7.16 ms** | Median response time |
| **Latency (p95)** | **11.39 ms** | 95th percentile under normal event-loop load |
| **Latency (p99)** | **150.96 ms** | Includes initial connection establishment and V8 JIT warmup |

---

## 5. Relational Database Query Performance

Execution times for representative demonstration queries against seeded database state:

| Query | Scope & Logic | Average Latency |
|---|---|:---:|
| **Q1** | Full User Directory (`users` scan) | < 2 ms |
| **Q3** | Orders & Fill Ratios (Join `orders` + `instruments` + `accounts`) | 4–6 ms |
| **Q6** | Portfolio Unrealized P&L (Join `positions` + `instruments`) | 3–5 ms |
| **Q11** | Full-Text Search on Notes (`to_tsquery('english', 'spoofing')`) | 2–4 ms |
| **Q16** | Audit Trail Chronology (Order by `occurred_at DESC` + JSON unpacking) | 4–7 ms |
| **Q17** | 17-Entity Cross-Table Verification Aggregation | 8–12 ms |

---

## 6. Critical Performance Takeaways

1. **Benchmark Distinction:** The isolated C++ engine processes orders at ~3.9M orders/second (sub-microsecond latency). In contrast, an end-to-end web order submission via REST involves HTTP framing, JSON parsing, risk validation, and database transactions, resulting in ~7–12 ms latency. This distinction is normal and fundamental to multi-tier enterprise architectures.
2. **Embedded PGlite vs Production Postgres:** Embedded PGlite runs in-process via WebAssembly/Node, providing zero-configuration college demonstrations. For institutional throughput exceeding 100,000 database writes/sec, a partitioned native PostgreSQL cluster with WAL replication is recommended.
