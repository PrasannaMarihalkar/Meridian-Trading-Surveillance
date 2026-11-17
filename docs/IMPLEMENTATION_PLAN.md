# MERIDIAN — MASTER IMPLEMENTATION PLAN

**Project:** MERIDIAN (High-Performance Trading System & Surveillance Platform)  
**Author:** Technical Lead & Principal Systems Architect  
**Version:** 1.0.0  
**Target:** Production-Grade Engineering, College Submission, Technical Portfolio & Deployment  

---

## 1. System Architecture Overview

MERIDIAN is engineered as an end-to-end electronic trading and surveillance ecosystem built across three cooperating tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WEB PRESENTATION TIER                           │
│  Next.js 14+ / React 18 / TypeScript / Tailwind CSS / Lucide / Recharts │
│  Trader Portal: Live Order Book, Trading Blotter, Position/P&L, Risk   │
│  Compliance Portal: Surveillance Console, Pattern Radar, Alert Triage  │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │ HTTP REST (JSON) + WebSocket (Live Feeds)
┌─────────────────────────────────▼──────────────────────────────────────┐
│                        APPLICATION & API GATEWAY                       │
│  Node.js / Express / TypeScript Engine Gateway & Persistence Layer     │
│  - JWT & Argon2id/Bcrypt Authentication & RBAC (Trader / Analyst / Admin)│
│  - Pre-trade Risk Limit Validation & Order Sanitization                │
│  - Surveillance Feature Aggregation (8-D Vector) & Cosine Matching    │
│  - Real-Time WebSocket Broadcaster                                     │
└──────────────────┬──────────────────────────────┬──────────────────────┘
                   │ SQL Transactions / Queries    │ IPC / POSIX / TCP Sockets
┌──────────────────▼──────────────────┐  ┌────────▼──────────────────────┐
│       DATABASE PERSISTENCE TIER      │  │        C++ SYSTEMS TIER       │
│  PostgreSQL (17 Entities)            │  │  - Price-Time Limit Order Book│
│  - Strict ACID guarantees            │  │  - Lock-Free SPSC Ring Buffer │
│  - Pre-Trade & Settlement Triggers   │  │  - Deterministic Trade Match  │
│  - Stored Procedures for P&L         │  │  - UDP Multicast Publisher    │
│  - pgvector Cosine Pattern Search   │  │  - ITCH/MoldUDP Gap Detection │
│  - Audit Log & TSVECTOR Full-Text    │  │  - C++20 / RAII / CMake       │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

---

## 2. Implementation Phases & Milestones

### Phase 0: Repository Audit & Baseline Setup (Completed)
- [x] Inspect existing assets, Downloads files, college documents, and reference repos.
- [x] Establish the project repository at `scratch/meridian` with Git tracking.
- [x] Produce `docs/PROJECT_AUDIT.md`.
- [x] Establish `docs/BUILD_LOG.md` to record all decisions and verification steps.

### Phase 1: Requirements Analysis & College Documentation
- [x] Map PES University DBMS Experiential Learning requirements (Chen notation, 17 tables, 4 advanced concepts, 17 demo queries).
- [ ] Create `docs/ARCHITECTURE.md` with complete subsystem topologies.
- [ ] Create `docs/ER_DIAGRAM.md` linking Chen ER PDFs and describing entities.
- [ ] Create `docs/RELATIONAL_SCHEMA.md` and `docs/DATA_DICTIONARY.md`.

### Phase 2: Database Layer & Relational Integrity
- [x] Preserve and organize `database/sql/01_meridian_schema_and_demo.sql`.
- [ ] Build a modular database migration and seed pipeline:
  - `01_schema.sql` (17 tables, domain types, constraints, indexes).
  - `02_views_triggers.sql` (triggers for audit logging, position updates, P&L calculations).
  - `03_seed_data.sql` (realistic market instruments, users, trades, surveillance alerts).
  - `04_demo_queries.sql` (17 college submission queries).
- [ ] Implement an embedded database harness (`database/db.ts`) with dual PostgreSQL driver support (native connection string or embedded pure PostgreSQL engine) to guarantee 100% test reproducibility anywhere without external setup hurdles.

### Phase 3: High-Performance C++ Matching Engine & Gateway
- [ ] Implement modern C++20 Limit Order Book:
  - Double-ended price levels (bids descending, asks ascending) with FIFO time priority queues at each price tick.
  - Support for `LIMIT`, `MARKET`, and `IOC` (Immediate-or-Cancel) orders.
  - Zero heap allocation on order insertion/cancellation paths.
- [ ] Integrate the lock-free Single-Producer Single-Consumer (SPSC) ring buffer from `cpp-lockfree-queue` for order intake.
- [ ] Implement UDP multicast market data feed with sequence numbers and gap detection from `udp-gap-detector`.
- [ ] Provide CMake build configuration and automated C++ unit tests.

### Phase 4: Application Backend & API Service
- [ ] Implement robust layered TypeScript/Node.js API:
  - **Auth & RBAC:** Argon2/Bcrypt password hashing, JWT sessions, role middleware (`TRADER`, `ANALYST`, `ADMIN`).
  - **Account & Risk:** Balances, open order tracking, position limits, price collars.
  - **Order & Trading:** Pre-trade checks, order placement, trade matching, fill generation, position updates.
  - **Surveillance Engine:** 8-feature metric computation (`order_cancel_ratio`, `quote_to_trade_ratio`, `median_lifetime_ms`, `size_skew`, `msg_rate_per_s`, `book_imbalance_impact`, `opposite_side_fill_ratio`, `layering_depth`) and vector cosine similarity pattern classification.
  - **Alert Triage & Notes:** Full-text searchable investigation notes (`tsvector`), analyst assignment, resolution lifecycle.
  - **Audit Logging:** System-wide transactional audit log.
  - **Real-time WebSockets:** Live order book and trade stream.

### Phase 5: Polished Financial Frontend
- [ ] Build responsive, dark-mode financial UI (Next.js / React / Tailwind CSS):
  - **Navigation & Brand:** Clean, restrained institutional layout (no gimmicks, clear typography, financial data density).
  - **Trader Dashboard:** Live order book ladder, interactive depth chart, order entry ticket, trade blotter, portfolio position holdings, watchlist selector.
  - **Surveillance & Compliance Console:** Flagged sessions radar, 8-dimensional feature radar, similarity metric meters, alert management table, analyst note writing with full-text search.
  - **Admin & Audit Log:** System offset monitor, audit log explorer, user/account administration.
  - **Interactive College Showcase:** Built-in ER diagram viewer (Chen notation), live SQL query runner for all 17 queries, and data dictionary explorer.

### Phase 6: End-to-End Integration & Quality Assurance
- [ ] Unit tests for database constraints, triggers, and stored procedures.
- [ ] Unit tests for C++ matching engine and SPSC queue.
- [ ] Integration tests for backend API routes and authentication.
- [ ] End-to-end workflow verification (registration -> order -> match -> fill -> position update -> surveillance feature extraction -> alert generation -> analyst note).
- [ ] Generate comprehensive `docs/TEST_REPORT.md`.

### Phase 7: Deployment & College Submission Readiness
- [ ] Docker Compose setup for local containerized deployment.
- [ ] Web deployment configuration (e.g. Render / Railway / Vercel ready).
- [ ] Produce `README.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/USER_GUIDE.md`, `docs/DEMO_GUIDE.md`, and `docs/VIVA_PREPARATION.md`.

---

## 3. Risk Assessment & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Target machine may lack running PostgreSQL daemon | Tests and demo could fail without DB setup | Provide dual database adapter: native PostgreSQL connection pool, plus embedded zero-config PostgreSQL engine (`@electric-sql/pglite`) that runs in Node.js with 100% PostgreSQL SQL/trigger compatibility. |
| Cross-compilation differences between Windows and Linux | C++ build issues on Windows | Use standard C++20 with CMake; provide both native Windows compilation and WSL Ubuntu compilation scripts with verified GCC 13.3.0. |
| Inconsistent database seed data between runs | Demo could show conflicting figures | Deterministic SQL seeds with fixed UUIDs, timestamps, and realistic market prices matching `MERIDIAN_Dummy_DB.sql`. |
| College viva questioning on Chen notation vs Relational schema | Viva deduction | Clear visual and tabular mapping between Chen entities/diamonds and physical SQL tables with exact cardinality proofs. |
