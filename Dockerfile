# Multi-stage build for single app
FROM node:24-bookworm-slim AS builder

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

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npm ci
RUN npm run build
RUN npm prune --omit=dev
RUN mkdir -p dist/server/infra/db/migrations \
  && cp src/infra/db/schema.sql dist/server/infra/db/ \
  && cp src/infra/db/migrations/*.cjs dist/server/infra/db/migrations/

FROM gcr.io/distroless/nodejs24-debian12

WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
VOLUME ["/app/data"]

EXPOSE 3000

ENV NODE_ENV=production

CMD ["dist/server/server.js"]
