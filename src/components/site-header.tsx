"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/screener", label: "Screener" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/backtest", label: "Backtest" },
  { href: "/methodology", label: "Methodology" },
  { href: "/data-sources", label: "Data Sources" },
  { href: "/admin", label: "Admin" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <FlaskConical className="size-5 text-primary" aria-hidden />
          <span className="whitespace-nowrap">InvestIQ Research Lab</span>
        </Link>
        <Badge variant="secondary" className="hidden sm:inline-flex">
          Educational — not advice
        </Badge>
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
