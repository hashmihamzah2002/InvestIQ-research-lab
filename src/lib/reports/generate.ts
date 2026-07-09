import { FOOTER_DISCLAIMER } from "@/components/compliance-notice";
import { fmtCurrency, fmtDate, fmtMult, fmtNum, fmtPct } from "@/lib/format";
import { RATING_LABELS } from "@/lib/scoring/constants";
import { formatRawValue } from "@/lib/scoring/format";
import type { StockDetail } from "@/lib/queries/stock-detail";

/**
 * Markdown research report, generated deterministically from the same data
 * bundle the stock page renders. Every number carries its source; the
 * document ends with limitations and the full disclaimer.
 */
export function generateReport(detail: StockDetail, generatedAt: Date): string {
  const { company, score, metrics, dataQuality } = detail;
  const payload = score?.payload ?? null;
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  // --- Title ---
  push(`# ${company.name} (${company.ticker}) — Educational Research Report`);
  push();
  push(
    `> **${score ? RATING_LABELS[score.rating] : "Not yet scored"}** · Overall score ${score ? `${score.overall.toFixed(1)}/100` : "—"} · Rank ${score?.rank ?? "—"} of universe · Generated ${fmtDate(generatedAt)} (UTC)`,
  );
  push(">");
  push(
    "> Educational model output — not investment advice, not a recommendation. See “Data limitations” and the disclaimer at the end.",
  );
  push();

  // --- Executive summary ---
  push("## Executive summary");
  push();
  if (score) {
    push(score.ratingReason);
    push();
    if (payload) {
      const strongest = payload.breakdown.pillars
        .filter((p) => p.score !== null)
        .sort((a, b) => b.score! - a.score!);
      if (strongest.length > 0) {
        push(
          `Pillar picture: ${strongest
            .map((p) => `${p.label} ${p.score!.toFixed(0)}`)
            .join(" · ")}.`,
        );
      }
    }
  } else {
    push("No score snapshot exists yet — run a data refresh.");
  }
  push();

  // --- Business overview ---
  push("## Business overview");
  push();
  push(company.description ?? "No profile description available.");
  push();
  push(
    `- Sector / industry: ${company.sector} / ${company.industry}`,
  );
  push(`- Listing: ${company.exchange} (${company.country})`);
  if (company.cik) push(`- SEC CIK: ${company.cik}`);
  if (company.website) push(`- Website: ${company.website}`);
  push();

  // --- Financial snapshot ---
  push("## Financial snapshot");
  push();
  push("| Metric | Value | Metric | Value |");
  push("|---|---|---|---|");
  const rows: [string, string][] = [
    ["Market cap", fmtCurrency(metrics.marketCap)],
    ["Price", fmtNum(metrics.price)],
    ["Revenue growth (YoY)", fmtPct(metrics.revenueGrowthYoY)],
    ["EPS growth (YoY)", fmtPct(metrics.epsGrowthYoY)],
    ["Gross margin", fmtPct(metrics.grossMargin)],
    ["Operating margin", fmtPct(metrics.operatingMargin)],
    ["Net margin", fmtPct(metrics.netMargin)],
    ["ROE", fmtPct(metrics.roe)],
    ["Debt / equity", fmtNum(metrics.debtToEquity, 2)],
    ["Interest coverage", fmtMult(metrics.interestCoverage)],
    ["FCF consistency (8q)", fmtPct(metrics.fcfConsistency, 0)],
    ["Current ratio", fmtNum(metrics.currentRatio, 2)],
  ];
  for (let i = 0; i < rows.length; i += 2) {
    const [l1, v1] = rows[i];
    const [l2, v2] = rows[i + 1] ?? ["", ""];
    push(`| ${l1} | ${v1} | ${l2} | ${v2} |`);
  }
  push();

  // --- Valuation ---
  push("## Valuation");
  push();
  push("| Multiple | Value |");
  push("|---|---|");
  push(`| P/E (TTM) | ${fmtMult(metrics.pe)} |`);
  push(`| Forward P/E (provider estimate) | ${fmtMult(metrics.forwardPe)} |`);
  push(`| PEG | ${fmtNum(metrics.peg, 2)} |`);
  push(`| EV/EBITDA | ${fmtMult(metrics.evToEbitda)} |`);
  push(`| Price/sales | ${fmtMult(metrics.priceToSales)} |`);
  push(`| FCF yield | ${fmtPct(metrics.fcfYield)} |`);
  push(`| Dividend yield | ${fmtPct(metrics.dividendYield)} |`);
  push();
  if (payload) {
    const valuation = payload.breakdown.pillars.find((p) => p.key === "valuation");
    if (valuation) {
      push(
        `The valuation pillar scores ${valuation.score === null ? "n/a" : `${valuation.score.toFixed(0)}/100`} with ${(valuation.coverage * 100).toFixed(0)}% factor coverage; sector-relative factors compare against ${detail.company.sector} peers (universe fallback when the sector is thin — factor notes disclose it).`,
      );
      push();
    }
  }

  // --- Growth outlook ---
  push("## Growth outlook");
  push();
  push(`- Revenue growth (TTM YoY): ${fmtPct(metrics.revenueGrowthYoY)}`);
  push(`- Revenue CAGR (3y): ${fmtPct(metrics.revenueCagr3y)}`);
  push(`- EPS growth (TTM YoY): ${fmtPct(metrics.epsGrowthYoY)}`);
  push(
    `- Forward growth (provider estimate): ${fmtPct(metrics.forwardGrowth)}${metrics.forwardGrowth === null ? " — no estimate provider configured" : ""}`,
  );
  push(`- Margin expansion (TTM vs prior year): ${fmtPct(metrics.marginExpansion)}`);
  push();
  push(
    "Forward-looking items are third-party estimates where available — treat them as inputs with their own error bars, not facts.",
  );
  push();

  // --- Risks ---
  push("## Risks");
  push();
  if (payload) {
    for (const risk of payload.narrative.keyRisks) push(`- ${risk}`);
  } else {
    push("- No scored risk factors available yet.");
  }
  push();

  // --- Recent developments ---
  push("## Recent developments");
  push();
  push("### Filings");
  push();
  if (detail.filings.length === 0) {
    push("No filings loaded.");
  } else {
    for (const filing of detail.filings.slice(0, 8)) {
      push(
        `- ${fmtDate(filing.filedAt)} — **${filing.form}** ${filing.title ?? ""}${filing.flags.length > 0 ? ` ⚠️ flags: ${filing.flags.join(", ")}` : ""} ([link](${filing.url})) _(source: ${filing.source})_`,
      );
    }
  }
  push();
  push("### News & research snippets");
  push();
  if (detail.news.length === 0) {
    push("No news loaded.");
  } else {
    for (const item of detail.news.slice(0, 8)) {
      push(
        `- ${fmtDate(item.publishedAt)} — ${item.title}${item.sentiment !== null ? ` _(sentiment ${item.sentiment > 0 ? "+" : ""}${item.sentiment.toFixed(2)})_` : ""} _(source: ${item.provider})_`,
      );
    }
  }
  push();

  // --- Score breakdown ---
  push("## Score breakdown");
  push();
  if (payload) {
    push(
      `Overall **${payload.breakdown.overall.toFixed(1)}/100** · data coverage ${(payload.breakdown.coverage * 100).toFixed(0)}% · rating **${RATING_LABELS[payload.breakdown.rating]}**`,
    );
    push();
    for (const pillar of payload.breakdown.pillars) {
      push(
        `### ${pillar.label} — ${pillar.score === null ? "n/a" : `${pillar.score.toFixed(1)}/100`} (weight ${(pillar.weight * 100).toFixed(0)}%)`,
      );
      push();
      push("| Factor | Raw | Normalized | Weight | Note |");
      push("|---|---|---|---|---|");
      for (const f of pillar.factors) {
        push(
          `| ${f.label} | ${formatRawValue(f.rawValue, f.rawUnit)} | ${f.normalized === null ? "n/a" : f.normalized.toFixed(1)} | ${(f.weight * 100).toFixed(0)}% | ${f.note ?? ""} |`,
        );
      }
      push();
    }
    if (payload.breakdown.overrides.length > 0) {
      push("**Overrides applied:**");
      push();
      for (const o of payload.breakdown.overrides) push(`- ${o.message}`);
      push();
    }

    push("### Bull case (model-derived)");
    push();
    for (const b of payload.narrative.bullCase) push(`- ${b}`);
    push();
    push("### Bear case (model-derived)");
    push();
    for (const b of payload.narrative.bearCase) push(`- ${b}`);
    push();
    push("### What would change the model's mind");
    push();
    for (const c of payload.narrative.changeMyMind) push(`- ${c}`);
    push();
  } else {
    push("No breakdown available.");
    push();
  }

  // --- Conclusion ---
  push("## Educational conclusion");
  push();
  if (score) {
    push(
      `At the stated weights and anchors, ${company.ticker} maps to **${RATING_LABELS[score.rating]}**. That label is the model's summary of the inputs above — nothing more. Different weights, anchors, or data would produce a different label; the Methodology page documents every choice so you can disagree with specifics.`,
    );
  } else {
    push("No rating available yet.");
  }
  push();

  // --- Sources & timestamps ---
  push("## Sources and timestamps");
  push();
  push(`- Report generated: ${generatedAt.toISOString()}`);
  push(`- Score snapshot: ${score ? fmtDate(score.date) : "—"}`);
  push(`- Metrics as of: ${fmtDate(metrics.asOf)}`);
  if (dataQuality?.prices) {
    push(
      `- Prices: ${dataQuality.prices.source} (latest bar ${dataQuality.prices.asOf}, ${dataQuality.prices.bars} bars)`,
    );
  }
  if (dataQuality?.fundamentals) {
    push(
      `- Fundamentals: ${dataQuality.fundamentals.source} (latest period ${dataQuality.fundamentals.latestPeriodEnd}; ${dataQuality.fundamentals.quartersAvailable} quarters / ${dataQuality.fundamentals.annualsAvailable} annuals)`,
    );
  }
  if (dataQuality?.keyMetrics) {
    push(`- Forward estimates: ${dataQuality.keyMetrics.source}`);
  }
  for (const note of dataQuality?.notes ?? []) {
    push(`- Note: ${note}`);
  }
  push();

  // --- Limitations ---
  push("## Data limitations");
  push();
  push(
    "- Anything sourced `mock` is deterministic illustrative data, not market data.",
  );
  push(
    "- Free data sources are delayed and incomplete; sector medians come from a 30-company universe (small peer groups).",
  );
  push(
    "- The model does not cover customer concentration, management quality, litigation detail, or anything requiring judgment beyond the listed factors.",
  );
  push(
    "- Static assumption tables (industry tailwinds, sector cyclicality) are opinions frozen in code — see Methodology.",
  );
  push();
  push("---");
  push();
  push(`_${FOOTER_DISCLAIMER}_`);
  push();

  return lines.join("\n");
}
