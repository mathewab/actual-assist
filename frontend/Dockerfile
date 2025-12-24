# Multi-stage build for frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files from root (npm workspaces)
COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm ci -w frontend

# Copy source code and configs
COPY frontend/tsconfig*.json ./frontend/
COPY frontend/vite.config.ts ./frontend/
COPY frontend/index.html ./frontend/
COPY frontend/src ./frontend/src

# Build Vite application
RUN npm run build -w frontend

# Production image with nginx
FROM nginx:alpine

# Copy built assets to nginx html directory
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
