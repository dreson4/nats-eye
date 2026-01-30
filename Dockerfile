# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source files
COPY . .

# Build the frontend
RUN bun run build

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy server files
COPY server ./server

# Create data directory for SQLite
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Run the server
CMD ["bun", "run", "server/index.ts"]
