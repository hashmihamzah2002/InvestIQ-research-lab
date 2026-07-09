import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RATING_LABELS } from "@/lib/scoring/constants";
import type { Rating } from "@/lib/db/json";
import { cn } from "@/lib/utils";

const RATING_STYLES: Record<Rating, string> = {
  STRONG_CANDIDATE:
    "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
  CANDIDATE:
    "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
  WATCHLIST:
    "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  AVOID:
    "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
};

export function RatingBadge({
  rating,
  className,
}: {
  rating: Rating;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn("font-medium", RATING_STYLES[rating], className)}
        >
          {RATING_LABELS[rating]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Educational model output computed from stated inputs and weights — not
        a personal recommendation. See Methodology.
      </TooltipContent>
    </Tooltip>
  );
}
