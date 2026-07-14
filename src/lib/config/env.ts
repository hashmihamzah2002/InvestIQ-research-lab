import { z } from "zod";

/**
 * All configuration enters the app through this module. Never read
 * process.env elsewhere — parse here once, with defaults that keep the app
 * fully functional with zero API keys (mock/CSV providers).
 *
 * Server-side only: never import from a client component.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().min(1).default("file:./dev.db"),

  // --- Provider credentials (all optional; absence disables the adapter) ---
  /** SEC fair-access policy requires a descriptive User-Agent with contact
   *  email, e.g. "InvestIQ Research Lab you@example.com". No API key needed. */
  SEC_EDGAR_USER_AGENT: z.string().optional(),
  FRED_API_KEY: z.string().optional(),
  ALPHA_VANTAGE_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(),
  FMP_API_KEY: z.string().optional(),

  // --- Provider fallback chains (comma-separated, tried in order) ---
  // Unconfigured adapters are skipped; "mock" never fails and should
  // terminate every chain so a refresh can always complete.
  MARKET_DATA_PROVIDERS: z.string().default("finnhub,alpha-vantage,csv,mock"),
  FUNDAMENTALS_PROVIDERS: z.string().default("fmp,alpha-vantage,csv,mock"),
  FILINGS_PROVIDERS: z.string().default("sec-edgar,csv,mock"),
  NEWS_PROVIDERS: z.string().default("finnhub,csv,mock"),
  MACRO_PROVIDERS: z.string().default("fred,csv,mock"),

  // --- HTTP / cache tuning ---
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  /** Set to "0" to bypass the ApiCache table (useful when debugging adapters). */
  API_CACHE_ENABLED: z.coerce.number().default(1),

  // --- Logging ---
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Defaults to "pretty" in development, "json" otherwise. */
  LOG_FORMAT: z.enum(["json", "pretty"]).optional(),

  /** Set to "1" to enable network-touching smoke tests (SEC EDGAR). */
  LIVE_SMOKE: z.string().optional(),

  /**
   * Public-demo hardening: 1 hides the Admin page and returns 403 from all
   * /api/admin routes (refresh triggers, CSV imports). Set on hosted demos
   * where anonymous visitors must not mutate the dataset.
   */
  DEMO_MODE: z.coerce.number().default(0),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

let cached: Env | null = null;

/** Memoized environment. Use this everywhere instead of process.env. */
export function getEnv(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test helper: force re-parse after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}

/** Comma-separated chain -> ordered list of adapter names. */
export function parseProviderChain(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}
