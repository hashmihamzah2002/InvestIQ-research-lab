import { z } from "zod";
import { RatingSchema } from "@/lib/db/json";

/**
 * Zod mirrors of the scoring types for the ScoreSnapshot.breakdownJson
 * column. Reads go through these schemas (parseJsonColumnStrict) so a
 * malformed row fails loudly instead of rendering nonsense.
 */
export const FactorScoreSchema = z.object({
  key: z.string(),
  label: z.string(),
  pillar: z.enum(["valuation", "quality", "growth", "momentum", "risk"]),
  rawValue: z.number().nullable(),
  rawUnit: z.string(),
  normalized: z.number().nullable(),
  weight: z.number(),
  available: z.boolean(),
  note: z.string().optional(),
});

export const PillarScoreSchema = z.object({
  key: z.enum(["valuation", "quality", "growth", "momentum", "risk"]),
  label: z.string(),
  score: z.number().nullable(),
  coverage: z.number(),
  weight: z.number(),
  factors: z.array(FactorScoreSchema),
});

export const ScoreOverrideSchema = z.object({
  code: z.string(),
  message: z.string(),
  capAt: RatingSchema,
});

export const ScoreBreakdownSchema = z.object({
  pillars: z.array(PillarScoreSchema),
  overall: z.number(),
  coverage: z.number(),
  rating: RatingSchema,
  ratingReason: z.string(),
  overrides: z.array(ScoreOverrideSchema),
});

export const NarrativeSchema = z.object({
  bullCase: z.array(z.string()),
  bearCase: z.array(z.string()),
  keyRisks: z.array(z.string()),
  changeMyMind: z.array(z.string()),
});

/** Full payload persisted in ScoreSnapshot.breakdownJson. */
export const ScorePayloadSchema = z.object({
  breakdown: ScoreBreakdownSchema,
  narrative: NarrativeSchema,
});
export type ScorePayload = z.infer<typeof ScorePayloadSchema>;

export const PeHistorySchema = z.array(
  z.object({ date: z.string(), pe: z.number().nullable() }),
);

export const DataQualitySchema = z.object({
  prices: z
    .object({ source: z.string(), asOf: z.string(), bars: z.number() })
    .nullable(),
  fundamentals: z
    .object({
      source: z.string(),
      latestPeriodEnd: z.string(),
      quartersAvailable: z.number(),
      annualsAvailable: z.number(),
    })
    .nullable(),
  keyMetrics: z.object({ source: z.string() }).nullable(),
  notes: z.array(z.string()),
});
