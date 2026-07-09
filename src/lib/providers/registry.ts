import { parseProviderChain, type Env } from "@/lib/config/env";
import { log } from "@/lib/logging/logger";
import type { ProviderCategory } from "@/lib/db/json";
import type { ProviderBase } from "@/lib/providers/types";
import { mockProvider } from "@/lib/providers/mock";

/**
 * Provider registry: resolves the ordered fallback chain for a category from
 * env config and executes calls with fall-through semantics.
 *
 * P3 registers the real adapters (sec-edgar, fred, alpha-vantage, finnhub,
 * fmp, csv) into ADAPTERS; the chain/fallback logic below does not change.
 */
const ADAPTERS = new Map<string, ProviderBase>([[mockProvider.name, mockProvider]]);

export function registerAdapter(adapter: ProviderBase): void {
  ADAPTERS.set(adapter.name, adapter);
}

/** Test helper. */
export function listRegisteredAdapters(): string[] {
  return [...ADAPTERS.keys()];
}

function chainConfigFor(category: ProviderCategory, env: Env): string {
  switch (category) {
    case "market-data":
      return env.MARKET_DATA_PROVIDERS;
    case "fundamentals":
      return env.FUNDAMENTALS_PROVIDERS;
    case "filings":
      return env.FILINGS_PROVIDERS;
    case "news":
      return env.NEWS_PROVIDERS;
    case "macro":
      return env.MACRO_PROVIDERS;
  }
}

/**
 * Resolve the usable adapters for a category, in configured order. Unknown
 * names are warned about and skipped; unconfigured adapters (missing API
 * keys) are skipped silently. An empty result falls back to [mock] so a
 * refresh can always complete.
 */
export function resolveChain(category: ProviderCategory, env: Env): ProviderBase[] {
  const names = parseProviderChain(chainConfigFor(category, env));
  const chain: ProviderBase[] = [];
  for (const name of names) {
    const adapter = ADAPTERS.get(name);
    if (!adapter) {
      log.warn("provider.unknown_in_chain", { name, category });
      continue;
    }
    if (!adapter.categories.includes(category)) {
      log.warn("provider.wrong_category", { name, category });
      continue;
    }
    if (!adapter.isConfigured(env)) continue;
    chain.push(adapter);
  }
  if (chain.length === 0) {
    log.warn("provider.chain_empty_fallback_mock", { category });
    chain.push(mockProvider);
  }
  return chain;
}

export interface FallbackAttempt {
  provider: string;
  ok: boolean;
  error?: string;
}

export interface FallbackResult<R> {
  provider: string;
  value: R;
  attempts: FallbackAttempt[];
}

/**
 * Try each adapter in order until one succeeds. Every attempt (success or
 * failure) is reported through onAttempt so the pipeline can persist
 * ProviderHealth without this module touching the database.
 */
export async function callWithFallback<P extends ProviderBase, R>(
  chain: readonly P[],
  category: ProviderCategory,
  fn: (provider: P) => Promise<R>,
  onAttempt?: (attempt: FallbackAttempt) => void | Promise<void>,
): Promise<FallbackResult<R>> {
  const attempts: FallbackAttempt[] = [];
  let lastError: unknown = new Error(`empty provider chain for ${category}`);

  for (const provider of chain) {
    try {
      const value = await fn(provider);
      const attempt: FallbackAttempt = { provider: provider.name, ok: true };
      attempts.push(attempt);
      await onAttempt?.(attempt);
      return { provider: provider.name, value, attempts };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempt: FallbackAttempt = {
        provider: provider.name,
        ok: false,
        error: message,
      };
      attempts.push(attempt);
      await onAttempt?.(attempt);
      log.warn("provider.attempt_failed", {
        provider: provider.name,
        category,
        error: message,
      });
      lastError = err;
    }
  }
  throw lastError;
}
