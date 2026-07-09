import type { PrismaClient } from "@/generated/prisma/client";
import { log } from "@/lib/logging/logger";
import type { ProviderCategory } from "@/lib/db/json";
import { ProviderError } from "@/lib/providers/types";
import { cacheKeyFor, getCachedPayload, setCachedPayload } from "./cache";
import type { RateLimiter } from "./rate-limiter";

/**
 * Shared fetch path for every real adapter:
 *   cache lookup -> rate limit -> fetch (timeout) -> retry on 429/5xx/network
 *   -> cache write -> parsed JSON.
 * Adapters Zod-validate the returned payload themselves; a validation failure
 * is a provider failure and falls through the chain.
 */
export interface FetchJsonOptions {
  provider: string;
  category: ProviderCategory;
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Total attempts = maxRetries + 1. */
  maxRetries?: number;
  rateLimiter?: RateLimiter;
  /** Enables the ApiCache table when provided. */
  db?: PrismaClient;
  cacheTtlMs?: number;
  /** 0 disables caching even when db is present. */
  cacheEnabled?: boolean;
}

export interface HttpDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const RETRY_BASE_DELAY_MS = 500;

export async function fetchJson(
  opts: FetchJsonOptions,
  deps: HttpDeps = {},
): Promise<unknown> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? (() => new Date());
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRetries = opts.maxRetries ?? 3;
  const useCache =
    opts.db !== undefined &&
    (opts.cacheEnabled ?? true) &&
    (opts.cacheTtlMs ?? 0) > 0;
  const key = cacheKeyFor(opts.provider, opts.url);

  if (useCache) {
    const cached = await getCachedPayload(opts.db!, key, now());
    if (cached !== null) {
      log.debug("http.cache_hit", { provider: opts.provider, category: opts.category });
      return JSON.parse(cached);
    }
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
    await opts.rateLimiter?.acquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(opts.url, {
        headers: opts.headers,
        signal: controller.signal,
      });

      if (response.status === 429 || response.status >= 500) {
        lastError = new ProviderError(
          `HTTP ${response.status} from ${opts.provider}`,
          opts.provider,
          opts.category,
        );
        log.warn("http.retryable_status", {
          provider: opts.provider,
          status: response.status,
          attempt,
        });
        continue; // retry
      }
      if (!response.ok) {
        // Non-retryable client error: fail the provider immediately.
        throw new ProviderError(
          `HTTP ${response.status} from ${opts.provider} for ${redact(opts.url)}`,
          opts.provider,
          opts.category,
        );
      }

      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new ProviderError(
          `Non-JSON response from ${opts.provider}`,
          opts.provider,
          opts.category,
        );
      }

      if (useCache) {
        await setCachedPayload(opts.db!, key, text, opts.cacheTtlMs!, now());
      }
      return parsed;
    } catch (err) {
      if (err instanceof ProviderError && !isRetryableProviderError(err)) {
        throw err;
      }
      // AbortError (timeout) and network errors are retryable.
      lastError = err;
      log.warn("http.attempt_failed", {
        provider: opts.provider,
        attempt,
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  throw new ProviderError(
    `${opts.provider} failed after ${maxRetries + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    opts.provider,
    opts.category,
    lastError,
  );
}

function isRetryableProviderError(err: ProviderError): boolean {
  return /HTTP (429|5\d\d) /.test(err.message);
}

/** Strip query strings (API keys) from URLs before they reach logs/errors. */
export function redact(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : `${url.slice(0, q)}?…`;
}
