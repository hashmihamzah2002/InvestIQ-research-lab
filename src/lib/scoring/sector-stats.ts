import { MIN_SECTOR_PEERS, WINSOR_LOWER, WINSOR_UPPER } from "./constants";
import { median, winsorize } from "./normalize";
import type { SectorContext } from "./types";

/** One universe row of the metrics needed for cross-sectional comparisons. */
export interface UniverseMetricsRow {
  ticker: string;
  sector: string;
  pe: number | null;
  forwardPe: number | null;
  evToEbitda: number | null;
  priceToSales: number | null;
  grossMargin: number | null;
}

/**
 * Build the per-company sector comparison context. Sectors with fewer than
 * MIN_SECTOR_PEERS companies fall back to universe stats (recorded in
 * groupSource so factor notes can disclose it). Comparison arrays are
 * winsorized at the 5th/95th percentiles; the company itself stays in its
 * group (medians describe the group, not "peers except me").
 */
export function buildSectorContexts(
  rows: UniverseMetricsRow[],
): Map<string, SectorContext> {
  const bySector = new Map<string, UniverseMetricsRow[]>();
  for (const row of rows) {
    bySector.set(row.sector, [...(bySector.get(row.sector) ?? []), row]);
  }

  const universeStats = buildGroupStats(rows);
  const sectorStats = new Map<string, ReturnType<typeof buildGroupStats>>();
  for (const [sector, sectorRows] of bySector) {
    sectorStats.set(sector, buildGroupStats(sectorRows));
  }

  const contexts = new Map<string, SectorContext>();
  for (const row of rows) {
    const peers = bySector.get(row.sector)!;
    const useSector = peers.length >= MIN_SECTOR_PEERS;
    const stats = useSector ? sectorStats.get(row.sector)! : universeStats;
    contexts.set(row.ticker, {
      sector: row.sector,
      groupSource: useSector ? "sector" : "universe",
      groupSize: useSector ? peers.length : rows.length,
      medianPe: stats.medianPe,
      medianForwardPe: stats.medianForwardPe,
      medianEvToEbitda: stats.medianEvToEbitda,
      medianPriceToSales: stats.medianPriceToSales,
      grossMargins: stats.grossMargins,
      pes: stats.pes,
    });
  }
  return contexts;
}

function buildGroupStats(rows: UniverseMetricsRow[]): {
  medianPe: number | null;
  medianForwardPe: number | null;
  medianEvToEbitda: number | null;
  medianPriceToSales: number | null;
  grossMargins: number[];
  pes: number[];
} {
  const collect = (f: (r: UniverseMetricsRow) => number | null): number[] =>
    winsorize(
      rows.map(f).filter((v): v is number => v !== null && Number.isFinite(v)),
      WINSOR_LOWER,
      WINSOR_UPPER,
    );

  const pes = collect((r) => r.pe);
  return {
    medianPe: median(pes),
    medianForwardPe: median(collect((r) => r.forwardPe)),
    medianEvToEbitda: median(collect((r) => r.evToEbitda)),
    medianPriceToSales: median(collect((r) => r.priceToSales)),
    grossMargins: collect((r) => r.grossMargin),
    pes,
  };
}
