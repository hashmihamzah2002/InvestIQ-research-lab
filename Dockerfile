# InvestIQ Research Lab — optional container image.
# Deliberately simple (full node_modules, `next start`) rather than a
# size-optimized standalone build: this is a self-hosted research tool, and
# keeping prisma + tsx in the image lets the container migrate/seed/refresh
# itself. See docs/DEPLOYMENT.md.
#
# Demo data is BAKED at build time (migrate + seed + mock refresh), so a
# fresh container serves a fully populated app in seconds — important on
# free hosts that cold-start on every wake (e.g. Render). The start command
# still self-heals: if the database is empty (e.g. a fresh compose volume
# mounted over /app/data-db), it reseeds before serving.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
ENV DATABASE_URL="file:/app/data-db/investiq.db"
RUN mkdir -p /app/data-db \
  && npx prisma migrate deploy \
  && npm run seed \
  && npm run refresh \
  && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data-db/investiq.db"

COPY --from=build /app ./

EXPOSE 3000
# Self-healing start: migrate (no-op on the baked DB), reseed only if the
# database is empty, then serve. `next start` binds $PORT when set (Render).
CMD ["sh", "-c", "npx prisma migrate deploy && (npx tsx scripts/db-has-data.ts || (npm run seed && npm run refresh)) && npm run start"]
