# MERIDIAN — COMPREHENSIVE PROJECT AUDIT

**Date:** November 17, 2026  
**Auditor:** Principal Software Engineer & Technical Lead  
**Institution:** PES University, Department of Computer Science and Engineering  
**Course:** DBMS Experiential Learning — Level 3  
**Instructor:** Dr. Nagasundari S  
**Student:** Prasanna Marihalkar (USN: PES1UG24CS684)  

---

## 1. Executive Summary

This audit assesses the state of the **MERIDIAN** project prior to active development. The evaluation was conducted by inspecting existing assets across the local system (`C:\Users\prasa\Downloads`, `D:\Code Source`, WSL Ubuntu environment, GitHub repositories, and college project guidelines).

The project concept is a **production-grade financial exchange simulator** featuring:
- A C++ price-time priority limit order book matching engine with lock-free SPSC inter-thread communication.
- UDP multicast market data dissemination with sequence gap detection and TCP retransmission recovery.
- A multi-paradigm database layer centering on a 17-entity PostgreSQL relational core, document archiving, and vector similarity surveillance.
- An 8-dimensional behavioral surveillance module detecting market abuse (spoofing, layering, quote stuffing).
- A responsive, role-based Next.js / TypeScript trading and compliance portal.

---

## 2. Inventory of Existing Assets

| Asset / Source | Location | Condition | Assessment & Disposition |
|---|---|---|---|
| **College Project Synopsis** | `Downloads/Meridian_Project_Synopsis.docx` | Verified | Formal PES University Level 3 Synopsis outlining scope, paradigms, and team roles. Fully aligned. |
| **SQL Schema & Dummy DB** | `Downloads/MERIDIAN_Dummy_DB.sql` | Operational script (493 lines) | Contains table DDL, sample data, and 17 demonstration queries for the 17-entity schema. |
| **Chen ER Diagram Pack** | `Downloads/MERIDIAN_ER_Diagram_Chen_Notation.pdf` | Verified (7 pages) | Formatted strictly in Chen notation (rectangles, diamonds, ovals, underlined PKs). Primary college submission document. |
| **ERD Complete Pack** | `Downloads/MERIDIAN_ERD_Complete_Pack.pdf` | Verified (5 pages) | Contains relational model and relationship tables. |
| **Reference: Lock-Free SPSC Queue** | `Downloads/cpp-lockfree-queue` & GitHub | Working C++17 library | Ring buffer with zero-allocation, cacheline-padded atomic head/tail. To be integrated into C++ order gateway. |
| **Reference: UDP Gap Detector** | `Downloads/udp-gap-detector.tar.gz` & GitHub | Working C++17 project | Monotonic sequence tracking, loss detection, and retransmission requests. Reference for multicast feed. |
| **Reference: TCP Latency Lab** | `Downloads/tcp-latency-lab.tar.gz` & GitHub | Working C++17 benchmark | Low-latency TCP socket primitives, nanosecond timers, and client/server scaffolding. Reference for gateway TCP server. |

---

## 3. Detailed Technical Findings

### 3.1 What Already Works
1. **Schema Definition & Demo Data:** The 17 PostgreSQL tables are defined with appropriate data types (`NUMERIC(20,4)`, `BIGINT`, `UUID`, `DOUBLE PRECISION[]`, `TSVECTOR`, custom ENUMs).
2. **Demonstration Queries:** 17 validated SQL queries test each core relationship: user-account joins, order-trade-fill linkages, position summaries, surveillance alerts, and full-text search over analyst notes.
3. **Conceptual Chen Diagrams:** High-quality Chen ER diagrams spanning 6 subsystem pages plus a global overview, satisfying university formatting requirements.
4. **C++ Core Primitives:** Verified lock-free SPSC queue (`spsc_queue.hpp`) with atomic acquire/release semantics and UDP sequence gap detection logic.

### 3.2 What Is Incomplete
1. **Application Backend:** There is currently no running API server connecting the PostgreSQL database to the frontend and trading engine.
2. **Matching Engine Integration:** The C++ order book matching engine and order gateway have not been packaged with standard build tooling (CMake) or exposed via a clean communication bridge (REST/WebSocket).
3. **Web Application:** No active Next.js/React frontend exists in the workspace; the trader and surveillance UI needs full implementation.
4. **Surveillance Automation:** Feature extraction from order-book events and vector cosine similarity matching against the 8-feature patterns currently only exist as static sample records in SQL.
5. **Automated Verification:** No automated unit, integration, or end-to-end test suite exists.

### 3.3 Discrepancies & Database Constraint Corrections

During inspection of the supplied ER diagram and SQL definitions, five critical design questions were resolved:

| Question / Design Point | ERD Annotation | Issue Identified | Corrected Implementation & Rationale |
|---|---|---|---|
| **1. `users.role` Uniqueness** | Marked with `UK` on Page 1 | A `UNIQUE` constraint on role would permit only one TRADER, one ANALYST, and one ADMIN in the entire system. | **Removed UNIQUE constraint.** Enforced via `user_role` ENUM (`'TRADER'`, `'ANALYST'`, `'ADMIN'`). Multiple users can share the same role. |
| **2. `accounts.owner_role` FK** | Marked as `FK` on Page 1 | The ER diagram does not define a separate `roles` lookup table; pointing `owner_role` nowhere violates referential integrity. | **Stored as ENUM `user_role NOT NULL`.** Enforces valid roles without an unnormalized lookup table. |
| **3. `fills.trade_id` & `side` Uniqueness** | Both marked `UK` on Page 3 | Individual `UK` on `trade_id` would prevent recording both buyer and seller fills for a single trade. Individual `UK` on `side` would permit only one BUY fill in the entire table. | **Implemented `UNIQUE (trade_id, side)`.** Guarantees each trade has at most one buyer fill and one seller fill. |
| **4. `surveillance_sessions` Constraints** | `account_id`, `instrument_id`, `window_start` marked `UK` | Individual uniqueness would prevent an account or instrument from ever participating in a second surveillance window. | **Implemented `UNIQUE (account_id, instrument_id, window_start)`.** Validates that an account has at most one monitoring session per instrument per time window. |
| **5. Account to Risk Limits Cardinality** | `1 : 0..1` | Risk limits are optional per account upon registration. | **`risk_limits.account_id` is PK and FK.** Ensures an account can have at most one risk limit record (`1 : 0..1`). |

### 3.4 What Is Unnecessary and Must Be Avoided
- Do not introduce Kafka, RabbitMQ, or external distributed brokers: a local Unix domain socket / TCP socket / WebSockets bridge with the in-process SPSC queue provides microsecond-level latency and zero operational friction for a college viva demonstration.
- Do not introduce Kubernetes or cloud-heavy microservices.
- Do not connect real external brokerage APIs. Simulated deterministic exchange feeds guarantee reliable demonstration without network failure risks.

---

## 4. Environment & Tooling Assessment

- **Host OS:** Windows 11 with PowerShell 5.1 / 7.
- **Node.js:** v26.7.0 / npm 11.19.0 available natively.
- **Python:** Python 3.13 natively and Python 3.12 inside WSL Ubuntu.
- **C++ Compilers:** 
  - `g++ (Ubuntu 13.3.0)` via WSL 2 supporting C++20/C++23 with POSIX sockets and pthreads.
  - `MinGW g++ 6.3.0` on Windows native.
- **WSL 2:** Active Ubuntu environment available for high-performance Linux socket builds and testing.
- **PostgreSQL Execution Strategy:** Dual support for native PostgreSQL service/Docker container, paired with an embedded in-memory / file-backed PGlite instance and standard `pg` driver ensuring 100% test reproducibility across any machine without external daemon dependencies.

---

## 5. College Submission Readiness Checklist

- [x] Chen Notation ER Diagram Pack inspected and validated (7 pages).
- [x] Relational schema and DDL verified across all 17 tables.
- [x] Dummy data with realistic financial figures and surveillance patterns verified.
- [x] 17 demonstration SQL queries validated against schema logic.
- [ ] End-to-end full stack system operational and demonstrated.
- [ ] Comprehensive academic and technical documentation completed.
- [ ] Viva voce preparation guide compiled.

**Audit Status:** APPROVED TO PROCEED TO PHASE 1 (ARCHITECTURE & IMPLEMENTATION PLAN).
