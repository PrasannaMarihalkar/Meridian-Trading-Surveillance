# MERIDIAN — PRODUCTION DEPLOYMENT & RUNBOOK

**Target Environment:** Local Workstation / Docker Compose / Cloud PaaS (Render, Railway, Fly.io)  
**Platform:** MERIDIAN Trading Core & Market Surveillance  

---

## 1. Quick Local Start (Single-Command Run)

MERIDIAN is configured with an embedded PostgreSQL engine (PGlite) that requires zero manual database setup or external daemons:

```bash
# 1. Clone or navigate to the repository
cd scratch/meridian

# 2. Install dependencies (Node.js 18+)
npm install

# 3. Initialize and seed database (creates 17 tables and loads deterministic seeds)
npm run db:init

# 4. Build the frontend client distribution
npm run build:frontend

# 5. Launch full-stack platform (API + WebSockets + Web Portal on port 4000)
npm start
```
Access the application at: **`http://localhost:4000`**

---

## 2. Docker & Containerized Deployment

A production-ready `Dockerfile` and `docker-compose.yml` are provided in the repository root.

### Running with Docker Compose:
```bash
# Build and launch multi-container stack (PostgreSQL 16 + MERIDIAN Core)
docker-compose up --build -d

# Check service health
docker-compose ps
curl http://localhost:4000/api/system/health
```

### Environment Variables (`.env`):
```env
PORT=4000
NODE_ENV=production
JWT_SECRET=your-256-bit-production-secret-here
# Optional: if omitted, MERIDIAN defaults to embedded zero-config PostgreSQL (PGlite)
DATABASE_URL=postgresql://meridian_user:meridian_password@localhost:5432/meridian_db
```

---

## 3. Production Deployment Guide (Render / Railway / Fly.io)

### Step 1: Managed Database Provisioning
1. Provision a PostgreSQL 16+ database instance on your chosen cloud provider.
2. Ensure the database connection URL is formatted as:
   `postgresql://<user>:<password>@<host>:<port>/<dbname>`

### Step 2: Web Service Deployment
1. Connect your Git repository to Render, Railway, or Fly.io.
2. Set Build Command: `npm install && npm run build:frontend && npm run db:init`
3. Set Start Command: `npm start`
4. Configure Environment Variables:
   - `DATABASE_URL`: Your managed PostgreSQL connection string.
   - `JWT_SECRET`: Random 64-character hexadecimal string.
   - `NODE_ENV`: `production`

### Step 3: Health Probe & Smoke Testing
Confirm the deployment status:
```bash
curl -I https://your-meridian-app.onrender.com/api/system/health
```
Expected HTTP `200 OK` response with `status: "HEALTHY"`.
