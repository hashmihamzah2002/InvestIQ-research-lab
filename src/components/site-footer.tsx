import Link from "next/link";
import { FOOTER_DISCLAIMER } from "@/components/compliance-notice";

export function SiteFooter() {
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
          <Link href="/admin" className="underline-offset-4 hover:underline">
            Data quality
          </Link>
        </div>
      </div>
    </footer>
  );
}
