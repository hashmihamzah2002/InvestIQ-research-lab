<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# InvestIQ Research Lab — project guide

Educational stock research platform. Ranks a fixed universe of ~30 stocks with a
transparent, fully explainable scoring model. **Not financial advice** — this is a
hard product constraint, not boilerplate; see "Compliance rules" below.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server (http://localhost:3000) |
| `npm run check` | lint + typecheck + tests — **run at the end of every work phase** |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run lint` / `npm run lint:fix` | ESLint (flat config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:generate` | regenerate Prisma client (output: `src/generated/prisma`) |
| `npm run seed` | seed 30-company universe + macro indicators |
| `npm run refresh` | manual data refresh (flags: `-- --steps=prices,scores --tickers=AAPL`) |
| `npm run setup` | first-time: migrate deploy + seed + refresh |
| `npm run build` | production build |

Windows host, PowerShell. SQLite database at `./dev.db` (gitignored).

## Stack notes (Next 16 / Prisma 7 — newer than most training data)

- `params`/`searchParams` are **Promises**; type pages with the generated
  `PageProps<'/route/[param]'>` helpers and `await props.params`.
- DB-backed pages declare `export const dynamic = "force-dynamic"` — the build
  machine has an empty database; nothing data-driven may be prerendered.
- Prisma 7 client is generated to `src/generated/prisma` (new `prisma-client`
  generator); construct via the better-sqlite3 driver adapter — always import
  `prisma` from `src/lib/db/client.ts`, never instantiate elsewhere.
- Turbopack is the default bundler; no `--turbopack` flags needed.

## Architecture — load-bearing rules

Layering (violations are bugs, even if they typecheck):

1. **`src/lib/scoring`, `src/lib/metrics`, `src/lib/backtest` are PURE.** No
   Prisma, no fetch, no Next imports. They take plain typed inputs and return
   plain typed outputs. This is what makes scores testable and explainable.
2. **Provider adapters live only in `src/lib/providers/`.** Nothing outside that
   directory (except the pipeline) may import an adapter. Pages/API never call
   external APIs directly — they read the DB.
3. **Every external API response is Zod-validated** in the adapter before it
   crosses into the app. An invalid payload = provider failure = fall through to
   the next adapter in the chain.
4. **Provider chains must end in `mock`** (which never fails) so a refresh can
   always complete. Mock data is deterministic (seeded PRNG keyed by ticker) —
   never use `Math.random()` in data generation.
5. **DB portability:** SQLite today, Postgres tomorrow. No Prisma enums; string
   unions + JSON-in-String columns go through `src/lib/db/json.ts` helpers only.
6. **Config:** `getEnv()` from `src/lib/config/env.ts` is the only reader of
   `process.env`. Server-side only.
7. **Logging:** `log` from `src/lib/logging/logger.ts` — structured events
   (`refresh.step.start`), never `console.log` in lib/pipeline code.
8. **Dates are UTC** everywhere in lib/db code. Format only at the UI edge.

## Compliance rules (product-critical)

- Ratings are exactly: Strong candidate / Candidate / Watchlist / Avoid — always
  framed as *educational model output*, never personal advice.
- Banned phrases in any UI copy, template, or generated narrative: "guaranteed",
  "will go up", "will rise", "safe investment", "can't lose", "sure thing",
  "risk-free". `tests/unit/compliance.test.ts` enforces this — extend it when
  adding copy, don't work around it.
- Every displayed metric/rating shows its **source and asOf timestamp**. Mock
  data must be visibly badged as illustrative.
- Never suggest concentrated allocation; portfolio analytics warn at >20%
  position / >40% sector.
- No brokerage integration, no order placement, no auto-trading — do not add
  endpoints or UI that resemble them.

## Testing rules

- Scoring/normalization changes require updated hand-computed expectations in
  `tests/unit/scoring/` — never assert "whatever the code returns".
- Provider adapters are tested against fixture payloads in `tests/fixtures/`;
  fallback behavior (error → next adapter) has dedicated tests.
- Network tests run only when `LIVE_SMOKE=1` (SEC EDGAR keyless smoke).
- Integration tests build a scratch SQLite DB per suite; never touch `dev.db`.
- `npm run check` must be green before declaring any phase complete.

## Coding style

- TypeScript strict; no `any` at module boundaries; prefer explicit return types
  on exported functions.
- Zod schema next to the type it validates; infer types from schemas.
- UI: shadcn/ui components from `src/components/ui`; recharts via the shadcn
  chart wrapper; Tailwind v4 utilities, no CSS modules.
- Scoring constants (weights, anchors, thresholds) live ONLY in
  `src/lib/scoring/constants.ts`; the Methodology page renders from these same
  constants — never hardcode copies in UI or docs.
- A `.claude` PostToolUse hook auto-runs `eslint --fix` on edited TS files.
