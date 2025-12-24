# Multi-stage build for backend
FROM node:20-alpine AS builder

# Metadata labels
LABEL org.opencontainers.image.title="Actual Assist Backend" \
      org.opencontainers.image.description="AI-powered budgeting assistant for Actual Budget" \
      org.opencontainers.image.authors="mathewab" \
      org.opencontainers.image.vendor="mathewab" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/mathewab/actual-assist" \
      org.opencontainers.image.documentation="https://github.com/mathewab/actual-assist/blob/main/README.md" \
      maintainer="mathewab"

WORKDIR /app

# Copy package files from root (npm workspaces)
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci -w backend

# Copy source code
COPY backend/tsconfig.json ./
COPY backend/src ./src

# Build TypeScript
RUN npm run build -w backend

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps only
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci -w backend --omit=dev

# Copy built application
COPY --from=builder /app/dist ./dist

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Run application
CMD ["node", "dist/server.js"]
