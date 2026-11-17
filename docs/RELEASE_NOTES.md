# MERIDIAN v1.0.0 Release Notes

**Release Version:** v1.0.0  
**Release Date:** November 17, 2026  
**Author:** Prasanna Marihalkar (`PES1UG24CS684`)  
**Department:** Computer Science & Engineering, PES University  
**Supervisor / Course Instructor:** Dr. Nagasundari S  

---

## Overview

MERIDIAN v1.0.0 marks the initial production-ready release of the high-performance trading, risk management, and market surveillance core platform. Designed to satisfy all Level 3 DBMS Experiential Learning requirements while functioning as a portfolio-grade financial technology system, MERIDIAN combines low-latency C++20 systems architecture with strict relational persistence (PostgreSQL 16 BCNF) and real-time market surveillance.

---

## Key Features & Deliverables

### 1. High-Performance C++20 Order Matching Core
- Continuous double auction matching with strict price-time priority.
- Limit order book implemented with intrusive doubly-linked lists and red-black tree index.
- Lock-free Single-Producer Single-Consumer (SPSC) ring buffer with cacheline alignment.
- Monotonic UDP sequence gap detection and packet loss reordering window.
- Benchmarked throughput: **~3.9M orders/sec** with **152 ns median latency**.
- Passed AddressSanitizer, UndefinedBehaviorSanitizer (0 leaks), and ThreadSanitizer (0 data races).

### 2. Dual-Mode Architecture & C++ Engine IPC Bridge
- Node.js / TypeScript backend with bidirectional stdio line-protocol bridge (`cppEngineBridge.ts`) to the C++ core.
- Automatic fallback to transaction-safe PostgreSQL continuous auction engine when C++ binary is not active.

### 3. PostgreSQL Relational Subsystem (17 Entities, BCNF)
- Complete relational schema across 4 domains (Identity, Trading, Surveillance, System).
- 4 advanced views for order book depth, portfolio holdings, market activity, and compliance.
- Database triggers for real-time fill settlement, cash balance debits/credits, and position updates.
- Engine-enforced audit log immutability preventing updates or deletions.
- Full-text search on investigator notes using PostgreSQL `tsvector` and GIN index.
- 17/17 official college demonstration SQL queries verified with non-zero output.

### 4. Market Abuse Surveillance Engine
- 8-dimensional feature vector extraction from order flow (cancel ratio, quote-to-trade, lifetime, size skew, message rate, book imbalance, opposite-fill ratio, layering depth).
- Vector cosine similarity matching against seeded market manipulation signatures (spoofing, layering).
- Full compliance case management with severity ratings, status workflow, and analyst notes.

### 5. Institutional Bloomberg-Grade Frontend
- React 18 / TypeScript terminal with dark-theme Refinitiv styling.
- Real-time Level 2 order book ladder with live depth percentages.
- Pre-trade risk collar safeguard (5% limit deviation rejection).
- Order blotter, trade blotter, portfolio position holdings, and watchlist.
- Dedicated PES University College Showcase tab with live query runner and Chen ER diagrams.
- Responsive design tested across 360px mobile, tablet, laptop, and desktop.

### 6. Security & Operations
- `npm audit`: 0 vulnerabilities.
- 100% parameterized SQL query coverage across all routes.
- In-memory sliding-window rate limiter on auth and API endpoints.
- Multi-stage Docker containerization and GitHub Actions CI pipeline.
