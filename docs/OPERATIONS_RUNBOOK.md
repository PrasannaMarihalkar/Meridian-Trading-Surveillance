# MERIDIAN Operations Runbook

**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Institution:** PES University, Department of Computer Science & Engineering  
**Lead Engineer:** Prasanna Marihalkar (`PES1UG24CS684`)  
**Date:** November 17, 2026  

---

## 1. Quick Start & Service Management

### 1.1 Start Full-Stack Application
```bash
# Install dependencies
npm install

# Start development / demonstration server (port 4000)
npm start
```
The server automatically boots the embedded PostgreSQL engine (PGlite), executes schema checks, and listens on `http://localhost:4000` with WebSocket on `ws://localhost:4000/ws`.

### 1.2 Health Check & Telemetry
```bash
curl http://localhost:4000/api/health
```
Expected output:
```json
{
  "status": "HEALTHY",
  "service": "MERIDIAN Trading & Surveillance Core",
  "version": "1.0.0",
  "database": {
    "alive": true,
    "engine": "Embedded PostgreSQL (PGlite)"
  },
  "uptime_seconds": 124.5
}
```

---

## 2. Test Execution Procedures

### 2.1 Backend End-to-End Integration Suite
```bash
npm test
# Or directly:
npx tsx tests/api.test.ts
```
Executes all 9 automated test suites verifying account provisioning, session invalidation, pre-trade risk filters, matching, settlement triggers, order cancellation, surveillance cosine matching, and full-text search.

### 2.2 C++ Matching Engine Unit & Concurrency Tests
```bash
# Using WSL (Ubuntu) or native Linux:
g++ -std=c++20 -O3 -pthread -Iengine/include engine/src/order_book.cpp engine/tests/test_order_book.cpp -o test_order_book
./test_order_book
```
Verifies price-time priority, FIFO queue order, IOC order residual cancellation, 100,000-message SPSC queue concurrency, and UDP sequence gap detection.

### 2.3 C++ Matching Engine Throughput Benchmark
```bash
g++ -std=c++20 -O3 -pthread -Iengine/include engine/src/order_book.cpp engine/benchmarks/benchmark_engine.cpp -o benchmark_engine
./benchmark_engine
```

### 2.4 C++ IPC Bridge Integration Test
```bash
npx tsx tests/cpp_bridge.test.ts
```
Verifies bidirectional line-protocol communication across the Node.js to C++ child process boundary.

### 2.5 College Demonstration Queries (Q1 — Q17)
```bash
npm run demo:queries
```
Executes all 17 official demonstration queries against the database and prints formatted tables.

---

## 3. Data Reset & Seeding Procedures

If demo data needs to be restored to clean baseline state without touching raw files:
```bash
# Re-initialize and seed database
npm run db:init
```

---

## 4. Troubleshooting Common Issues

| Symptom | Probable Cause | Corrective Action |
|---|---|---|
| `Port 4000 already in use` | Previous node process still running in background | Run `netstat -ano \| findstr :4000` and kill the PID via `taskkill /F /PID <PID>` |
| `WSL: command not found` | WSL not active or distro stopped | Start WSL via `wsl --status` or run Node in pure TypeScript matching mode |
| `ThreadSanitizer ASLR error on WSL2` | Linux 6.6 kernel address space randomization limit | Run TSan binary with ASLR disabled: `setarch x86_64 -R ./test_tsan` |
| `Database Locked` | Concurrent access to same PGlite directory | Stop other node instances accessing `database/pgdata/` |
