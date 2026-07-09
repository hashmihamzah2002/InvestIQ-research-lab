import { cn } from "@/lib/utils";

/** Compact 0-100 score bar with the value; color shifts with the score. */
export function ScoreBar({
  value,
  label,
  className,
}: {
  value: number | null;
  label?: string;
  className?: string;
}) {
  const width = value === null ? 0 : Math.max(2, Math.min(100, value));
  const tone =
    value === null
      ? "bg-muted-foreground/30"
      : value >= 72
        ? "bg-emerald-500"
        : value >= 58
          ? "bg-sky-500"
          : value >= 42
            ? "bg-amber-500"
            : "bg-red-500";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label ? (
        <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      ) : null}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", tone)}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs tabular-nums">
        {value === null ? "—" : value.toFixed(0)}
      </span>
    </div>
  );
}
