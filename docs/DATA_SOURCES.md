# Data sources & limitations

The live version of this document is the in-app **/data-sources** page (it
shares tables with the provider code). This file is the repo-browsable
summary plus the CSV format reference.

## Provider chains

Every data category resolves an ordered adapter chain from `.env`
(`MARKET_DATA_PROVIDERS`, `FUNDAMENTALS_PROVIDERS`, `FILINGS_PROVIDERS`,
`NEWS_PROVIDERS`, `MACRO_PROVIDERS`). An adapter that is unconfigured is
skipped; one that fails (network, quota, invalid payload — all Zod-validated)
falls through to the next. Chains end at the deterministic **mock** adapter,
which cannot fail, so a refresh always completes and reports PARTIAL rather
than crashing. Every stored row records its source; the UI badges it.

| Adapter | Serves | Credentials | Practical limits | Caveats |
|---|---|---|---|---|
| `sec-edgar` | filings, XBRL fundamentals | none — descriptive `SEC_EDGAR_USER_AGENT` with contact email | SEC allows 10 req/s; app uses 5 | us-gaap concept subset; IFRS (Canadian MJDS) filers fall through; totalDebt = LongTermDebt only; red flags: NT forms, 8-K items 4.01/4.02 |
| `fred` | macro | free key | 60 req/min used | CPI/GDP transformed to YoY in-adapter; revisions overwrite history |
| `alpha-vantage` | prices, statements, overview | free key | **25 req/day** | throttle notices arrive as HTTP 200 bodies (treated as failures); field coverage varies |
| `finnhub` | prices, news | free key | 50 req/min used | candles are plan-dependent (403 falls through); no sentiment on free news → lexicon scorer |
| `fmp` | statements, TTM ratios | free key | ~250 req/day | negative cash-flow conventions normalized |
| `csv` | everything | none | local files | see formats below; "no rows for ticker" = fall through |
| `mock` | everything | none | none | seeded PRNG, per-company curated profiles; **never fabricates negative events for real companies** (red-flag paths are exercised via CSV/test fixtures) |

## CSV import formats

Templates with headers and sample rows live in [`data/templates/`](../data/templates).
Import either by dropping completed files into `data/imports/` (the csv
adapter reads them during refreshes) or by uploading on the Admin page.
Validation is per-row: good rows import, bad rows come back with line numbers.
Tickers must belong to the seeded universe; macro `seriesId`s may be new
(an indicator is created on the fly).

| File | Required headers |
|---|---|
| `prices.csv` | `ticker,date,open,high,low,close,adjClose,volume` (adjClose/volume may be blank) |
| `fundamentals.csv` | `ticker,periodEnd,periodType,revenue,grossProfit,operatingIncome,netIncome,eps,sharesOut,totalAssets,totalLiabilities,totalEquity,cash,totalDebt,currentAssets,currentLiabilities,ebitda,operatingCashFlow,capex,dividendsPaid,interestExpense,reportedAt` (numerics may be blank; periodType = ANNUAL\|QUARTERLY) |
| `filings.csv` | `ticker,accessionNo,form,filedAt,title,url,flags` (flags pipe-separated, e.g. `LATE_FILING\|ITEM_4_02`) |
| `news.csv` | `ticker,publishedAt,title,url,source,summary,sentiment` (sentiment −1..1 or blank) |
| `macro.csv` | `seriesId,date,value` |

Dates are `YYYY-MM-DD` (UTC).

## Honest limitations

- **Free tiers are tiny.** A full 30-company fundamentals refresh wants 100+
  requests; Alpha Vantage's 25/day cannot cover it. The 12-24h response cache
  and chain fallback keep refreshes completing — expect mixed sources, and
  check the per-datum badges.
- **Delays.** Free price data is end-of-day or delayed. Nothing is real-time.
- **Mock data is synthetic.** It makes the app fully functional keylessly and
  keeps tests deterministic; it approximates each company's character
  (megacap-calm vs crypto-wild) but is not market data. Always badged.
- **Lexicon sentiment is naive** — word counting; negation and sarcasm defeat
  it. A weak signal, weighted accordingly (10% of one pillar at most).
- **XBRL is messy.** Filers tag concepts inconsistently; the EDGAR mapping is
  a pragmatic subset and can miss fields for unusual reporters.
- **Small universe → coarse sector medians.** Sectors with <3 members fall
  back to universe medians (disclosed in each factor note).
- **Licensing.** Free API tiers are typically personal/non-commercial —
  check each provider's terms before deploying beyond local research.
