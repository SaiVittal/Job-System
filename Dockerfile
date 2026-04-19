# STAGE 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and config
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# STAGE 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Copy production dependencies only
COPY package*.json ./
RUN npm install --only=production

# Copy built files and prisma schema
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Export port for API (Worker doesn't need port)
EXPOSE 3000

# Entrypoint will be overridden in docker-compose.yml for Worker
CMD ["node", "dist/main"]
