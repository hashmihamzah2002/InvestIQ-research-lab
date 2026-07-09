import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Provenance chip: which provider supplied a datum and when. Mock data is
 * loudly badged as illustrative (compliance requirement).
 */
export function SourceBadge({
  source,
  asOf,
  className,
}: {
  source: string | null | undefined;
  asOf?: Date | string | null;
  className?: string;
}) {
  const isMock = source === "mock";
  const label = source ?? "unknown";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Badge
        variant="outline"
        className={cn(
          "px-1.5 py-0 text-[10px] uppercase tracking-wide",
          isMock &&
            "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
        )}
      >
        {isMock ? "mock — illustrative" : label}
      </Badge>
      {asOf ? <span>as of {fmtDate(asOf)}</span> : null}
    </span>
  );
}
