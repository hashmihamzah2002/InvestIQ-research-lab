import Link from "next/link";
import { FOOTER_DISCLAIMER } from "@/components/compliance-notice";
import { getEnv } from "@/lib/config/env";

export function SiteFooter() {
  const demo = getEnv().DEMO_MODE === 1;
  return (
    <footer className="mt-12 border-t bg-muted/30">
      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-8 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          Important disclaimer
        </p>
        <p className="max-w-4xl leading-relaxed">{FOOTER_DISCLAIMER}</p>
        <div className="flex flex-wrap gap-4 pt-2">
          <Link href="/methodology" className="underline-offset-4 hover:underline">
            How scoring works
          </Link>
          <Link href="/data-sources" className="underline-offset-4 hover:underline">
            Data sources &amp; limitations
          </Link>
          {demo ? (
            <a
              href="https://github.com/hashmihamzah2002/InvestIQ-research-lab"
              className="underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source on GitHub
            </a>
          ) : (
            <Link href="/admin" className="underline-offset-4 hover:underline">
              Data quality
            </Link>
          )}
        </div>
      </div>
    </footer>
  );
}
