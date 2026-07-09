# Roadmap — v2 and beyond

v1 is a complete local research lab: swappable providers, explainable scoring,
reports, backtesting, and admin tooling, all working keylessly. The natural
next steps, roughly in order of value:

## Platform

1. **Authentication + multi-user** — the blocker for any non-local deployment.
   Auth.js with per-user watchlists/portfolios; admin routes gated by role.
   (Schema note: add `userId` to WatchlistItem/Portfolio and drop the
   single-user uniqueness on WatchlistItem.companyId.)
2. **PostgreSQL as a first-class citizen** — CI matrix over SQLite + Postgres,
   provider-agnostic integration tests, hosted-DB deployment recipe
   (see DEPLOYMENT.md §3 for the manual path that exists today).
3. **Hardened refresh endpoint** — token-protected `POST /api/admin/refresh`
   suitable for external schedulers (enables serverless deployments).
4. **Playwright end-to-end suite** — the current Vitest suite covers engines
   and APIs; add browser-level flows (screener filters, portfolio editing,
   backtest run) once the UI stabilizes.

## Data

5. **Expandable universe** — admin UI to add companies (CIK lookup via SEC
   company_tickers.json), universe versioning so backtests know when a name
   entered, and sector-median quorum handling for larger universes.
6. **Deeper EDGAR extraction** — IFRS concept mapping for MJDS filers (today
   they fall through to mock), segment data, and 8-K item text summaries.
7. **Earnings-call and filing NLP** — summarize MD&A/risk-factor diffs between
   annual reports; keyword-based red-flag enrichment beyond form types.
8. **More providers** — Polygon/Tiingo adapters (better free price history),
   analyst-estimate sources to light up the forward-growth and revision
   factors that free tiers can't fill today.

## Model

9. **Configurable scoring profiles** — user-defined weight sets ("value
   tilt", "quality tilt") stored per user, rendered on Methodology, applied
   across screener/backtest; keep the default profile canonical.
10. **Point-in-time score history** — persist per-factor snapshots (not just
    pillar scores) to power factor-attribution charts over time.
11. **Backtest realism upgrades** — dividend total-return series, position
    caps, sector-neutral construction, walk-forward validation warnings, and
    bootstrapped confidence bands to further discourage overreading results.
12. **Customer-concentration & governance inputs** — if a reliable structured
    source appears; explicitly out of scope until then (documented limitation).

## UX

13. **Score-change alerts** — email/webhook when a rating band changes or a
    red-flag filing lands (builds on the existing UpdateRun + flags data).
14. **Comparison view** — side-by-side factor breakdowns for 2-4 tickers.
15. **Dark mode toggle + saved screener presets.**
16. **i18n** — copy is centralized enough to extract; compliance phrasing
    would need per-locale legal review, so this stays last.
