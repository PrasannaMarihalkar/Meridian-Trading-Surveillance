# MERIDIAN — SYSTEM ARCHITECTURE & TECHNICAL SPECIFICATION

**Institution:** PES University, Department of Computer Science and Engineering  
**Course:** DBMS Experiential Learning — Level 3  
**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Course Instructor:** Dr. Nagasundari S  
**Student:** Prasanna Marihalkar (USN: PES1UG24CS684)  

---

## 1. Architectural Philosophy

MERIDIAN is designed as a simulation of a modern electronic financial exchange and compliance ecosystem. Unlike generic web applications that perform simple CRUD operations, MERIDIAN's core challenge is maintaining **strict transactional correctness and consistency under high-frequency state transitions**, while simultaneously streaming real-time market data and monitoring participant order-flow for market abuse.

The system partitions workloads across specialized architectural tiers:
1. **Relational Transactional Core (PostgreSQL):** The **sole authoritative production matching engine**, maintaining an ACID ledger enforcing referential integrity across 17 entities, row-level locking for deterministic order matching, side-specific trade fills, inventory positions, risk limits, and immutable audit logs.
2. **Low-Latency Systems Core (C++20 Standalone / IPC Bridge):** Decoupled high-performance matching engine (`engine/meridian_engine`) benchmarked at ~3.9M orders/sec with 152 ns median latency, lock-free ring-buffer dispatching, UDP market dissemination, and 64K bounded circular bitmap gap detection. Used for research, simulations, and benchmark evaluation.
3. **Behavioral Surveillance Engine:** Vector similarity clustering over 8-dimensional order-flow behavioral metrics to flag spoofing, layering, and quote-stuffing manipulation.
4. **Institutional Web Interface (Next.js / React / TypeScript):** High-density, real-time trader terminal and compliance investigation console.

> **Execution Boundary Decision:** In Stage 2, PostgreSQL `DATABASE` mode remains the sole authoritative production matching engine. The C++ engine operates via a correlated IPC bridge for simulation, research, and benchmarking. Automatic cross-engine fallback and dual-engine active replication are strictly prohibited to prevent financial state divergence.

---

## 2. End-to-End System Architecture

```
                                  TRADER / COMPLIANCE USER
                                             │
                   ┌─────────────────────────┴─────────────────────────┐
                   │  Web Browser (HTTPS REST & WSS WebSockets)        │
                   └─────────────────────────┬─────────────────────────┘
                                             │
                                             ▼
                   ┌───────────────────────────────────────────────────┐
                   │         APPLICATION GATEWAY (Node.js/TS)          │
                   │  - Authentication (Argon2id/Bcrypt + JWT)         │
                   │  - Role-Based Access Control (Trader/Analyst)     │
                   │  - Pre-Trade Risk Limit Filter                    │
                   │  - Surveillance Metric Extractor                  │
                   │  - Real-Time WebSocket Publisher                  │
                   └───────────┬───────────────────────────┬───────────┘
                               │                           │
          TCP / Lock-Free Ring │                           │ ACID Transactions
                               ▼                           ▼
┌─────────────────────────────────────────┐     ┌─────────────────────────────────────┐
│       MATCHING ENGINE (C++20)           │     │    PRIMARY DATABASE (PostgreSQL)    │
│  - Lock-Free SPSC Order Intake Ring     │     │  - 17 Relational Tables (BCNF)      │
│  - Price-Time Limit Order Book (LOB)    │────►│  - Pre-Trade & Settlement Triggers  │
│  - Deterministic Trade Match Generation │     │  - Stored Procedures & P&L Engine   │
│  - Nanosecond Latency Benchmarks        │     │  - Native 8-D Cosine Similarity     │
└────────────────────┬────────────────────┘     │  - Full-Text tsvector Search        │
                     │                          └─────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────┐
│     MARKET DATA DISSEMINATION           │
│  - UDP Multicast ITCH-Style Feed        │
│  - Monotonic Sequence Numbers           │
│  - Gap Detection & TCP Retransmission   │
└─────────────────────────────────────────┘
```

---

## 3. High-Performance C++ Systems Core

### 3.1 Price-Time Priority Limit Order Book (LOB)
The matching engine implements standard continuous double-auction price-time priority:
- **Price Levels:** Bids sorted in descending order (`std::map<Price, std::list<Order>, std::greater<Price>>`); Asks sorted in ascending order (`std::map<Price, std::list<Order>, std::less<Price>>`). Best-price lookup is $O(1)$ via `.begin()`.
- **Time Priority:** Within any given price tick, orders are organized in a FIFO queue (`std::list<Order>`). Early orders are matched before later arrivals at identical price points. Insertion/deletion in the queue is $O(1)$ with stable iterators stored in `std::unordered_map<OrderId, OrderLocation>` for direct $O(1)$ cancellation.
- **Order Types Supported:**
  - `LIMIT`: Rests on the book if not immediately matched at the specified price or better.
  - `MARKET`: Aggressively sweeps existing opposite book liquidity up to available quantity.
  - `IOC` (Immediate-Or-Cancel): Fills whatever quantity is immediately available at limit price; unfulfilled balance is immediately cancelled (`OrderStatus::CANCELLED`) without resting on the book.

### 3.2 Lock-Free SPSC Ring Buffer
To isolate the matching engine thread from network OS syscalls and lock contention, order intake leverages a Single-Producer Single-Consumer (SPSC) ring buffer (derived from verified reference `cpp-lockfree-queue`):
- Cache-line padded read and write cursors (`alignas(64)`) prevent CPU cache false sharing.
- `std::memory_order_acquire` and `std::memory_order_release` atomic semantics guarantee memory visibility without kernel mutexes.
- Constant $O(1)$ enqueue and dequeue time with zero heap allocations on the hot execution path.

### 3.3 UDP Dissemination & Monotonic Gap Recovery
Mirroring institutional feeds (e.g., NASDAQ ITCH / MoldUDP64):
- Market updates are broadcast over UDP multicast packets stamped with monotonically increasing 64-bit sequence numbers (`engine_seq`).
- A client-side gap detector (`include/gap_detector.hpp`) tracks expected versus received sequences using a bounded 64K-sequence circular bitmap (`std::array<uint64_t, 1024>`), guaranteeing $O(1)$ lookup and bounded memory (8,280 bytes) with zero dynamic allocation on packet arrival.
- Upon detecting a packet drop ($Seq_{recv} > Seq_{expected}$), the client issues a targeted TCP retransmission request for the missing sequence range.

---

## 4. Multi-Paradigm Persistence Layer

The database architecture leverages multiple database paradigms according to data characteristics:

| Paradigm | Technology | Entities / Data | Rationale |
|---|---|---|---|
| **Relational (SQL)** | PostgreSQL 16+ | Users, Accounts, Orders, Trades, Fills, Positions, Risk Limits, Audit Log | Strict ACID compliance guarantees that orders are never half-settled. Relational joins calculate P&L, holdings, and risk headroom. |
| **Vector (Embeddings)** | Native PostgreSQL (`DOUBLE PRECISION[]`) | `surveillance_sessions.features`, `surveillance_patterns.embedding` | Hand-engineered 8-D behavioral features stored as `DOUBLE PRECISION[] NOT NULL` (8 dimensions) enable native cosine similarity search via stored procedure `fn_cosine_similarity` to surface spoofing/layering without external C extensions (`pgvector`). |
| **Document (NoSQL)** | Flexible JSONB / Mongo Schema | Order book snapshots, tick archives, audit snapshots (`old_data`, `new_data`) | Variable-depth order book snapshots and raw unstructured tick traces suit JSONB/document structures. |
| **Search (Information Retrieval)** | PostgreSQL Full-Text (`tsvector` / `tsquery`) | `alert_notes.body_tsv` | Inverted index search over compliance investigation notes using English stemming and lexeme tokenization. |

### 4.1 Atomic Relational Sequences & Concurrency Invariants
To guarantee absolute concurrency safety and eliminate race conditions under high-throughput trading:
- **10 Dedicated PostgreSQL Sequences:** Explicit sequences manage ID generation for all dynamic relational entities:
  1. `order_id_seq` (`orders.order_id`)
  2. `trade_id_seq` (`trades.trade_id`)
  3. `fill_id_seq` (`fills.fill_id`)
  4. `engine_seq_gen` (`engine_offsets.last_engine_seq`)
  5. `user_id_seq` (`users.user_id`)
  6. `account_id_seq` (`accounts.account_id`)
  7. `surveillance_sessions_id_seq` (`surveillance_sessions.session_id`)
  8. `alerts_id_seq` (`alerts.alert_id`)
  9. `alert_notes_id_seq` (`alert_notes.note_id`)
  10. `audit_log_id_seq` (`audit_log.log_id`)
- **Elimination of `MAX(id) + 1`:** Relying on subquery-based ID allocation introduces dirty reads and transaction collisions under concurrent load. The explicit sequences utilize atomic `nextval(...)` operations backed by the PostgreSQL engine.
- **Deadlock-Free Counterparty Locking:** Multi-account matching acquires row locks on `accounts` in strictly ascending numerical order (`SELECT account_id FROM accounts WHERE account_id IN ($1, $2) ORDER BY account_id FOR UPDATE`). This global acquisition hierarchy mathematically eliminates Coffman circular wait conditions and database deadlocks.

---

## 5. Seven Advanced Database Concepts Demonstrated

Meeting and exceeding the college requirement of four advanced concepts:

1. **ACID Transactions & Dedicated Connection Affinity:** Atomic multi-table updates across `orders`, `trades`, `fills`, and `positions`. Dedicated `PoolClient` lifecycle (`db.transaction()`) guarantees that `BEGIN`, matching statements, and `COMMIT` execute on the identical physical connection, guaranteeing 100% rollback isolation on error.
2. **Views:** Specialized virtual tables for reporting:
   - `v_top_of_book`: Best bid and ask per instrument.
   - `v_account_portfolio`: Net open positions, average costs, mark-to-market valuations, and unrealized P&L.
   - `v_alert_summary`: High-severity surveillance alerts joined with assigned analyst usernames.
   - `v_trade_blotter`: Full trade history with counterparty side attribution.
3. **Stored Procedures & Functions:**
   - Realized P&L calculation procedure (`fn_calculate_realized_pnl`) based on weighted average cost inventory accounting.
   - 8-D Cosine similarity calculation function (`fn_cosine_similarity`) for behavioral vector classification.
4. **Database Triggers:**
   - Automatic execution of `audit_log` records on order cancellation or status modification (`trg_audit_log_immutable`).
   - Automatic double-entry cash debits/credits and inventory position adjustments upon fill insertion (`trg_fills_settlement`).
5. **Multi-Column & Functional Indexing:**
   - Composite index on `orders(account_id, submitted_at DESC)` for high-speed blotter retrieval.
   - Composite index on `trades(instrument_id, executed_at DESC)` for market tick streaming.
   - Generalized Inverted Index (GIN) on `alert_notes.body_tsv` for sub-millisecond keyword discovery.
6. **Vector Similarity Search:**
   - 8-dimensional vector cosine distance search (`1 - (A · B) / (||A|| * ||B||)`) ranking market sessions against known abusive patterns.
7. **Constraints & Domain Integrity:**
   - Composite unique constraints (`UNIQUE (trade_id, side)`, `UNIQUE (account_id, instrument_id, window_start)`).
   - Domain `CHECK` constraints verifying positive prices, valid quantity bounds, and timeline order (`window_end > window_start`).

---

## 6. Surveillance & Abuse Pattern Recognition

The surveillance engine aggregates order-flow events within 30-minute sliding windows into an 8-dimensional feature vector:

$$\vec{F} = [f_1, f_2, f_3, f_4, f_5, f_6, f_7, f_8]$$

1. **$f_1$ (`order_cancel_ratio`):** $\frac{\text{Cancellations}}{\text{Orders Placed}}$ (Spoofers display ratios $> 0.85$).
2. **$f_2$ (`quote_to_trade_ratio`):** $\frac{\text{Orders Placed}}{\text{Trades Executed}}$ (Extreme ratios indicate quote stuffing).
3. **$f_3$ (`median_lifetime_ms`):** True statistical median duration from order submission to cancellation, computed via SQL `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ...)` (Spoofed orders typically cancel in $< 200\text{ ms}$).
4. **$f_4$ (`size_skew`):** Volume-weighted directional imbalance: $\frac{|\text{Bid Volume} - \text{Ask Volume}|}{\text{Total Volume}}$ (Guarded against division by zero).
5. **$f_5$ (`msg_rate_per_s`):** Peak orders and cancellations submitted per second.
6. **$f_6$ (`book_imbalance_impact`):** Order placement influence on opposite best bid/ask delta.
7. **$f_7$ (`opposite_side_fill_ratio`):** Ratio of fills executed on the opposite side of massive cancellations (smoking gun of spoofing).
8. **$f_8$ (`layering_depth`):** Average order book depth of submitted and withdrawn orders.

### Cosine Similarity Classification:
$$\text{Similarity}(\vec{F}, \vec{P}) = \frac{\vec{F} \cdot \vec{P}}{\|\vec{F}\| \|\vec{P}\|}$$

When $\text{Similarity} \ge 0.85$, an alert is automatically generated, flagged with triggered heuristic rules, and assigned to a compliance analyst for review.

---

## 7. Security Architecture, Session Lifecycle & Role-Based Access Control (RBAC)

### 7.1 Durable Session Lifecycle & Immediate Token Revocation
- **JWT + Database Session Pairing:** Every authenticated token contains a cryptographic signature and an explicit `sessionId: string` corresponding to a durable record in the `sessions` table.
- **Immediate Invalidation on Logout:** Calling `POST /api/auth/logout` deletes the active session from the database. Subsequent requests with that JWT are immediately rejected with `401 Unauthorized`.
- **User Status Check:** Authentication middleware checks `users.is_active = TRUE` on every request. Deactivated users cannot execute orders even with a structurally valid JWT.

### 7.2 Strict Role-Based Access Control (RBAC) Matrix
The system enforces strict principle-of-least-privilege boundaries:

| Capability / Endpoint | TRADER | ANALYST | ADMIN |
|---|:---:|:---:|:---:|
| **Public Registration (`POST /api/auth/register`)** | Allowed (Forced TRADER) | Denied | Denied |
| **Admin User Provisioning (`POST /api/auth/users`)** | Denied (403) | Denied (403) | **Allowed** |
| **Order Placement (`POST /api/orders`)** | **Allowed** (Own Account) | Denied (403) | **Allowed** |
| **Order Cancellation (`DELETE /api/orders/:id`)** | **Allowed** (Own Orders Only) | **Denied (403)** | **Allowed** (Any Order) |
| **View Trading Blotter (`GET /api/orders`)** | **Allowed** (Own Account) | **Allowed** | **Allowed** |
| **View Surveillance Alerts (`GET /api/surveillance/alerts`)** | Denied (403) | **Allowed** | **Allowed** |
| **Inspect Abuse Patterns (`GET /api/surveillance/patterns`)** | Denied (403) | **Allowed** | **Allowed** |
| **Investigate / Resolve Alerts (`PATCH /api/surveillance/alerts/:id`)** | Denied (403) | **Allowed** | **Allowed** |
| **WebSocket Alerts Channel (`SURVEILLANCE_ALERT`)** | Filtered (Blocked) | **Streamed** | **Streamed** |

### 7.3 Gateway Hardening & Confidentiality
- **Trust Proxy:** `app.set('trust proxy', 1)` enables accurate client IP tracking behind institutional reverse proxies and load balancers.
- **CORS Whitelist:** Strict origin control restricting cross-origin resource sharing to designated client origins.
- **WebSocket Channel Confidentiality:** WebSocket clients must authenticate via token. Market data ticks are public, while compliance alert streams are isolated strictly to authenticated `ANALYST` and `ADMIN` sockets.

---

## 8. Multi-Tier Financial Pre-Trade Risk Controls

Before any order reaches the matching engine, it must clear five deterministic pre-trade risk filters:
1. **Instrument Status Check:** Verifies that the instrument is `ACTIVE` and trading is not halted.
2. **Tick Size & Lot Size Multiples:** Verifies that order price conforms to instrument tick multiples (`(price * 100) % (tick_size * 100) === 0`) and quantity conforms to lot size multiples (`qty % lot_size === 0`).
3. **Price Collar Guard:** For limit and market orders, rejects submissions deviating $> 5\%$ from the current reference price, preventing flash crashes and execution errors.
4. **Reserved Cash Purchasing Power Guard:** For BUY orders, calculates existing open resting BUY commitment ($Cash_{reserved} = \sum P_{open} \times Q_{remaining}$) and verifies:
   $$\text{Available Cash} = \text{Cash Balance} - \text{Reserved Cash} \ge \text{Order Notional}$$
5. **Maximum Position Limit:** Verifies that projected net position does not breach the account's configured limit:
   $$|\text{Current Position} \pm \text{Order Quantity}| \le \text{Max Position Quantity}$$
