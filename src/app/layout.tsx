import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "InvestIQ Research Lab",
    template: "%s · InvestIQ Research Lab",
  },
  description:
    "Educational stock research platform with a transparent, explainable scoring model. Not investment advice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <TooltipProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
            {children}
          </main>
          <SiteFooter />
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
