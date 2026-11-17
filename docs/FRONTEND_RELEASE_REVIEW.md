# MERIDIAN Frontend — Production UI/UX Review & Polish Report

**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Institution:** PES University, Department of Computer Science & Engineering  
**Course:** DBMS Experiential Learning — Level 3 (Dr. Nagasundari S)  
**Lead Engineer:** Prasanna Marihalkar (`PES1UG24CS684`)  
**Date:** November 17, 2026  
**Status:** **AUDITED & POLISHED**

---

## 1. Component Architecture & Visual System

MERIDIAN's user interface is built on **React 18**, **TypeScript 5.7**, and **Tailwind CSS**, pre-compiled into an optimized bundle using **esbuild**. It implements an institutional Bloomberg/Refinitiv-style terminal with high information density, dark-slate background (`bg-slate-950`), and consistent financial typography.

| Component | Source Path | Key Responsibilities |
|---|---|---|
| **`App.tsx`** | `frontend/src/App.tsx` | Master application frame, persistent header, simulation banner, WebSocket connection state, role badge, navigation tab switcher, mobile responsive drawer. |
| **`TradingTerminal.tsx`** | `frontend/src/components/TradingTerminal.tsx` | Instrument selection ticker, Level 2 price-time depth ladder with visual volume bars, order entry ticket (LIMIT/MARKET/IOC), price collar guards, order blotter, trade blotter, portfolio holdings. |
| **`SurveillanceConsole.tsx`** | `frontend/src/components/SurveillanceConsole.tsx` | Compliance investigation console, live alert queue, 8-D behavioral radar/bar statistics, cosine vector similarity match against known patterns (spoofing, layering), chronological investigator case notes, case status transitions. |
| **`SystemAudit.tsx`** | `frontend/src/components/SystemAudit.tsx` | System health telemetry, PGlite memory profile, high-watermark stream sequence offsets, immutable audit log table with JSON state transition deltas (`old_data → new_data`). |
| **`CollegeShowcase.tsx`** | `frontend/src/components/CollegeShowcase.tsx` | PES University academic evaluation tab, Chen ER model viewer, 3NF/BCNF data dictionary, interactive SQL query runner for all 17 college demonstration queries. |
| **`AuthModal.tsx`** | `frontend/src/components/AuthModal.tsx` | Multi-role authentication modal with credential login and 1-click persona switching (`TRADER`, `ANALYST`, `ADMIN`, `RISK_OFFICER`). |

---

## 2. Browser Verification & Evidence

Automated subagent browser testing was conducted against the live application at `http://localhost:4000`:

1. **Header & Live Telemetry:**
   - Platform title rendered cleanly: `MERIDIAN v1.0.0 · Trading Core & Market Surveillance`.
   - Feed connection status indicator displays green pulsing `LOB FEED LIVE` badge.
   - Simulation banner active: `⚠️ SIMULATED TRADING ENVIRONMENT — Demonstration & Academic Learning Lab (PES University Level 3). No Real Capital at Risk.`
2. **Trader Authentication Flow:**
   - Authenticated as `prasanna_trader` (`TRADER` role).
   - Trader badge and cash balance (₹9,859,750.00) displayed accurately.
3. **Pre-Trade Risk Collar Enforcement:**
   - Attempted limit order on INFY at ₹1400 (exceeding 5% collar from ₹1500 reference price).
   - Client rejected immediately with visual risk warning: `Price Collar Deviation: 6.67% EXCEEDS 5% LIMIT`.
4. **Order Placement & L2 Book Depth:**
   - Placed compliant limit order on INFY at ₹1490 (Qty: 5).
   - Order appeared instantaneously on L2 bid ladder with visual depth bars and in the active blotter with an interactive cancel button.
5. **Surveillance & Investigation:**
   - Inspected Case File #8001 (Rapid Spoofing & Cancellation, Severity: CRITICAL, 97.9% Cosine Match).
   - 8-D feature metrics and investigator audit commentary rendered with chronological sorting.
   - Executed live scan as analyst, raising Alert #8006 in real-time.
6. **College Showcase Live Queries:**
   - Evaluator banner displays Dr. Nagasundari S and Prasanna Marihalkar (`PES1UG24CS684`).
   - Executed Query Q1 (User Directory) and Q6 (Positions & Portfolio) live, rendering structured tabular outputs.

---

## 3. Responsive Design & Multi-Device Testing

The UI layout adapts fluidly across all four standard viewport breakpoints:

| Viewport | Dimensions | Layout Adaptation & Behavior | Status |
|:---:|:---:|---|:---:|
| **Mobile** | `360 × 640` | Top header collapses into compact logo and user pill. Dedicated horizontal scroll tab bar activates. Order entry ticket and L2 ladder stack vertically without horizontal page clipping. | **PASS** |
| **Tablet** | `768 × 1024` | Order ticket and L2 depth ladder display side-by-side. Blotters occupy full width with internal table scrolling. | **PASS** |
| **Laptop** | `1024 × 768` | 12-column grid active: 5 columns dedicated to order ticket and L2 ladder; 7 columns dedicated to multi-tab blotter. | **PASS** |
| **Desktop** | `1440 × 900` | Full widescreen institutional density. All metrics, ticker bars, depth ladders, and portfolio holdings visible simultaneously without unnecessary scrolling. | **PASS** |

---

## 4. Financial Precision & Locale Formatting

- **Currency:** Strictly formatted with the Indian Rupee symbol (`₹`) and 2 fixed decimal places (e.g., `₹1,490.00`).
- **Quantities:** Integer lots formatted with comma separators (e.g., `5,000`).
- **P&L Visuals:** Green typography (`text-emerald-400`) for positive returns, red (`text-rose-400`) for negative drawdowns.
- **Percentages:** Formatted to 2 decimal places with sign prefixes (e.g., `+2.45%`).

---

## 5. UI Polish & Defensive Enhancements Applied

1. **Simulated Trading Banner:** Added non-intrusive amber disclaimer to prevent any confusion regarding real-money operations during college demonstrations.
2. **Mobile Navigation Drawer:** Added dedicated overflow tab bar for viewport widths under 768px, ensuring complete feature accessibility on mobile devices.
3. **Empty State Messaging:**
   - Order Blotter: Displays `No active orders in blotter` when working queue is clear.
   - Trade Blotter: Displays `No executed trades in current session`.
   - L2 Order Book: Displays `No bids on book` / `No asks on book` with subtle placeholder framing.
4. **Contrast & Accessibility:** Dark slate palettes (`slate-950` background, `slate-900` cards, `slate-800` borders) provide WCAG AA compliant contrast (> 4.5:1) for all critical price and volume indicators.
