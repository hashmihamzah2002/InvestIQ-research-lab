import type { Metadata } from "next";
import { ComplianceNotice } from "@/components/compliance-notice";
import { FreshnessBanner } from "@/components/freshness-banner";
import { runScreener, ScreenerQuerySchema } from "@/lib/queries/screener";
import { ScreenerClient } from "./screener-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Screener" };

export default async function ScreenerPage() {
  const initial = await runScreener(ScreenerQuerySchema.parse({}));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock Screener</h1>
          <p className="text-sm text-muted-foreground">
            Filter the universe on fundamentals, valuation, and model scores.
          </p>
        </div>
        <FreshnessBanner />
      </div>
      <ScreenerClient initial={initial} />
      <ComplianceNotice kind="educational" />
    </div>
  );
}
