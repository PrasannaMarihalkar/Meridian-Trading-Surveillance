# MERIDIAN — Evaluator & Teacher Demonstration Script

**Course:** DBMS Experiential Learning — Level 3  
**Institution:** PES University, Department of Computer Science & Engineering  
**Faculty Evaluator:** Dr. Nagasundari S  
**Student Author:** Prasanna Marihalkar (`PES1UG24CS684`, `@PrasannaMarihalkar`)  
**Repository:** `https://github.com/PrasannaMarihalkar/meridian-trading-surveillance`  
**Verified Branch:** `fix/final-teacher-demo-readiness`  

---

## 1. Quick Environment Setup

Run in terminal:
```bash
# 1. Clone repository and switch to verified PR branch
git clone https://github.com/PrasannaMarihalkar/meridian-trading-surveillance.git
cd meridian-trading-surveillance
git checkout fix/final-teacher-demo-readiness

# 2. Verify dependencies and type cleanliness
npm run type-check   # 0 errors (strict mode across backend & frontend)
npm run lint         # 0 warnings (ESLint 9)

# 3. Start development server (serves REST API, WebSocket stream & Web UI at port 4000)
npm run dev
```

Open your browser at: **`http://localhost:4000`**

---

## 2. Interactive Academic Demonstration Steps

### Step 1: Authentication, Session Durability & Single-Use WebSocket Tickets
1. In the Web UI header, click **"Trader"** fast-login button (logs in as `prasanna_trader`).
2. Notice the live feed indicator turns green: **`LOB FEED LIVE`**.
3. **Inspect the Network Tab in DevTools:**
   - The browser requests `POST /api/auth/ws-ticket` to obtain a short-lived single-use ticket (30s TTL, SHA-256 hashed).
   - The WebSocket connects to `ws://localhost:4000/ws` and sends `{ type: "AUTH_TICKET", ticket: "..." }`.
   - Legacy query-string tokens (`?token=`) and raw-JWT frames are strictly rejected.
4. **Session Invalidation on Logout:**
   - Click **"Logout"**. The session row is permanently deleted from PostgreSQL `sessions`.
   - Existing WebSockets are immediately terminated with code `4001` (`Session revoked`). Replaying the JWT returns HTTP 401 Unauthorized.

---

### Step 2: Level 2 Order Book, Deterministic Matching & Atomic Triggers
1. Log in as **"Trader"** (`prasanna_trader`).
2. Navigate to the **"Trading Terminal"** tab.
3. Select Instrument **`RELIANCE`** (Reference Price: ₹1,400.00).
4. **Place a Resting Passive Limit Order:**
   - Side: `SELL`, Order Type: `LIMIT`, Price: `1410.00`, Quantity: `20`.
   - Click **"Submit Order"**.
   - Observe the order resting as `OPEN` in the Order Book table under the Asks column.
5. **Place an Aggressive Counterparty Order:**
   - In a second tab or logging in as another trader, place:
   - Side: `BUY`, Order Type: `LIMIT`, Price: `1410.00`, Quantity: `20`.
   - Click **"Submit Order"**.
6. **Inspect the Trade & Real-Time Settlement Trigger:**
   - Trade executes at `1410.00` for `20` shares. Both orders transition to `FILLED`.
   - PostgreSQL trigger `trg_fills_settlement` fires atomically inside the transaction:
     - Updates `accounts.cash_balance` for buyer (-₹28,200) and seller (+₹28,200).
     - Updates `positions.net_qty` and recomputes weighted average cost (`avg_cost`).

---

### Step 3: Pre-Trade Risk Controls & Configurable Price Collars (2%, 5%, 8%)
1. **Price Collar Violation Test:**
   - Try to place a BUY order for `RELIANCE` @ `1550.00` (deviates > 10% from ref ₹1400.00).
   - Terminal immediately rejects: `400 Bad Request: Price collar violation`.
   - Configurable per-account collars (2%, 5%, 8%) are enforced consistently across limit orders, market order reservations, and matching candidate queries.
2. **Tick Size & Lot Size Compliance:**
   - Enter price `1400.03` (tick size is `0.05`). Rejected with `400 Bad Request: Invalid multiple of tick size`.
3. **Cash Purchasing Power Reservation:**
   - Submit a BUY order whose notional value exceeds uncommitted cash (accounting for open resting orders).
   - Rejected with `400 Bad Request: Insufficient available cash`.

---

### Step 4: Time-In-Force Execution (IOC & FOK All-Or-None)
1. **Immediate-or-Cancel (IOC):**
   - Book has 10 shares available at `1405.00`.
   - Submit BUY order with Time-In-Force `IOC` for 25 shares @ `1405.00`.
   - Result: 10 shares fill immediately; residual 15 shares are cancelled with `0` book resting (`status_reason: IOC_RESIDUAL_CANCELLED`).
2. **Fill-or-Kill (FOK):**
   - Book has only 10 shares available.
   - Submit BUY order with Time-In-Force `FOK` for 20 shares.
   - Result: FOK cancels immediately with `0` fills (`status_reason: FOK_UNFILLED_INSUFFICIENT_LIQUIDITY`). FOK never executes partial fills.

---

### Step 5: Pure Database Advisory Locks & Multi-Process Concurrency
1. MERIDIAN eliminates in-process JavaScript mutexes, using native PostgreSQL transactional advisory locks:
   - **Namespace 1:** `SELECT pg_advisory_xact_lock(1, accountId)` — serializes cash balance reservations and committed orders.
   - **Namespace 2:** `SELECT pg_advisory_xact_lock(2, instrumentId)` — serializes order matching and price discovery.
2. **Run the Genuine Multi-Process Concurrency Suite:**
   ```bash
   npm run test:concurrency
   ```
   - Demonstrates 10 concurrent competing worker threads against 1 resting order: zero overfills, zero deadlocks, exact financial parity.

---

### Step 6: Market Surveillance & Mathematical Cosine Similarity Pattern Matching
1. In the Web UI, click **"Analyst"** fast-login button (logs in as `asha_analyst`).
2. Navigate to the **"Surveillance"** tab.
3. Observe the **8-Dimensional Behavioral Feature Radar**:
   - `[cancel_ratio, quote_to_trade_ratio, median_lifetime_ms, volume_size_skew, message_rate, book_imbalance, opposite_side_fill_ratio, layering_depth]`
4. **Vector Pattern Matching:**
   - Mathematical stored procedure `fn_cosine_similarity()` computes cosine angles between live trading features and seeded manipulative patterns (`SPOOFING`, `LAYERING`, `QUOTE_STUFFING`, `WASH_TRADING`).
   - Alerts with cosine similarity $\ge 0.85$ appear in the compliance feed.
5. **Full-Text Case Search (tsvector):**
   - In the alert investigation search bar, search for keywords (e.g. `"spoofing"`, `"layering"`).
   - PostgreSQL inverted tsvector index returns matching cases in sub-milliseconds.

---

### Step 7: PES University Level 3 DBMS Demonstration Queries (Q1 — Q17)
Run the automated query suite in terminal:
```bash
npm run demo:queries
```
Executes and displays all 17 college demonstration queries across:
- **Q1–Q4:** User directory, instruments, account cash balances, and risk limits.
- **Q5–Q8:** Open orders, executed trades, side-specific fills, and position ledger.
- **Q9–Q11:** Top of Book (v_top_of_book view), account summary (v_account_financial_summary), and depth aggregations.
- **Q12–Q14:** Active surveillance alerts, investigation notes, and 8-D behavioral features.
- **Q15:** Vector Cosine Similarity pattern matching (`fn_cosine_similarity`).
- **Q16:** Audit log chronology (immutable ledger).
- **Q17:** Table record count across all 17 relational entities.

---

### Step 8: Standalone C++20 Systems Engine Verification
```bash
# In WSL or Linux terminal:
wsl bash -c "cd /mnt/c/Users/prasa/.gemini/antigravity/scratch/meridian && ./test_ob_asan"
```
- **Verifies:** Lock-free SPSC queue transferring 100,000 packets, bounded 20,560-byte gap detector (zero heap allocation, split-gap resolution, saturation handling), and zero AddressSanitizer/UndefinedBehaviorSanitizer defects.
