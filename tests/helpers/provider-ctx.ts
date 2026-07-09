import { loadEnv } from "@/lib/config/env";
import { utcDate } from "@/lib/dates";
import { log } from "@/lib/logging/logger";
import type { ProviderContext } from "@/lib/providers/types";

/** Minimal ProviderContext for adapter unit tests (no DB cache). */
export function makeCtx(
  envOverrides: Record<string, string> = {},
  asOf: Date = utcDate(2026, 6, 10),
): ProviderContext {
  return { env: loadEnv(envOverrides), log, asOf };
}
