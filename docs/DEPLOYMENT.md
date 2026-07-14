# Deployment guide

InvestIQ is a single-user research tool by design. The recommended "deployment"
is local (`npm run dev` or a local production build). Everything below covers
running it elsewhere — with one warning up front:

> **No authentication exists in v1.** The Admin page can trigger refreshes and
> import CSVs, and API routes are open. Do not expose the app to the public
> internet without putting auth in front of it (reverse-proxy basic auth at
> minimum, real auth per the roadmap).

## 1. Local production build

```bash
npm run build
npm run start        # serves on :3000 against ./dev.db
```

Pages are `force-dynamic`: nothing data-driven is baked at build time, so the
build machine's database contents don't matter (it only needs the file to
exist — migrations create it).

## 2. Docker (optional)

```bash
docker compose up --build
```

- App on <http://localhost:3000>; the SQLite database lives on the
  `investiq-db` named volume and survives rebuilds.
- First container start runs migrate → seed → refresh automatically.
- Scheduled updates: run the one-shot job from host cron / Task Scheduler:
  `docker compose run --rm refresher`
- Provider keys: put them in a `.env` file next to `docker-compose.yml`
  (compose passes them through).

The image intentionally ships full `node_modules` (not Next standalone) so the
container can run prisma/tsx for migrations and refreshes — simplicity over
image size for a self-hosted tool. Demo data is baked at image-build time
(deterministic mock refresh), so containers boot in seconds; the start command
reseeds only when it finds an empty database (e.g. a fresh compose volume).

## 2a. One-click public demo on Render (free tier)

`render.yaml` in the repo root is a Render blueprint tuned for a portfolio
demo:

1. Open
   <https://render.com/deploy?repo=https://github.com/hashmihamzah2002/InvestIQ-research-lab>
   and sign in (GitHub SSO). Approve access to the repository.
2. Render reads `render.yaml` → one free web service, Docker runtime,
   **DEMO_MODE=1** preset. Click **Apply/Deploy** and wait for the first
   image build (~5-10 minutes; it runs migrate + seed + mock refresh + the
   Next build).
3. The service URL (e.g. `https://investiq-research-lab.onrender.com`) is the
   shareable demo link.

What DEMO_MODE=1 does: hides Admin from the navigation, replaces `/admin`
with a "disabled on this demo" notice, and returns 403 from every
`/api/admin/*` route (refresh triggers, CSV imports) before any work happens.
Visitor watchlist/portfolio edits still work but live on an ephemeral disk
that resets at each deploy — stated on the lock page.

Free-tier realities: the instance sleeps after ~15 idle minutes (first visit
afterwards takes a few seconds thanks to baked data — no reseeding on boot),
and 512MB RAM is enough for browsing but a long backtest under concurrent
load may be slow.

**Keeping the demo fresh (optional):** the daily GitHub Actions workflow can
rebuild the demo every night so the baked snapshot and its freshness stamp
never go stale: in Render, copy the service's **Deploy Hook** URL
(Settings → Deploy Hook), then add it as the `RENDER_DEPLOY_HOOK` repository
secret on GitHub. Without it, the demo simply shows its build date and the
staleness banner after 36h — honest, but less polished.

## 3. Switching to PostgreSQL

SQLite is the default because it needs zero setup on Windows. The schema was
written to be portable (no Prisma enums, JSON stored in String columns), so
the switch is mechanical:

1. In `prisma/schema.prisma`, change the datasource:
   ```prisma
   datasource db {
     provider = "postgresql"
   }
   ```
2. Point `DATABASE_URL` at your server, e.g.
   `postgresql://user:pass@localhost:5432/investiq`.
3. Swap the driver adapter in `src/lib/db/client.ts`:
   ```bash
   npm install @prisma/adapter-pg
   ```
   ```ts
   import { PrismaPg } from "@prisma/adapter-pg";
   const adapter = new PrismaPg({ connectionString: url });
   ```
4. Recreate migrations for the new provider (existing ones are SQLite SQL):
   delete `prisma/migrations/`, then `npx prisma migrate dev --name init-postgres`.
5. `npm run seed && npm run refresh`, and update `tests/helpers/test-db.ts`
   if you want the integration suite to run against Postgres (it currently
   builds scratch SQLite files by executing the committed migration SQL).

Step 5 is why Postgres is a *documented path* rather than a checkbox — budget
an hour, not five minutes.

## 4. Scheduled refreshes

| Where the app lives | How to schedule |
|---|---|
| Your machine | Windows Task Scheduler / cron → `npm run refresh` (see SETUP_WINDOWS.md) |
| GitHub only (demo) | `.github/workflows/daily-update.yml` — weekday runs, uploads the refreshed SQLite artifact; add provider secrets for real data |
| VPS / container | host cron → `docker compose run --rm refresher` (or `npm run refresh` in the app directory) |
| Serverless (Vercel etc.) | Not recommended for v1: SQLite needs a persistent disk and the background "Run refresh now" endpoint needs a long-lived process. Postgres + an external scheduler hitting a hardened refresh endpoint would be the v2 shape. |

The refresh CLI exits 0 on SUCCESS *and* PARTIAL (a degraded refresh must not
fail the schedule) and 1 only when everything failed.

## 5. GitHub Actions setup

1. Push the repo to GitHub (`git remote add origin … && git push -u origin main`).
2. **CI** runs on every push/PR: lint → typecheck → tests → production build.
3. **Daily refresh** needs no configuration for mock mode. For real data, add
   repository secrets: `SEC_EDGAR_USER_AGENT` (recommended, free),
   `FRED_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `FINNHUB_API_KEY`, `FMP_API_KEY` —
   any subset works; missing ones just disable those adapters.

## 6. Environment reference

See `.env.example` — every variable is documented there. The app boots with
an empty environment: every provider setting is optional and chains fall back
to the deterministic mock.
