# MERIDIAN — SECURITY ARCHITECTURE & THREAT MODEL

**Institution:** PES University, Department of Computer Science and Engineering  
**Project:** MERIDIAN: High-Performance Order Matching Engine and Surveillance Platform  
**Status:** Audited & Verified  

---

## 1. Security Philosophy & Principles

Security is treated as a fundamental architectural requirement across all tiers:
1. **Defense in Depth:** Validation and authorization enforced on the client, API gateway, service logic, and database constraint layers.
2. **Principle of Least Privilege:** Fine-grained Role-Based Access Control (RBAC) separating market makers (`TRADER`), compliance officers (`ANALYST`), and operations (`ADMIN`).
3. **Fail-Closed Pre-Trade Filters:** Any order submission that fails price-collar, quantity, notional, or cash checks is rejected before touching the matching engine.
4. **Audit Immutability:** State transitions across orders, alerts, and positions generate timestamped, append-only records in `audit_log`.

---

## 2. Authentication & Credential Protection

### 2.1 Password Storage
- Passwords are never stored in plaintext.
- Stored using **Bcrypt with 10 salt rounds** (computationally resistant to rainbow table and GPU brute-force attacks).
- Argon2id compatibility supported via identical modular service interface.

### 2.2 Brute-Force Defense & Lockouts
- Consecutive failed login attempts are tracked per user in `users.failed_logins`.
- Upon 5 consecutive failed attempts, the account is automatically locked for 15 minutes (`users.locked_until = NOW() + INTERVAL '15 minutes'`).
- Successful authentication resets `failed_logins` to 0 and updates `last_login_at`.

### 2.3 Session & Token Management
- Authenticated sessions issue cryptographically signed **JSON Web Tokens (JWT)** with 12-hour expiration.
- Every login records a corresponding tracking entry in `sessions` with client IP address and user-agent string for forensic auditing.

---

## 3. Role-Based Access Control (RBAC) Matrix

| Endpoint / Capability | TRADER | ANALYST | ADMIN | Rationale |
|---|:---:|:---:|:---:|---|
| Place Order / Cancel Order | ✅ (Own account only) | ❌ | ❌ | Analysts and Admins cannot trade to avoid conflict of interest. |
| View Own Orders & Positions | ✅ | ❌ | ❌ | Traders cannot view competing traders' inventory. |
| View Level 2 Order Book & Trades | ✅ | ✅ | ✅ | Public market data feed accessible to all authenticated participants. |
| View Surveillance Alerts | ❌ | ✅ | ✅ | Compliance sensitive; concealed from traders under monitoring. |
| Assign Alert / Update Alert Status | ❌ | ✅ | ✅ | Operational compliance workflow. |
| Add Investigation Notes | ❌ | ✅ | ✅ | Regulatory annotations reserved for compliance personnel. |
| Full-Text Search Notes | ❌ | ✅ | ✅ | Restricted to compliance and auditing officers. |
| Update Risk Limits | ❌ | ❌ | ✅ | Pre-trade risk parameters strictly governed by system administrators. |
| View Full Audit Log | ❌ | ✅ | ✅ | Comprehensive audit discovery. |

---

## 4. Threat Vector Mitigations

| Threat Vector | Mitigation Strategy | Verification Result |
|---|---|---|
| **SQL Injection (SQLi)** | 100% of database queries use parameterized placeholders (`$1`, `$2`). Dynamic string concatenation of user inputs into SQL strings is forbidden. | Verified across all services and routes. |
| **Price Collar Abuse (Fat Finger / Flash Crash)** | Pre-trade risk filter rejects any limit order deviating by $> 5\%$ from the instrument's reference benchmark price. | Verified in `tests/api.test.ts` (Test 4). |
| **Inventory Over-Allocation** | System checks `max_order_qty` and `max_position_qty` prior to matching. Database `CHECK (quantity > 0)` and `CHECK (filled_qty <= quantity)` enforce physical invariants. | Verified in `tests/api.test.ts` (Test 3). |
| **Cross-Site Scripting (XSS)** | React JSX automatically escapes dynamic values prior to DOM insertion; sensitive headers configured on Express. | Verified in frontend components. |
| **Horizontal Privilege Escalation** | Traders attempting to submit or cancel orders for another trader's account are rejected with `403 Forbidden` (`req.user.accountId !== validated.accountId`). | Verified in `orderRoutes.ts`. |
| **Credential Leakage** | `.env` credentials excluded via `.gitignore`; public repo contains only `.env.example` with zero secrets. | Verified in Git tracking. |

---

## 5. Remaining Production Limitations

1. **Hardware Security Module (HSM):** In an institutional production environment, JWT signing keys should reside in an HSM or AWS KMS rather than an environment variable.
2. **TLS Termination:** HTTPS and WSS certificates are handled at the reverse-proxy layer (e.g., NGINX, Cloudflare, or AWS ALB) in production.
3. **Mutual TLS (mTLS):** Production exchange gateways typically require client-side certificate authentication (mTLS) for high-frequency direct market access (DMA).
