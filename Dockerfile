# MERIDIAN — Production Containerfile
FROM node:20-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Install app dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build frontend bundle and verify database scripts
RUN npm run build:frontend

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

CMD ["npm", "start"]
