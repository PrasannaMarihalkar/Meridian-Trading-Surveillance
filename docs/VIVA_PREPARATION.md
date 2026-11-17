# MERIDIAN — COLLEGE VIVA VOCE & TECHNICAL INTERVIEW PREPARATION GUIDE

**Target:** PES University DBMS Experiential Learning — Level 3 Viva & Technical Engineering Interviews  
**Student:** Prasanna Marihalkar (USN: PES1UG24CS684)  

---

## 1. Database & Relational Modeling Questions

### Q1: Why did you use Peter Chen notation instead of Crow's Foot notation in your ER diagrams?
> **Answer:** Peter Chen notation is the foundational conceptual modeling standard required by PES University academic guidelines. It provides clear visual distinction between strong entities (rectangles), relationships (diamonds), attributes (ovals), and keys (underlined). Crow's Foot is a physical design shorthand that conflates relationships with foreign keys. In our Chen diagrams, cardinalities (`1:1`, `1:N`, `M:N`, `1:0..1`) are explicitly annotated on relationship edges, clearly documenting business rules prior to relational mapping.

### Q2: How do you prove that the MERIDIAN schema satisfies Boyce-Codd Normal Form (BCNF)?
> **Answer:** A relation $R$ is in BCNF if for every non-trivial functional dependency $X \rightarrow Y$, the determinant $X$ is a superkey:
> - In `orders`, the candidate keys are `{order_id}` and `{client_order_id}`. All non-key attributes (`price`, `quantity`, `side`, etc.) depend strictly on `order_id` or `client_order_id`. There are no partial or transitive dependencies.
> - In `fills`, the candidate keys are `{fill_id}` and `{(trade_id, side)}`. Both determine all other fill attributes.
> - In `positions`, the composite key `(account_id, instrument_id)` determines `net_qty`, `avg_cost`, and `realized_pnl`. Neither `account_id` alone nor `instrument_id` alone determines holding or P&L.
> - Across all 17 tables, every single determinant is either a primary key or an alternate candidate key. Hence, the entire schema is in BCNF.

### Q3: In the draft ER diagram, `users.role` had a UK (Unique Key) annotation. Why did you remove it in the SQL DDL?
> **Answer:** A unique constraint on `users.role` would violate business logic by restricting the entire system to exactly one TRADER, one ANALYST, and one ADMIN. Multiple users must be allowed to share the same role. We enforced valid roles through the `user_role` ENUM type (`'TRADER'`, `'ANALYST'`, `'ADMIN'`) with a `NOT NULL` constraint, preserving integrity without an unnormalized singleton restriction.

### Q4: Why did you implement `UNIQUE (trade_id, side)` on the `fills` table?
> **Answer:** In institutional trade settlement, every matched trade executes between two distinct parties: a buyer and a seller. Therefore, every single trade row settles into exactly two fill legs: one buyer fill (`side = 'BUY'`) and one seller fill (`side = 'SELL'`). A unique constraint on `trade_id` alone would prevent storing the second leg. A unique constraint on `side` alone would allow only one buy fill in the entire database. The composite constraint `UNIQUE (trade_id, side)` precisely enforces that each trade has at most one buyer fill and at most one seller fill.

### Q5: What database triggers did you implement and why?
> **Answer:** We implemented three automated triggers:
> 1. `trg_fills_settlement`: Fires `AFTER INSERT ON fills`. It automatically adjusts account `cash_balance`, recalculates the account's open inventory (`net_qty`) and weighted average entry cost (`avg_cost`), and calculates realized P&L when reducing a position.
> 2. `trg_orders_audit`: Fires `AFTER UPDATE ON orders`. Whenever an order status or filled quantity changes, it writes an immutable event snapshot with JSON old and new data into `audit_log`.
> 3. `trg_alert_notes_tsv`: Fires `BEFORE INSERT OR UPDATE ON alert_notes`. It parses the note's text body into a PostgreSQL `tsvector` with English stemming for inverted full-text search.

### Q6: Why did you use `NUMERIC(20,4)` instead of `FLOAT` or `DOUBLE PRECISION` for currency and prices?
> **Answer:** Binary floating-point types (`float` / `double`) use IEEE 754 representation, which cannot represent base-10 decimal fractions like `0.1` or `0.05` exactly. Over millions of trades, floating-point rounding errors accumulate into noticeable financial discrepancies (known as fractional cent leakage). PostgreSQL `NUMERIC(20,4)` stores exact fixed-point decimal values, guaranteeing arithmetic precision for financial accounting and regulatory audits.

---

## 2. C++ Systems & Low-Latency Architecture Questions

### Q7: Why did you use C++ for the matching engine instead of implementing it entirely in Node.js or SQL?
> **Answer:** Order matching on the critical path is CPU-bound and cache-sensitive. A continuous double auction requires maintaining sorted order books and matching opposite orders in sub-microseconds. In Node.js, V8 garbage collection pauses (stop-the-world GC) cause unpredictable latency spikes (tail latency). In PostgreSQL, row-level locking and transaction logging introduce disk I/O overhead. Our C++20 engine processes orders in memory with zero allocations on the hot path, achieving **4.14 million orders per second with a 153-nanosecond median latency**.

### Q8: What is an SPSC lock-free ring buffer and why doesn't it require a Compare-And-Swap (CAS) loop?
> **Answer:** An SPSC (Single-Producer Single-Consumer) queue has exactly one writer thread modifying `head_` and exactly one reader thread modifying `tail_`. Because there are never multiple threads contending to update the same pointer, a CAS (`compare_exchange`) loop is unnecessary. A CAS loop solves multi-producer contention (an MPMC problem). In SPSC, we only need atomic loads and stores with acquire-release memory ordering:
> - The producer writes data to `buffer_[head]`, then publishes `head_` with `std::memory_order_release`.
> - The consumer reads `head_` with `std::memory_order_acquire`, guaranteeing it sees the written data.

### Q9: What is false sharing and how did you prevent it in C++?
> **Answer:** Modern CPUs fetch memory into 64-byte cache lines. If `head_` (written by producer) and `tail_` (written by consumer) reside on the same 64-byte cache line, every time one thread writes its variable, the MESI cache-coherency protocol invalidates that entire cache line in the other core, causing severe bus contention even though the threads are modifying different variables. We prevented this using `alignas(64)` cache-line padding, isolating `head_` and `tail_` onto independent cache lines.

---

## 3. Market Surveillance & Machine Learning Questions

### Q10: How does the surveillance module detect market abuse like spoofing? What are the 8 features?
> **Answer:** Spoofing is the illegal practice of submitting large orders with the intent to cancel them before execution, creating a false impression of market interest to manipulate opposite prices. We capture this behavior through an 8-dimensional feature vector:
> 1. `order_cancel_ratio`: Ratio of cancellations to placed orders ($> 0.85$ indicates spoofing).
> 2. `quote_to_trade_ratio`: Orders submitted per executed trade (high values indicate quote stuffing).
> 3. `median_lifetime_ms`: Time from submission to cancel (spoofed orders cancel in $< 200\text{ ms}$).
> 4. `size_skew`: Asymmetry between bid and ask volumes.
> 5. `msg_rate_per_s`: Peak message velocity.
> 6. `book_imbalance_impact`: Influence on opposite book spread.
> 7. `opposite_side_fill_ratio`: Fills on the opposite side of cancellations.
> 8. `layering_depth`: Average book depth of cancelled quotes.

### Q11: How does vector cosine similarity differ from standard relational SQL queries?
> **Answer:** Relational SQL queries operate on deterministic Boolean predicate logic (`WHERE status = 'CANCELLED' AND price > 100`). However, manipulative trader behavior is multidimensional and noisy; spoofers might cancel 87% of orders in one session and 93% in another. Cosine similarity computes the cosine of the angle between two 8-dimensional vectors in metric space:
> $$\text{Cosine Similarity} = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\| \|\vec{B}\|}$$
> This measures geometric pattern similarity regardless of absolute scale, allowing us to match incoming sessions against known abuse signatures (`Rapid Spoofing`, `Layering`) even when exact numerical values vary.

### Q12: How does PostgreSQL full-text search work on alert notes?
> **Answer:** PostgreSQL full-text search uses the `tsvector` and `tsquery` data types. When an analyst submits a note, trigger `trg_alert_notes_tsv` parses the text using English language stemming (e.g. reducing `"cancelled"`, `"cancels"`, and `"cancelling"` to the root lexeme `'cancel'`) and stores a sorted list of distinct lexemes in `body_tsv`. A Generalized Inverted Index (GIN) allows queries like `body_tsv @@ plainto_tsquery('english', 'cancelled orders')` to execute via index lookups in sub-milliseconds rather than sequential table scans.
