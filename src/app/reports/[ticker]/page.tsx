import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Download } from "lucide-react";
import { ComplianceNotice } from "@/components/compliance-notice";
import { Button } from "@/components/ui/button";
import { getStockDetail } from "@/lib/queries/stock-detail";
import { generateReport } from "@/lib/reports/generate";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/reports/[ticker]">,
): Promise<Metadata> {
  const { ticker } = await props.params;
  return { title: `${ticker.toUpperCase()} Research Report` };
}

export default async function ReportPage(props: PageProps<"/reports/[ticker]">) {
  const { ticker } = await props.params;
  const detail = await getStockDetail(ticker);
  if (!detail) notFound();

  const markdown = generateReport(detail, new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/stocks/${detail.company.ticker}`}>
            <ArrowLeft className="size-3.5" /> Back to {detail.company.ticker}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a
            href={`/api/stocks/${detail.company.ticker}/report?download=1`}
          >
            <Download className="size-3.5" /> Download .md
          </a>
        </Button>
      </div>

      <ComplianceNotice kind="educational" />

      <article className="prose prose-sm prose-neutral dark:prose-invert max-w-none rounded-lg border bg-card p-6 [&_table]:text-xs">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </article>
    </div>
  );
}
