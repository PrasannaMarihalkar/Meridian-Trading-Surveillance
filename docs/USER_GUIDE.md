# MERIDIAN — APPLICATION USER & OPERATION GUIDE

**Platform:** MERIDIAN High-Performance Trading Core & Market Surveillance  
**Target Roles:** Traders, Compliance Analysts, System Administrators, College Evaluators  

---

## 1. Getting Started & Role Sign-In

Navigate to `http://localhost:4000` in any modern web browser.

Click the **"Sign In / Demo"** button in the top right. For demonstration purposes, three pre-configured accounts are provided with 1-click login:
- **Trader:** `prasanna_trader` (Password: `Password123!`)
- **Compliance Analyst:** `asha_analyst` (Password: `Password123!`)
- **System Administrator:** `sys_admin` (Password: `Password123!`)

Alternatively, register a new account choosing your preferred role.

---

## 2. Trader Portal & Order Execution

### 2.1 Viewing Instruments & Order Book
1. Select any of the 5 active instruments (RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK) on the top ticker banner.
2. The **Level 2 Order Book** displays real-time price-time priority depth:
   - Green bids (buy orders) with relative depth visual bars.
   - Red asks (sell orders) with relative depth visual bars.
   - Live bid-ask spread and mid-price.

### 2.2 Placing an Order
1. In the **Order Entry Ticket**, choose your side: **BUY / LONG** or **SELL / SHORT**.
2. Select your execution type:
   - `LIMIT`: Rests on book if not filled immediately at the limit price or better.
   - `MARKET`: Aggressively sweeps available book liquidity at market prices.
   - `IOC` (Immediate-Or-Cancel): Fills available liquidity immediately; cancels any unfulfilled balance.
3. Enter your limit price and quantity. Note the real-time **Pre-trade Risk & Notional Summary Card**:
   - Calculates estimated notional value.
   - Calculates percentage deviation from reference benchmark price (must not exceed 5% price collar).
   - Validates that your account cash balance is sufficient.
4. Click the submission button. Upon execution, the matching engine matches crossing orders in microseconds, updates the order book, logs trades to the blotter, and updates your portfolio positions!

### 2.3 Managing Orders & Positions
- **Working Orders Blotter:** View active orders; click **"Cancel"** to withdraw a resting order.
- **Trade Blotter:** Review historical execution records showing execution price, quantity, and matched counterparties.
- **Portfolio Holdings:** Track your net share position, weighted average entry cost, market valuation, and real-time unrealized and realized P&L.

---

## 3. Compliance Surveillance & Alert Investigation

Switch to the **"Surveillance"** tab in the top navigation.

### 3.1 Reviewing Flagged Abuse Patterns
1. View the **Surveillance Alerts Queue**. Alerts are prioritized by severity (`CRITICAL`, `HIGH`, `MEDIUM`).
2. Click **"Examine"** on any alert to open its case file:
   - Review the **8-Dimensional Behavioral Metrics** (order-cancel ratio, quote-to-trade ratio, median order lifetime in ms, message rate).
   - Inspect the **Cosine Similarity Match** against known market abuse signatures (`Rapid Spoofing & Cancellation`, `Multi-Level Layering Pattern`, `Quote Stuffing Burst`).

### 3.2 Conducting an Investigation
1. Click **"Assign to Me"** to take ownership of the case.
2. Update the status (`IN_REVIEW`, `RESOLVED`, `FALSE_POSITIVE`).
3. Append regulatory notes in the **Investigation Notes** panel. Notes are automatically indexed using PostgreSQL full-text search.
4. Use the **Search Notes** bar to run fast keyword searches (e.g. `spoofing`, `cancellation`) across all historical notes.

### 3.3 Triggering a Real-Time Surveillance Scan
Click **"Trigger Surveillance Scan"** to evaluate the latest 30-minute trading window across active accounts, calculate live feature vectors, and raise new alerts on abusive trading behavior.

---

## 4. System Auditing & Consumer Offsets

Switch to the **"Audit Trail"** tab to inspect:
- The immutable chronological event ledger.
- JSON deltas showing exact `old_data` vs `new_data` state transitions.
- Matching engine consumer high-watermark offsets (`trade_projection_service`, `market_data_broadcaster`, `surveillance_stream_consumer`).

---

## 5. College Viva Showcase

Switch to the **"College Showcase"** tab for viva evaluations:
- **17 Demo Queries Tab:** Select any query from Q1 to Q17, review its academic purpose, and click **"Execute SQL"** to run it live against the real database.
- **Chen ER Model Tab:** Review the 7 subsystem pages formatted strictly in Peter Chen notation.
- **Data Dictionary Tab:** Inspect table schemas, constraints, and BCNF normalization proofs.
