# MERIDIAN — 5-MINUTE LIVE COLLEGE VIVA DEMO SCRIPT

**Student:** Prasanna Marihalkar (USN: PES1UG24CS684)  
**Target Audience:** Dr. Nagasundari S & PES University Viva Evaluators  
**Estimated Time:** 5 Minutes  

---

## Step 0: Pre-Viva Launch (30 seconds before presentation)

Open your terminal in `scratch/meridian` and run:
```bash
npm start
```
Open Chrome to **`http://localhost:4000`**. Have the application loaded in full-screen dark mode.

---

## Minute 1: Problem Statement & Architectural Overview (0:00 – 1:00)

> *"Good morning, Professor. Modern financial exchanges match orders in sub-microseconds while generating massive volumes of structured transaction records and behavioral signals. MERIDIAN is a high-performance order matching engine and real-time market surveillance platform built to demonstrate advanced database concepts under high-frequency state transitions.*
>
> *Our architecture combines three complementary tiers:*
> 1. *A C++20 limit order book matching engine with a lock-free SPSC ring buffer achieving over 4.1 million orders per second with a 153-nanosecond median latency.*
> 2. *A 17-entity PostgreSQL relational core normalized to BCNF, enforcing strict ACID guarantees, automated triggers for position settlement, and immutable audit logging.*
> 3. *An 8-dimensional behavioral surveillance module using vector cosine similarity to detect market abuse such as spoofing and layering in real time.*
>
> *Everything you see on screen is backed by live database transactions and real-time WebSockets."*

---

## Minute 2: Trading Workflow & Order Matching (1:00 – 2:00)

> *"Let me demonstrate the trading lifecycle:*
> 1. *I will click 'Sign In / Demo' and authenticate as Trader **prasanna_trader**.*
> 2. *Notice our 5 active market instruments: RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK. On the left is our Level 2 Price-Time Priority Order Book ladder showing live bid and ask depth.*
> 3. *Let's submit a BUY order for 50 shares of RELIANCE at ₹1400.00. Notice the pre-trade risk card calculating estimated notional value and verifying that price collar deviation is within 5%.*
> 4. *When I click 'BUY', the order enters the matching engine. It matches against a resting sell order at ₹1400.00. Notice our trade blotter instantly records Trade #9003 with engine sequence #700003.*
> 5. *In the database, our trigger `trg_fills_settlement` immediately fired: it generated exactly one buyer fill with negative cash delta and one seller fill with positive cash delta, updated our net position to 50 shares, recomputed weighted average cost, and updated mark-to-market unrealized P&L."*

---

## Minute 3: Pre-Trade Risk Limits & Price Collar Defense (2:00 – 3:00)

> *"Financial systems must protect markets from erroneous fat-finger orders and extreme volatility. Let's demonstrate pre-trade risk rejection:*
> 1. *Suppose I enter an order price of ₹1600.00 for RELIANCE (where reference price is ₹1400.00).*
> 2. *Notice the ticket instantly warns: 'Price Collar Deviation: 14.29% (EXCEEDS 5% LIMIT)'.*
> 3. *When I attempt to submit, the backend API rejects the request with HTTP 400: 'Order price 1600.00 deviates by 14.29% from reference price 1400.00, exceeding the 5% price collar'.*
> 4. *Similarly, orders exceeding account quantity caps or exceeding available cash balance are rejected before ever touching the matching book."*

---

## Minute 4: Market Surveillance & Vector Pattern Recognition (3:00 – 4:00)

> *"Now let's switch to the 'Surveillance' tab to show how MERIDIAN detects suspicious market abuse:*
> 1. *Our compliance module aggregates trading activity across 30-minute sliding windows into an 8-dimensional feature vector: cancel ratio, quote-to-trade ratio, median order lifetime in milliseconds, size skew, and message velocity.*
> 2. *Notice Alert #8001 flagged on subject account 1003. When I click 'Examine', we see the algorithm detected an order-cancel ratio of 93.3% and a median lifetime of only 110 milliseconds.*
> 3. *Computing cosine similarity against our known benchmark signatures matched 'Rapid Spoofing & Cancellation' with 97.8% similarity, automatically raising a CRITICAL severity alert.*
> 4. *As an analyst, I can assign the alert to myself, transition its status to 'IN_REVIEW', and add investigation findings.*
> 5. *Notice our search bar: when I search for 'spoofing', it executes PostgreSQL full-text search using English stemming over `tsvector` and returns the relevant notes with sub-millisecond ranking."*

---

## Minute 5: College Submission Review & 17 Demo Queries (4:00 – 5:00)

> *"Finally, let's open the 'College Showcase' tab:*
> 1. *Under 'Chen ER Model', we have our 7-page conceptual ER diagram following Peter Chen notation: rectangles for entities, diamonds for relationships, ovals for attributes, and underlined primary keys.*
> 2. *Under 'Data Dictionary', all 17 tables are documented with data types, domain constraints, and functional dependency proofs satisfying BCNF.*
> 3. *Under '17 Demo Queries', you can select any query from Q1 to Q17. Let's select Query Q4: Executed Trades. When I click 'Execute SQL', the system runs the query directly against the database and renders the live dataset.*
> 4. *We can select Query Q17: College Verification Count. It executes a 17-way UNION ALL proving that every single table in the relational schema is populated with valid records.*
>
> *This concludes our demonstration. I welcome any questions regarding the C++ engine, relational schema, triggers, or surveillance algorithms."*
