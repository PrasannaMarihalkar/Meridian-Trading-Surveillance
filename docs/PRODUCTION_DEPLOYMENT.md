# MERIDIAN Production Deployment Guide

**Project:** MERIDIAN: High-Performance Order Matching Engine with Multi-Paradigm Persistence and Market Surveillance  
**Institution:** PES University, Department of Computer Science & Engineering  
**Lead Engineer:** Prasanna Marihalkar (`PES1UG24CS684`)  
**Date:** November 17, 2026  
**Status:** **DEPLOYMENT READY**

---

## 1. Hosting Provider Evaluation Matrix

To determine the ideal hosting strategy for MERIDIAN's real-time trading and surveillance stack, four deployment architectures were evaluated:

| Evaluation Criteria | Railway | Render | Fly.io | Cloud VPS (Hetzner / DigitalOcean) |
|---|:---:|:---:|:---:|:---:|
| **WebSocket Support** | Native, persistent WS connections | Supported, but free tier spins down after 15m inactivity | Native, low-latency edge proxy | Full control over Nginx/Caddy WS proxy |
| **Database Flexibility** | Managed Postgres 16 or embedded PGlite | Managed Postgres or embedded PGlite | Persistent volume required for PGlite | Persistent SSD volume / native PG |
| **Containerization** | `Dockerfile` & `docker-compose` | `Dockerfile` | `fly.toml` + `Dockerfile` | Docker Compose / systemd |
| **C++ Toolchain Build** | Builds multi-stage Alpine/Ubuntu seamlessly | Multi-stage Docker supported | Multi-stage Docker supported | Native GCC 13+ installation |
| **India Region Availability** | Asia-South (Singapore / India routing) | Singapore / Frankfurt / Oregon | `bom` (Mumbai) region available | Bangalore / Mumbai data centers |
| **Free Tier / Trial** | \$5 trial / usage-based credits | Free tier available (cold starts) | Pay-as-you-go with hobby allowances | Flat \$4–\$6 / month |
| **Operational Simplicity** | **Highest (1-click Git push)** | High (Git push) | Medium (CLI driven) | Low (manual server admin) |

### Recommendation: **Railway or Fly.io (Mumbai Region)**
- **Why Railway:** The single-process Node.js architecture with embedded PGlite can be deployed directly from the GitHub repository with zero configuration. WebSocket streams stay live without aggressive cold-start idling.
- **Why Fly.io:** Provides the `bom` (Mumbai) edge location, minimizing latency for Bangalore / PES University evaluators.

---

## 2. Production Docker Architecture

The project includes an optimized multi-stage `Dockerfile`:

```dockerfile
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++ git
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:frontend

EXPOSE 4000
ENV PORT=4000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

CMD ["npm", "start"]
```

---

## 3. Production Environment Configuration

When deploying to a public cloud provider, the following environment variables must be defined:

```bash
# Core Server Configuration
PORT=4000
NODE_ENV=production
CORS_ORIGIN=https://your-meridian-domain.up.railway.app

# Cryptographic Security (CRITICAL: Must be a random 64-char hex string)
JWT_SECRET=c2e8a109f583e74b2190847c94318765db8021947e248b105f9c4021748201fa

# Database Selection
# Omit DATABASE_URL to use embedded zero-config PGlite (persisted to volume)
# Or supply native PostgreSQL connection string:
# DATABASE_URL=postgresql://meridian_user:secure_password@postgres.railway.internal:5432/meridian_db

# Engine Concurrency Mode
USE_CPP_ENGINE=false
```

---

## 4. Deployment Procedure (Step-by-Step)

### Option A: 1-Click Railway Deployment
1. Connect your GitHub account at `railway.app`.
2. Click **New Project** → **Deploy from GitHub repo** → Select `meridian`.
3. Under **Variables**, add:
   - `NODE_ENV=production`
   - `JWT_SECRET=<generated_secret>`
4. Railway detects the `Dockerfile` automatically, installs dependencies, bundles the React frontend, and starts the server on port 4000.
5. Under **Settings**, click **Generate Domain** (e.g., `meridian-production.up.railway.app`).

### Option B: Docker Compose Local/VPS Deployment
```bash
# Clone repository
git clone https://github.com/PrasannaMarihalkar/meridian.git
cd meridian

# Launch orchestrated containers
docker-compose up -d --build

# Verify container health
docker ps
curl http://localhost:4000/api/health
```

---

## 5. Post-Deployment Verification Checklist

Once the public domain responds:

1. **HTTPS & API Health:**
   ```bash
   curl -i https://<YOUR_DOMAIN>/api/health
   # Expected: HTTP 200 OK, { "status": "HEALTHY", "database": { "alive": true } }
   ```
2. **WebSocket Telemetry Stream:**
   Connect via a WebSocket client (or observe the browser terminal):
   `wss://<YOUR_DOMAIN>/ws` → Must receive `CONNECTION_ACK`.
3. **Trader Order Placement:**
   Authenticate as `prasanna_trader` and submit a limit buy order. Confirm it appears on the L2 book ladder.
4. **Surveillance Alert Generation:**
   Trigger a compliance scan from the Surveillance Console and verify an alert is created and persisted across page refreshes.

---

## 6. Disaster Recovery & Rollback Procedure

- **Application Rollback:** In Railway/Render dashboard, select the previous successful deployment and click **Rollback**.
- **Database Backup:** Run daily tarballs of `database/pgdata/` or execute `pg_dump` when connected to native PostgreSQL.
