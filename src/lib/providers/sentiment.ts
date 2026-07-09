/**
 * Naive lexicon sentiment scorer used when a news provider supplies no
 * sentiment of its own. Deliberately simple and fully inspectable; scores
 * land in [-1, 1]. Documented as a rough signal in docs/DATA_SOURCES.md.
 */
const POSITIVE_WORDS = new Set([
  "beat", "beats", "strong", "record", "growth", "upgrade", "upgraded",
  "raises", "raised", "surge", "surges", "gain", "gains", "profit",
  "outperform", "expands", "expansion", "wins", "award", "awarded",
  "positive", "exceeds", "exceeded", "improved", "improves", "momentum",
  "breakthrough", "partnership", "buyback", "dividend",
]);

const NEGATIVE_WORDS = new Set([
  "miss", "misses", "missed", "weak", "decline", "declines", "downgrade",
  "downgraded", "cuts", "cut", "falls", "fall", "drop", "drops", "loss",
  "losses", "lawsuit", "probe", "investigation", "recall", "layoffs",
  "restatement", "delisting", "bankruptcy", "default", "warning", "warns",
  "negative", "underperform", "shortfall", "fraud", "breach", "halted",
]);

export function scoreSentiment(text: string): number {
  const words = text.toLowerCase().split(/[^a-z]+/);
  let positive = 0;
  let negative = 0;
  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) positive++;
    else if (NEGATIVE_WORDS.has(word)) negative++;
  }
  if (positive + negative === 0) return 0;
  // +2 smoothing keeps single-word headlines from saturating at ±1.
  const raw = (positive - negative) / (positive + negative + 2);
  return Math.round(raw * 100) / 100;
}
