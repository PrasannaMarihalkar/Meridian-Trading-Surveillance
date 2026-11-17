# MERIDIAN — Production Containerfile
FROM node:22-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git curl

# Install app dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build frontend bundle and verify database scripts
RUN npm run build:frontend

# Non-root user permissions hardening
RUN chown -R node:node /app
USER node

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/api/system/health || exit 1

CMD ["npm", "start"]
