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
1. **Low-Latency Systems Core (C++20):** Nanosecond-level order matching, lock-free ring-buffer dispatching, UDP market dissemination, and sequence-gap detection.
2. **Relational Transactional Core (PostgreSQL):** ACID ledger enforcing referential integrity across 17 entities, side-specific trade fills, inventory positions, risk limits, and immutable audit logs.
3. **Behavioral Surveillance Engine:** Vector similarity clustering over 8-dimensional order-flow behavioral metrics to flag spoofing, layering, and quote-stuffing manipulation.
4. **Institutional Web Interface (Next.js / React / TypeScript):** High-density, real-time trader terminal and compliance investigation console.

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
│  - Nanosecond Latency Benchmarks        │     │  - pgvector Cosine Pattern Search   │
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
- **Price Levels:** Bids sorted in descending order (highest buyer has priority); Asks sorted in ascending order (lowest seller has priority).
- **Time Priority:** Within any given price tick, orders are organized in a FIFO queue. Early orders are matched before later arrivals at identical price points.
- **Order Types Supported:**
  - `LIMIT`: Rests on the book if not immediately matched at the specified price or better.
  - `MARKET`: Aggressively sweeps existing opposite book liquidity up to available quantity.
  - `IOC` (Immediate-Or-Cancel): Fills whatever quantity is immediately available at limit price; unfulfilled balance is immediately cancelled without resting on the book.

### 3.2 Lock-Free SPSC Ring Buffer
To isolate the matching engine thread from network OS syscalls and lock contention, order intake leverages a Single-Producer Single-Consumer (SPSC) ring buffer (derived from verified reference `cpp-lockfree-queue`):
- Cache-line padded read and write cursors prevent CPU cache false sharing.
- `std::memory_order_acquire` and `std::memory_order_release` atomic semantics guarantee memory visibility without kernel mutexes.
- Constant $O(1)$ enqueue and dequeue time with zero heap allocations on the hot execution path.

### 3.3 UDP Dissemination & Monotonic Gap Recovery
Mirroring institutional feeds (e.g., NASDAQ ITCH / MoldUDP64):
- Market updates are broadcast over UDP multicast packets stamped with monotonically increasing 64-bit sequence numbers (`engine_seq`).
- A client-side gap detector (derived from verified reference `udp-gap-detector`) tracks expected versus received sequences.
- Upon detecting a packet drop ($Seq_{recv} > Seq_{expected}$), the client issues a targeted TCP retransmission request for the missing sequence range.

---

## 4. Multi-Paradigm Persistence Layer

The database architecture leverages multiple database paradigms according to data characteristics:

| Paradigm | Technology | Entities / Data | Rationale |
|---|---|---|---|
| **Relational (SQL)** | PostgreSQL 16+ | Users, Accounts, Orders, Trades, Fills, Positions, Risk Limits, Audit Log | Strict ACID compliance guarantees that orders are never half-settled. Relational joins calculate P&L, holdings, and risk headroom. |
| **Vector (Embeddings)** | PostgreSQL + `pgvector` | `surveillance_sessions.features`, `surveillance_patterns.embedding` | Hand-engineered 8-D behavioral features enable cosine similarity search to surface spoofing/layering patterns that SQL equality cannot express. |
| **Document (NoSQL)** | Flexible JSONB / Mongo Schema | Order book snapshots, tick archives, audit snapshots (`old_data`, `new_data`) | Variable-depth order book snapshots and raw unstructured tick traces suit JSONB/document structures. |
| **Search (Information Retrieval)** | PostgreSQL Full-Text (`tsvector` / `tsquery`) | `alert_notes.body_tsv` | Inverted index search over compliance investigation notes using English stemming and lexeme tokenization. |

---

## 5. Seven Advanced Database Concepts Demonstrated

Meeting and exceeding the college requirement of four advanced concepts:

1. **ACID Transactions:** Atomic multi-table updates across `orders`, `trades`, `fills`, and `positions`. If an account fails cash settlement or risk checks, the entire transaction rolls back.
2. **Views:** Specialized virtual tables for reporting:
   - `v_top_of_book`: Best bid and ask per instrument.
   - `v_account_portfolio`: Net open positions, average costs, mark-to-market valuations, and unrealized P&L.
   - `v_alert_summary`: High-severity surveillance alerts joined with assigned analyst usernames.
3. **Stored Procedures & Functions:**
   - Realized P&L calculation procedure based on average cost inventory accounting.
   - Cosine similarity calculation function for 8-dimensional feature vectors.
4. **Database Triggers:**
   - Automatic execution of `audit_log` records on order cancellation or status modification.
   - Automatic position updates when a fill row is inserted.
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
3. **$f_3$ (`median_lifetime_ms`):** Median duration from order submission to cancellation (Spoofed orders typically cancel in $< 200\text{ ms}$).
4. **$f_4$ (`size_skew`):** $\frac{|\text{Bid Volume} - \text{Ask Volume}|}{\text{Total Volume}}$ (Artificial pressure to move prices).
5. **$f_5$ (`msg_rate_per_s`):** Peak orders and cancellations submitted per second.
6. **$f_6$ (`book_imbalance_impact`):** Order placement influence on opposite best bid/ask delta.
7. **$f_7$ (`opposite_side_fill_ratio`):** Ratio of fills executed on the opposite side of massive cancellations (smoking gun of spoofing).
8. **$f_8$ (`layering_depth`):** Average order book depth of submitted and withdrawn orders.

### Cosine Similarity Classification:
$$\text{Similarity}(\vec{F}, \vec{P}) = \frac{\vec{F} \cdot \vec{P}}{\|\vec{F}\| \|\vec{P}\|}$$

When $\text{Similarity} \ge 0.80$, an alert is automatically generated, flagged with triggered heuristic rules, and assigned to a compliance analyst for review.
