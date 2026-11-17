---
name: meridian-release
description: Procedures for release readiness audits, GitHub release packaging, academic viva presentation defense, and production deployment verification for MERIDIAN.
---

# MERIDIAN Release & Presentation Skill

This skill guides engineers and automated agents through preparing, auditing, and publishing official releases of **MERIDIAN**, as well as preparing for academic evaluation and technical viva defense.

---

## 1. Pre-Release Verification Gate

Before tagging an official release candidate (e.g., `v1.1.0`), all 6 release gates must be passed:

1. **Gate 1: Verification Suite Clean:** All checks in `meridian-verification` pass (tsc, lint, api.test.ts, test_ob, ASan/UBSan, demo queries).
2. **Gate 2: GitHub Actions Green:** Latest remote push has green checkmarks across all 10 jobs (`ci-gate` succeeded).
3. **Gate 3: Secret Scan Zero-Leak:** TruffleHog full-history scan confirms 0 leaks across all commits.
4. **Gate 4: Documentation Synchronized:** `README.md`, `docs/ARCHITECTURE.md`, and `docs/DATA_DICTIONARY.md` match actual code implementation with zero unverified claims.
5. **Gate 5: Acceptance Matrix 100% Satisfied:** Every requirement in `docs/engineering/ACCEPTANCE_MATRIX.md` is marked `VERIFIED PASS`.
6. **Gate 6: Clean Git State:** Working tree is clean, untracked files are resolved, and branches are synchronized with `origin/main`.

---

## 2. Academic Viva & College Showcase Defense

When presenting MERIDIAN to academic evaluators (PES University DBMS Level 3 Faculty Evaluator Dr. Nagasundari S) or technical interviewers, structure the defense using the following key architectural pillars:

### Pillar 1: Relational Database Modeling (Level 3 Mastery)
- **17 Entities in Boyce-Codd Normal Form (BCNF):** Explain that every non-trivial functional dependency $X \to Y$ has $X$ as a superkey. Eliminates insertion, update, and deletion anomalies.
- **Double-Entry Settlement:** Every executed trade atomically produces exactly 1 BUY fill and 1 SELL fill in `fills`, enforced by `UNIQUE(trade_id, side)`.
- **Database Triggers for ACID Integrity:**
  - `trg_fills_settlement`: Automatically executes cash debits/credits and updates weighted average position costs upon fill insertion.
  - `trg_audit_log_immutable`: Rejects any `UPDATE` or `DELETE` on the audit log, creating a cryptographically defensible immutable audit trail.
- **Full-Text Search:** Case investigator notes indexed using PostgreSQL `tsvector` and GIN index for rapid keyword discovery.

### Pillar 2: Systems Programming & C++ Matching Engine
- **Price-Time Priority (FIFO Continuous Auction):** Bids sorted descending (`price DESC, time ASC`), asks sorted ascending (`price ASC, time ASC`).
- **Fixed-Point Arithmetic:** Prices represented as 64-bit signed integers (`Price` scaled by 10,000) to eliminate IEEE 754 floating-point rounding errors in trade settlement.
- **Lock-Free Concurrency:** Single-Producer Single-Consumer (SPSC) circular queue with atomic head/tail pointers aligned to 64-byte cache boundaries (`alignas(64)`) to eliminate false sharing.

### Pillar 3: Market Surveillance & Vector Cosine Similarity
- **8-Dimensional Behavioral Feature Vector:** Extracts order cancel ratio, quote-to-trade ratio, median lifetime, size skew, message rate, book imbalance impact, opposite fill ratio, and layering depth.
- **Stored Vector Cosine Similarity (`fn_cosine_similarity`):** Computes normalized Euclidean dot products against seeded manipulation patterns (Spoofing/Layering, Quote Stuffing, Wash Trading, Momentum Ignition).
- **Compliance Workflow:** Live alert streaming over WebSockets, state transitions (`OPEN` -> `INVESTIGATING` -> `CONFIRMED_ABUSE` / `DISMISSED`), and full audit logging.

---

## 3. GitHub Release Publishing Protocol

1. **Tagging Convention:** Semantic versioning (`vMAJOR.MINOR.PATCH`).
   ```bash
   git tag -a v1.1.0 -m "Release v1.1.0: C++ engine IPC integration, IOC defect fix, and hardened CI pipeline"
   git push origin v1.1.0
   ```
2. **Release Notes Format:**
   - Highlights and key features
   - Detailed changelog categorized by `Added`, `Fixed`, `Changed`, `Security`
   - Verified performance benchmarks
   - Reproducibility instructions (`git clone`, `npm ci`, `npm test`, `npm run demo:queries`)
3. **Asset Packaging:**
   - Pre-built frontend bundle (`frontend/public/bundle.js`)
   - Standalone C++ engine binary where applicable
   - SQL schema migration bundle (`database/sql/`)
