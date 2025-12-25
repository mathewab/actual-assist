# Multi-stage build for single app
FROM node:20-alpine AS builder

LABEL org.opencontainers.image.title="Actual Assist" \
      org.opencontainers.image.description="AI-powered budgeting assistant for Actual Budget" \
      org.opencontainers.image.authors="mathewab" \
      org.opencontainers.image.vendor="mathewab" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/mathewab/actual-assist" \
      org.opencontainers.image.documentation="https://github.com/mathewab/actual-assist/blob/main/README.md" \
      maintainer="mathewab"

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY src ./src

RUN npm ci
RUN npm run build
RUN mkdir -p dist/server/infra/db/migrations \
  && cp src/infra/db/schema.sql dist/server/infra/db/ \
  && cp src/infra/db/migrations/*.cjs dist/server/infra/db/migrations/

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/server/server.js"]
