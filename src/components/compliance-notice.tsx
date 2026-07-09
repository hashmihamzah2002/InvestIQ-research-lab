import { GraduationCap, Info, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type NoticeKind = "educational" | "suitability" | "data";

const NOTICES: Record<
  NoticeKind,
  { icon: React.ComponentType<{ className?: string }>; title: string; body: string }
> = {
  educational: {
    icon: GraduationCap,
    title: "Educational research only — not investment advice",
    body:
      "InvestIQ is a learning tool. Scores and ratings are model outputs computed from public data and stated assumptions. They are not personalized recommendations to buy or sell any security.",
  },
  suitability: {
    icon: ShieldAlert,
    title: "Suitability matters",
    body:
      "Before acting on any research, consider your risk tolerance, time horizon, tax situation, and diversification needs — and speak with a licensed financial advisor. A scoring model does not know your personal circumstances. Avoid concentrating a portfolio in any single stock.",
  },
  data: {
    icon: Info,
    title: "Data may be delayed, incomplete, or illustrative",
    body:
      "Free data sources update on a delay and may have gaps. Every metric shows its source and timestamp; anything marked “mock” is deterministic illustrative data for demonstration, not market data.",
  },
};

/**
 * Standardized compliance copy. Use this component instead of writing ad-hoc
 * disclaimer text — the wording here is covered by the banned-phrase
 * compliance test and reviewed once.
 */
export function ComplianceNotice({
  kind,
  className,
}: {
  kind: NoticeKind;
  className?: string;
}) {
  const notice = NOTICES[kind];
  const Icon = notice.icon;
  return (
    <Alert className={className}>
      <Icon className="size-4" />
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription>{notice.body}</AlertDescription>
    </Alert>
  );
}

/** Plain-text disclaimer used by the footer and generated reports. */
export const FOOTER_DISCLAIMER =
  "InvestIQ Research Lab provides educational research only and is not a registered investment adviser, broker, or dealer. Nothing here is personalized financial advice, an offer, or a solicitation. Scores are transparent model outputs based on public data that may be delayed, incomplete, or simulated. Investing involves risk, including possible loss of principal. Past performance does not determine future results. Consider your own risk tolerance, time horizon, and diversification, and consult a licensed financial advisor before making investment decisions.";
