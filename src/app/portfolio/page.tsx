import type { Metadata } from "next";
import { ComplianceNotice } from "@/components/compliance-notice";
import { FreshnessBanner } from "@/components/freshness-banner";
import { getPortfolios, getWatchlist } from "@/lib/queries/portfolio";
import { listTickers } from "@/lib/queries/stock-detail";
import { PortfolioClient } from "./portfolio-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Portfolio & Watchlist" };

export default async function PortfolioPage() {
  const [watchlist, portfolios, universe] = await Promise.all([
    getWatchlist(),
    getPortfolios(),
    listTickers(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Portfolio &amp; Watchlist
          </h1>
          <p className="text-sm text-muted-foreground">
            Track companies and experiment with hypothetical allocations.
            Nothing here connects to a brokerage or places orders.
          </p>
        </div>
        <FreshnessBanner />
      </div>
      <ComplianceNotice kind="suitability" />
      <PortfolioClient
        initialWatchlist={watchlist}
        initialPortfolios={portfolios}
        universe={universe}
      />
    </div>
  );
}
