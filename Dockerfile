# InvestIQ Research Lab — optional container image.
# Deliberately simple (full node_modules, `next start`) rather than a
# size-optimized standalone build: this is a self-hosted research tool, and
# keeping prisma + tsx in the image lets the container migrate/seed/refresh
# itself. See docs/DEPLOYMENT.md.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
ENV DATABASE_URL="file:/app/data-db/build.db"
RUN mkdir -p /app/data-db \
  && npx prisma migrate deploy \
  && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data-db/investiq.db"

COPY --from=build /app ./
RUN rm -rf /app/data-db && mkdir -p /app/data-db

EXPOSE 3000
# First start: migrate, seed, and load data if the volume is empty; then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && npm run refresh && npm run start"]
