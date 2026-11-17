# MERIDIAN — REST API & WEBSOCKET SPECIFICATION

**Base URL:** `http://localhost:4000/api`  
**WebSocket URL:** `ws://localhost:4000/ws`  
**Authentication Scheme:** HTTP Bearer Header (`Authorization: Bearer <JWT_TOKEN>`)  

---

## 1. Authentication Endpoints

### 1.1 Register New User
- **`POST /auth/register`**
- **Public**
- **Request Body:**
  ```json
  {
    "email": "trader@meridian.internal",
    "username": "prasanna_trader",
    "password": "Password123!",
    "role": "TRADER" // "TRADER" | "ANALYST" | "ADMIN"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "user": {
      "user_id": 106,
      "email": "trader@meridian.internal",
      "username": "prasanna_trader",
      "role": "TRADER",
      "is_active": true,
      "created_at": "2026-11-17T08:30:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "accountId": 1004
  }
  ```

### 1.2 User Login
- **`POST /auth/login`**
- **Public**
- **Request Body:**
  ```json
  {
    "identifier": "prasanna_trader", // username or email
    "password": "Password123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "user": {
      "user_id": 101,
      "username": "prasanna_trader",
      "email": "prasanna@meridian.internal",
      "role": "TRADER"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "accountId": 1001
  }
  ```

### 1.3 Current User Profile
- **`GET /auth/me`**
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):** Returns full user details, cash balances, and risk limits.

---

## 2. Trading & Order Endpoints

### 2.1 Submit New Order
- **`POST /orders`**
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "accountId": 1001,
    "instrumentId": 1,
    "side": "BUY", // "BUY" | "SELL"
    "orderType": "LIMIT", // "LIMIT" | "MARKET" | "IOC"
    "timeInForce": "DAY",
    "price": 1400.00,
    "quantity": 50
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "order": {
      "order_id": 5008,
      "account_id": 1001,
      "instrument_id": 1,
      "side": "BUY",
      "order_type": "LIMIT",
      "price": "1400.0000",
      "quantity": 50,
      "filled_qty": 50,
      "status": "FILLED",
      "submitted_at": "2026-11-17T08:35:00.000Z"
    },
    "trades": [
      {
        "trade_id": 9003,
        "engine_seq": 700003,
        "price": "1400.0000",
        "quantity": 50,
        "buyer_account_id": 1001,
        "seller_account_id": 1002,
        "aggressor_side": "BUY"
      }
    ]
  }
  ```
- **Rejection Status Codes:**
  - `400 Bad Request`: Fails pre-trade risk filter (collar deviation, quantity exceeded, insufficient cash).
  - `403 Forbidden`: Attempting to submit on behalf of an account not owned by user.

### 2.2 Cancel Resting Order
- **`POST /orders/:id/cancel`**
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):** Returns updated order with status `CANCELLED`.

### 2.3 Query Orders Blotter
- **`GET /orders?status=OPEN&instrumentId=1&limit=50&offset=0`**
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):** Array of orders matching criteria.

### 2.4 Query Trade Blotter
- **`GET /trades?instrumentId=1&limit=50`**
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):** Executed trades with buyer and seller details.

### 2.5 Order Book Depth Snapshot (Level 2)
- **`GET /instruments/:id/order-book?depth=10`**
- **Response (200 OK):**
  ```json
  {
    "instrumentId": 1,
    "timestamp": "2026-11-17T08:35:00.000Z",
    "bids": [{ "price": 1395.0, "quantity": 75, "count": 2 }],
    "asks": [{ "price": 1405.0, "quantity": 100, "count": 1 }]
  }
  ```

---

## 3. Market Surveillance & Compliance Endpoints

### 3.1 List Alerts
- **`GET /surveillance/alerts?status=OPEN&severity=CRITICAL`**
- **Roles:** `ANALYST`, `ADMIN`
- **Response (200 OK):** Array of alerts joined with pattern classification and subject trader.

### 3.2 Update Alert Status
- **`PUT /surveillance/alerts/:id/status`**
- **Roles:** `ANALYST`, `ADMIN`
- **Request Body:** `{ "status": "IN_REVIEW" }` // "OPEN" | "IN_REVIEW" | "RESOLVED" | "FALSE_POSITIVE"

### 3.3 Add Investigation Note
- **`POST /surveillance/alerts/:id/notes`**
- **Roles:** `ANALYST`, `ADMIN`
- **Request Body:** `{ "body": "Observed rapid 110ms cancel sequence on RELIANCE." }`

### 3.4 Full-Text Search on Notes
- **`GET /surveillance/notes/search?q=spoofing`**
- **Roles:** `ANALYST`, `ADMIN`
- **Response (200 OK):** Matching notes ranked by PostgreSQL `ts_rank`.

### 3.5 Run Real-Time Surveillance Window Scan
- **`POST /surveillance/evaluate`**
- **Roles:** `ANALYST`, `ADMIN`
- **Request Body:** `{ "accountId": 1003, "instrumentId": 1 }`
- **Response (201 Created):** Returns calculated 8-D feature vector, matched pattern, cosine similarity, and generated alert.

---

## 4. System & College Showcase Endpoints

### 4.1 Execute College Demonstration Queries
- **`GET /system/college-queries?q=4`**
- **Response (200 OK):**
  ```json
  {
    "selectedQuery": {
      "id": 4,
      "title": "Q4. Show executed trades with buyer and seller details and total traded notional",
      "sql": "SELECT t.trade_id, t.engine_seq, ins.symbol, ..."
    },
    "resultCount": 2,
    "rows": [...]
  }
  ```

### 4.2 System Health Diagnostics
- **`GET /system/health`**
- **Response (200 OK):** Uptime, database status (`alive: true`), memory footprint.
