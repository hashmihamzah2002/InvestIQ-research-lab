# Windows 11 setup guide

Everything runs natively on Windows — no WSL, no Docker, no database server.

## 1. Prerequisites

| Tool | Minimum | Check with |
|---|---|---|
| Node.js | 20.9 (LTS) — 22/24 recommended | `node --version` |
| npm | ships with Node | `npm --version` |
| git | any recent | `git --version` |

Install Node from <https://nodejs.org> (or `winget install OpenJS.NodeJS.LTS`)
and git from <https://git-scm.com> (or `winget install Git.Git`).

## 2. Install

Open **PowerShell** in the folder where you keep projects:

```powershell
git clone <your-fork-url> investiq-research-lab
cd investiq-research-lab
npm install
Copy-Item .env.example .env
npm run setup
```

`npm run setup` = apply database migrations → seed the 30-company universe →
run the first full refresh (mock data, ~30-60s) → compute scores and rankings.

Then:

```powershell
npm run dev
```

Open <http://localhost:3000>. The dashboard, screener, and every stock page
should be fully populated, with amber "mock — illustrative" badges on the data.

## 3. Add real data (optional, free)

Edit `.env`:

1. **SEC EDGAR — no key needed.** Uncomment and personalize:
   `SEC_EDGAR_USER_AGENT="Your Name you@example.com"` (the SEC requires a
   contact in the User-Agent; that is their entire access policy for fair use).
   Real filings + XBRL fundamentals flow in on the next refresh.
2. **FRED** (macro): free key at <https://fred.stlouisfed.org/docs/api/api_key.html>.
3. **Alpha Vantage / Finnhub / FMP** (prices, statements, news): free keys per
   `.env.example` — note the tiny free-tier budgets (Alpha Vantage: 25
   requests/day); the response cache and fallback chains handle running out.

Then: `npm run refresh`. Check the **Admin** page to see which provider served
each category and current provider health.

## 4. Daily updates on Windows

Option A — **GitHub Actions** (if you push this repo to GitHub): the included
`.github/workflows/daily-update.yml` runs each weekday after US close; add
provider secrets in *Settings → Secrets and variables → Actions* to pull real
data. The refreshed SQLite snapshot is uploaded as a workflow artifact.

Option B — **Windows Task Scheduler** (fully local):

```powershell
$action = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument "/c cd /d C:\path\to\investiq-research-lab && npm run refresh >> refresh.log 2>&1"
$trigger = New-ScheduledTaskTrigger -Daily -At 6:00PM
Register-ScheduledTask -TaskName "InvestIQ daily refresh" -Action $action -Trigger $trigger
```

(Adjust the path and time. Remove with `Unregister-ScheduledTask`.)

Option C — click **"Run refresh now"** on the Admin page whenever you want.

## 5. Everyday commands

```powershell
npm run dev          # dev server
npm run check        # lint + typecheck + tests (run before committing)
npm run refresh -- --steps=prices,metrics,scores --tickers=AAPL,MSFT
npm run db:studio    # browse the database
npm run db:reset     # wipe + remigrate (then: npm run seed && npm run refresh)
```

## 6. Troubleshooting

- **`npm run …` blocked by execution policy** — npm's shims occasionally fall
  foul of strict PowerShell policies. Fix for your user:
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
- **`better-sqlite3` install errors** — recent Node versions ship prebuilt
  binaries; if you're on an exotic Node build, `npm rebuild better-sqlite3`
  (needs the "Desktop development with C++" workload only in the worst case).
- **Port 3000 busy** — `npm run dev -- -p 3001`.
- **Git commits rejected ("Author identity unknown")** — this repo sets a
  placeholder local identity (`InvestIQ Local Dev <dev@investiq.local>`).
  Replace it with yours:
  `git config user.name "Your Name"` and `git config user.email "you@example.com"`
  (add `--global` to set it machine-wide). To fix attribution on the initial
  commits: `git rebase -r --root --exec "git commit --amend --no-edit --reset-author"`.
- **App shows "No data yet"** — run `npm run setup` (first time) or
  `npm run refresh`, then reload.
- **Stale-data banner** — the last completed refresh is older than 36h; run a
  refresh or check the Admin page for failing providers.
