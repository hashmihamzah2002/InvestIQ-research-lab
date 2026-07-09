import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { scoreUniverseFromGenerators } from "../helpers/universe-scoring";

/**
 * Compliance guardrail (product-critical, see AGENTS.md): certain promissory
 * phrases may never appear in UI copy, templates, or generated narrative.
 * Extend BANNED when adding compliance rules — never work around this test.
 */
const BANNED: { pattern: RegExp; label: string }[] = [
  { pattern: /guaranteed/i, label: "guaranteed" },
  { pattern: /will go up/i, label: "will go up" },
  { pattern: /will rise/i, label: "will rise" },
  { pattern: /safe investment/i, label: "safe investment" },
  { pattern: /can'?t lose/i, label: "can't lose" },
  { pattern: /sure thing/i, label: "sure thing" },
  { pattern: /risk[- ]free/i, label: "risk-free" },
  { pattern: /guaranteed buy/i, label: "guaranteed buy" },
];

/** Source roots scanned for banned copy. */
const SCAN_ROOTS = ["src"];
const EXCLUDED_DIRS = new Set(["generated", "node_modules", ".next"]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield full;
    }
  }
}

describe("compliance: banned promissory language", () => {
  it("never appears in application source (UI copy, templates, lib)", () => {
    const violations: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(join(process.cwd(), root))) {
        const text = readFileSync(file, "utf8");
        for (const { pattern, label } of BANNED) {
          if (pattern.test(text)) {
            violations.push(`${relative(process.cwd(), file)}: "${label}"`);
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("never appears in generated narratives across the whole universe", () => {
    const scored = scoreUniverseFromGenerators();
    const violations: string[] = [];
    for (const s of scored) {
      const text = [
        ...s.narrative.bullCase,
        ...s.narrative.bearCase,
        ...s.narrative.keyRisks,
        ...s.narrative.changeMyMind,
        s.breakdown.ratingReason,
      ].join(" ");
      for (const { pattern, label } of BANNED) {
        if (pattern.test(text)) {
          violations.push(`${s.ticker}: "${label}"`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("frames every rating as educational model output", () => {
    const scored = scoreUniverseFromGenerators();
    for (const s of scored.slice(0, 5)) {
      expect(s.breakdown.ratingReason).toMatch(/educational/i);
      expect(s.breakdown.ratingReason).toMatch(/not personal advice/i);
    }
  });
});
