/**
 * Manual "run refresh now" CLI.
 *
 *   npm run refresh                                  # full pipeline
 *   npm run refresh -- --steps=prices,news           # subset of steps
 *   npm run refresh -- --tickers=AAPL,MSFT           # subset of companies
 *   npm run refresh -- --as-of=2026-06-01            # historical reference date
 *
 * Exit code: 0 on SUCCESS or PARTIAL (a degraded-but-useful refresh must not
 * fail cron), 1 on FAILED or unexpected crash.
 */
import { runRefresh } from "@/lib/pipeline/refresh";
import { utcDate } from "@/lib/dates";

function parseArgs(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (match) out.set(match[1], match[2]);
  }
  return out;
}

function parseList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const asOfRaw = args.get("as-of");
  let asOf: Date | undefined;
  if (asOfRaw) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOfRaw);
    if (!m) {
      console.error(`Invalid --as-of date: ${asOfRaw} (expected YYYY-MM-DD)`);
      return 1;
    }
    asOf = utcDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  const summary = await runRefresh({
    trigger: "MANUAL",
    steps: parseList(args.get("steps")),
    tickers: parseList(args.get("tickers")),
    asOf,
  });

  // Human-readable step table.
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log("");
  console.log(
    pad("STEP", 14) + pad("STATUS", 10) + pad("ITEMS", 8) + pad("PROVIDERS", 24) + "ERRORS",
  );
  for (const s of summary.steps) {
    console.log(
      pad(s.name, 14) +
        pad(s.status, 10) +
        pad(String(s.items), 8) +
        pad(s.providers.join(",") || "-", 24) +
        (s.errors.length > 0 ? `${s.errors.length} (first: ${s.errors[0]})` : "-"),
    );
  }
  console.log(`\nRun ${summary.runId}: ${summary.status}`);
  if (summary.status === "PARTIAL") {
    console.warn("Refresh completed with some failures — see step errors above.");
  }
  return summary.status === "FAILED" ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Refresh crashed unexpectedly:", err);
    process.exit(1);
  });
