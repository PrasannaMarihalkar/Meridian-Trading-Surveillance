# MERIDIAN — Multi-Stage Production Containerfile
# Stage 1: Build & bundle frontend
FROM node:22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache python3 make g++ git

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:frontend

# Stage 2: Production runner
FROM node:22-alpine AS runner

WORKDIR /app
RUN apk add --no-cache curl
ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/database ./database
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN chown -R node:node /app
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/api/system/health || exit 1

CMD ["npm", "start"]
