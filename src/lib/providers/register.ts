import { registerAdapter } from "./registry";
import { alphaVantageProvider } from "./alpha-vantage";
import { csvProvider } from "./csv";
import { finnhubProvider } from "./finnhub";
import { fmpProvider } from "./fmp";
import { fredProvider } from "./fred";
import { secEdgarProvider } from "./sec-edgar";

let registered = false;

/**
 * Register every real adapter exactly once. Called by the pipeline (and the
 * admin health page) before resolving chains; the mock adapter is registered
 * by the registry itself.
 */
export function ensureAdaptersRegistered(): void {
  if (registered) return;
  registerAdapter(secEdgarProvider);
  registerAdapter(fredProvider);
  registerAdapter(alphaVantageProvider);
  registerAdapter(finnhubProvider);
  registerAdapter(fmpProvider);
  registerAdapter(csvProvider);
  registered = true;
}
