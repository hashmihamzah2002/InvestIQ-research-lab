import { Info } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScoreBar } from "@/components/score-bar";
import { formatRawValue } from "@/lib/scoring/format";
import type { ScoreBreakdown } from "@/lib/scoring/types";

/**
 * The explainability table: every factor's raw input, normalized score,
 * weight, and contribution to the pillar — no black box.
 */
export function ScoreBreakdownView({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {breakdown.pillars.map((pillar) => (
          <ScoreBar
            key={pillar.key}
            label={`${pillar.label} (${(pillar.weight * 100).toFixed(0)}%)`}
            value={pillar.score}
          />
        ))}
      </div>

      <Accordion type="multiple" className="w-full">
        {breakdown.pillars.map((pillar) => (
          <AccordionItem key={pillar.key} value={pillar.key}>
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                {pillar.label}
                <span className="text-xs font-normal text-muted-foreground">
                  score {pillar.score === null ? "n/a" : pillar.score.toFixed(1)} ·
                  coverage {(pillar.coverage * 100).toFixed(0)}%
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Factor</TableHead>
                    <TableHead className="text-right">Raw input</TableHead>
                    <TableHead className="text-right">Normalized</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">Contribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pillar.factors.map((factor) => {
                    const availableWeight = pillar.factors
                      .filter((f) => f.available)
                      .reduce((a, f) => a + f.weight, 0);
                    const contribution =
                      factor.available && factor.normalized !== null && availableWeight > 0
                        ? (factor.normalized * factor.weight) / availableWeight
                        : null;
                    return (
                      <TableRow
                        key={factor.key}
                        className={factor.available ? undefined : "opacity-60"}
                      >
                        <TableCell className="max-w-56">
                          <span className="flex items-center gap-1.5">
                            {factor.label}
                            {factor.note ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="size-3.5 shrink-0 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-72">
                                  {factor.note}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatRawValue(factor.rawValue, factor.rawUnit)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {factor.normalized === null
                            ? "n/a"
                            : `${factor.normalized.toFixed(1)}/100`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(factor.weight * 100).toFixed(0)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {contribution === null ? "—" : `${contribution.toFixed(1)} pts`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {breakdown.overrides.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <p className="font-medium">Rating overrides applied</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {breakdown.overrides.map((o) => (
              <li key={o.code}>{o.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
