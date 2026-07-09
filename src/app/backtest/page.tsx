import type { Metadata } from "next";
import { ComplianceNotice } from "@/components/compliance-notice";
import { FreshnessBanner } from "@/components/freshness-banner";
import { BacktestClient } from "./backtest-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Backtest" };

export default function BacktestPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Backtest</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Replay the scoring model over history: at each rebalance the
            universe is re-scored using only information public at that date,
            the top N are held equal-weight, and costs are charged on every
            trade. This demonstrates the mechanics of the model — it does not
            estimate future performance.
          </p>
        </div>
        <FreshnessBanner />
      </div>
      <BacktestClient />
      <ComplianceNotice kind="educational" />
    </div>
  );
}
