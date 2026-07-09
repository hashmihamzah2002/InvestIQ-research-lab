import { AlertTriangle, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fmtDateTime } from "@/lib/format";
import { getFreshness } from "@/lib/queries/freshness";

/**
 * Server component: shows the last-update timestamp, and a loud warning when
 * data is stale (>36h) or the last run failed. Placed on every data page.
 */
export async function FreshnessBanner() {
  const freshness = await getFreshness();

  if (freshness.isStale) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>Data freshness warning</AlertTitle>
        <AlertDescription>
          {freshness.staleReason} Data may be delayed or incomplete — verify
          timestamps on every metric before relying on it.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="size-3.5" aria-hidden />
      Last data refresh: {fmtDateTime(freshness.lastSuccessAt)}
      {freshness.status === "PARTIAL"
        ? " (partial — some providers failed; see Admin)"
        : ""}
    </p>
  );
}
