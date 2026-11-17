# MERIDIAN

> **High-Performance Order Matching Engine with Multi-Paradigm Persistence and Real-Time Market Surveillance**

**Academic Institution:** PES University, Department of Computer Science and Engineering  
**Course:** DBMS Experiential Learning — Level 3  
**Course Instructor:** Dr. Nagasundari S  
**Student & Author:** Prasanna Marihalkar (USN: PES1UG24CS684)  
**System Architecture:** C++20 Low-Latency Systems Core + 17-Entity PostgreSQL Relational Ledger + Vector Surveillance + Next.js/React Full-Stack Interface  

---

## 1. Project Overview & Problem Statement

Modern financial exchanges match orders in microseconds while simultaneously generating enormous volumes of structured, semi-structured, and pattern-based telemetry. Unlike conventional CRUD applications, MERIDIAN's core technical challenge is maintaining **strict transactional correctness and consistency under high-frequency, concurrent state transitions**, while streaming real-time market data and monitoring order-flow for market abuse (spoofing, layering, and quote stuffing).

MERIDIAN addresses this challenge through a multi-tier, multi-paradigm architecture:
1. **C++20 Matching Engine:** Price-time priority limit order book with a cacheline-aligned lock-free Single-Producer Single-Consumer (SPSC) ring buffer, achieving over **4.14 million orders/second with a 153-nanosecond median latency**.
2. **PostgreSQL Relational Core:** 17 normalized entities (BCNF) guaranteeing atomic trade settlement, side-specific fills (`UNIQUE (trade_id, side)`), automated position recalculation triggers, and an immutable audit log.
3. **Behavioral Surveillance Engine:** Hand-engineered 8-dimensional feature vectors (`order_cancel_ratio`, `quote_to_trade_ratio`, `median_lifetime_ms`, `size_skew`, etc.) classified against known manipulative patterns using **vector cosine similarity**.
4. **Institutional Trading & Compliance Web Portal:** Dark-mode, high-density React/TypeScript interface with live Level 2 order books, trade blotters, alert triage, and an interactive College Showcase running all 17 demonstration queries live.

---

## 2. High-Level System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WEB PRESENTATION TIER                           │
│  React 18 / TypeScript / Tailwind CSS / Lucide / WebSockets            │
│  - Trader Terminal: Live L2 Order Book Ladder, Ticket, Blotter, P&L    │
│  - Compliance Console: 8-D Feature Radar, Alert Triage, Notes Search   │
│  - College Showcase: Chen ERD Viewer & 17 Live SQL Query Runners       │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │ HTTP REST (JSON) + WebSocket (Live Stream)
┌─────────────────────────────────▼──────────────────────────────────────┐
│                        APPLICATION & API GATEWAY                       │
│  Node.js / Express / TypeScript                                        │
│  - JWT & Bcrypt Authentication with RBAC (Trader / Analyst / Admin)    │
│  - Pre-Trade Risk Filter (5% Price Collar, Max Qty, Cash Sufficiency)   │
│  - 8-Dimensional Behavioral Feature Extractor & Cosine Classifier      │
│  - Real-Time WebSocket Publisher                                       │
└──────────────────┬──────────────────────────────┬──────────────────────┘
                   │ SQL Transactions / Queries    │ IPC / POSIX / TCP Sockets
┌──────────────────▼──────────────────┐  ┌────────▼──────────────────────┐
│       DATABASE PERSISTENCE TIER      │  │        C++ SYSTEMS TIER       │
│  PostgreSQL 16+ (17 Entities)        │  │  - Price-Time Limit Order Book│
│  - Strict ACID guarantees            │  │  - Lock-Free SPSC Ring Buffer │
│  - Settlement Triggers & Positions   │  │  - Deterministic Trade Match  │
│  - Stored Procedures (P&L & Cosine)  │  │  - UDP Multicast Publisher    │
│  - GIN Index on tsvector (Notes)     │  │  - ITCH/MoldUDP Gap Detection │
│  - Immutable Audit Log Ledger        │  │  - C++20 / RAII / CMake       │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

---

## 3. Seven Advanced Database Concepts Demonstrated

1. **ACID Transactions:** Atomic multi-table updates across `orders`, `trades`, `fills`, and `positions`.
2. **Advanced Relational Views:** `v_top_of_book` (live BBO & spreads), `v_portfolio_summary` (mark-to-market valuations and unrealized P&L), `v_trade_blotter`, `v_surveillance_summary`.
3. **Stored Procedures & Functions:** Weighted average cost realized P&L calculator (`fn_calculate_realized_pnl`) and vector cosine similarity (`fn_cosine_similarity`).
4. **Automated Triggers:** Real-time position updates on fill insertion (`trg_fills_settlement`), automatic order state audit logging (`trg_orders_audit`), and full-text search indexing (`trg_alert_notes_tsv`).
5. **Multi-Column & Specialized Indexing:** Composite unique constraints (`UNIQUE (trade_id, side)`, `UNIQUE (account_id, instrument_id, window_start)`), and GIN inverted index on `alert_notes.body_tsv`.
6. **Vector Similarity Search:** Metric-space cosine similarity matching 8-D session vectors against known abuse signatures.
7. **Domain Constraints & BCNF Normalization:** 100% of relations satisfy Boyce-Codd Normal Form with zero insertion, update, or deletion anomalies.

---

## 4. Quickstart & Local Setup

### Prerequisites
- Node.js 18+ (tested on Node v20/v26)
- Optional: C++ compiler supporting C++20 (GCC 13+ or Clang) for compiling the C++ matching engine benchmarks

### Single-Command Start:
```bash
# 1. Install dependencies
npm install

# 2. Initialize and seed database (embedded zero-config PostgreSQL engine included)
npm run db:init

# 3. Build frontend bundle
npm run build:frontend

# 4. Start full-stack platform
npm start
```
Open your browser to: **`http://localhost:4000`**

### Pre-Configured Demo Credentials:
- **Trader:** `prasanna_trader` / `Password123!`
- **Analyst:** `asha_analyst` / `Password123!`
- **Admin:** `sys_admin` / `Password123!`

---

## 5. Automated Verification & Testing

MERIDIAN includes test suites across all layers:

```bash
# 1. Run Backend Integration Test Suite (9 critical workflows)
npm test

# 2. Run all 17 Official College Demonstration Queries
npm run demo:queries

# 3. Build & Run C++ Systems Test Harness (WSL / Linux)
cd engine && g++ -std=c++20 -O3 -pthread src/order_book.cpp tests/test_order_book.cpp -o test_order_book && ./test_order_book

# 4. Run C++ Nanosecond Benchmark (100,000 orders)
cd engine && g++ -std=c++20 -O3 -Wno-interference-size -pthread src/order_book.cpp benchmarks/benchmark_engine.cpp -o benchmark_engine && ./benchmark_engine
```

### Verified Benchmark Results:
- **Throughput:** **4,147,530 orders/second**
- **Median Latency (p50):** **153 nanoseconds**
- **99th Percentile Latency (p99):** **447 nanoseconds**

---

## 6. Official Documentation & Technical Audits Index

All architectural, college submission, and release audit materials are thoroughly documented:

### Phase 10 Release & Engineering Reports:
- [RELEASE_NOTES.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/RELEASE_NOTES.md): v1.0.0 official production release notes.
- [FINAL_RELEASE_AUDIT.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/FINAL_RELEASE_AUDIT.md): Independent verification matrix and acceptance gates.
- [FEATURE_TRACEABILITY.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/FEATURE_TRACEABILITY.md): 20/20 college requirement traceability matrix.
- [PERFORMANCE_REPORT.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/PERFORMANCE_REPORT.md): Reproducible C++ and REST API latency benchmarks.
- [OPERATIONS_RUNBOOK.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/OPERATIONS_RUNBOOK.md): Day-to-day operations and disaster recovery runbook.
- [PRODUCTION_DEPLOYMENT.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/PRODUCTION_DEPLOYMENT.md): Cloud hosting comparison (Railway, Render, Fly.io).
- [CI_CD.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/CI_CD.md): GitHub Actions continuous integration pipeline guide.
- [KNOWN_LIMITATIONS.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/KNOWN_LIMITATIONS.md): Transparent engineering trade-offs and disclosures.
- [DATABASE_PRODUCTION_REVIEW.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/DATABASE_PRODUCTION_REVIEW.md): Database constraint, trigger, and index audit.
- [FRONTEND_RELEASE_REVIEW.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/FRONTEND_RELEASE_REVIEW.md): Multi-device responsive review and accessibility audit.
- [SECURITY_RELEASE_REVIEW.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/SECURITY_RELEASE_REVIEW.md): Comprehensive security posture and risk assessment.
- [CPP_ENGINE_REVIEW.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/CPP_ENGINE_REVIEW.md): Systems-level review of memory, concurrency, and order books.

### Academic Architecture & DBMS Specifications:
- [ER_DIAGRAM.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/ER_DIAGRAM.md): Peter Chen notation specification across 7 pages.
- [RELATIONAL_SCHEMA.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/RELATIONAL_SCHEMA.md): Formal relational schema and BCNF normalization proofs.
- [DATA_DICTIONARY.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/DATA_DICTIONARY.md): Column-level dictionary for all 17 tables.
- [ARCHITECTURE.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/ARCHITECTURE.md): Subsystems, matching engine, and persistence details.
- [VIVA_PREPARATION.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/VIVA_PREPARATION.md): In-depth technical viva Q&A guide.
- [DEMO_GUIDE.md](file:///C:/Users/prasa/.gemini/antigravity/scratch/meridian/docs/DEMO_GUIDE.md): 5-minute live college viva presentation script.

---

## 7. License & Academic Attribution
Developed for the Department of Computer Science and Engineering, PES University, Bengaluru.  
Course: DBMS Experiential Learning (Level 3).  
Licensed under the MIT License.
