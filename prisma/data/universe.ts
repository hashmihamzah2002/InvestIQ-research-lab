import type { MockProfile } from "@/lib/providers/mock/profile";

/**
 * Seed universe: 30 companies + the SPY index proxy.
 *
 * - `cik` values are real SEC CIKs (public, stable identifiers) so the
 *   SEC EDGAR adapter works out of the box; they are sanity-checked by the
 *   keyless live smoke test in tests/integration (LIVE_SMOKE=1).
 * - `mockProfile` is a hand-curated ILLUSTRATIVE shape (drift, vol, margins,
 *   leverage) so generated mock data has each company's character. The
 *   numbers approximate public reality but are NOT financial data.
 * - Sector labels follow GICS top-level conventions (Visa/Mastercard under
 *   Financials per the 2023 reclassification).
 */
export interface SeedCompany {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  exchange: string;
  country: string;
  cik: string | null;
  website: string;
  description: string;
  isIndex?: boolean;
  mockProfile: MockProfile;
}

const p = (profile: MockProfile): MockProfile => profile;

export const SEED_COMPANIES: readonly SeedCompany[] = [
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    sector: "Information Technology",
    industry: "Consumer Electronics",
    exchange: "NASDAQ",
    country: "US",
    cik: "0000320193",
    website: "https://www.apple.com",
    description:
      "Designs and sells iPhone, Mac, iPad, wearables, and a growing services ecosystem spanning the App Store, iCloud, and payments.",
    mockProfile: p({
      startPrice: 75, drift: 0.19, vol: 0.28, baseRevenue: 260e9,
      revenueGrowth: 0.08, grossMargin: 0.43, operatingMargin: 0.29,
      marginTrend: 0.003, taxRate: 0.16, sharesOut: 15.0e9,
      equityPctRevenue: 0.18, debtToEquity: 1.6, cashPctRevenue: 0.2,
      dividendPayout: 0.15, capexPctRevenue: 0.035, fundamentalsNoise: 0.05,
    }),
  },
  {
    ticker: "MSFT",
    name: "Microsoft Corporation",
    sector: "Information Technology",
    industry: "Software",
    exchange: "NASDAQ",
    country: "US",
    cik: "0000789019",
    website: "https://www.microsoft.com",
    description:
      "Cloud (Azure), productivity (Microsoft 365), operating systems, gaming, and AI infrastructure at global enterprise scale.",
    mockProfile: p({
      startPrice: 160, drift: 0.19, vol: 0.26, baseRevenue: 134e9,
      revenueGrowth: 0.13, grossMargin: 0.68, operatingMargin: 0.42,
      marginTrend: 0.002, taxRate: 0.18, sharesOut: 7.43e9,
      equityPctRevenue: 0.85, debtToEquity: 0.5, cashPctRevenue: 0.45,
      dividendPayout: 0.25, capexPctRevenue: 0.14, fundamentalsNoise: 0.04,
    }),
  },
  {
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    sector: "Information Technology",
    industry: "Semiconductors",
    exchange: "NASDAQ",
    country: "US",
    cik: "0001045810",
    website: "https://www.nvidia.com",
    description:
      "GPUs and accelerated-computing platforms powering AI training and inference, gaming, and data-center networking.",
    mockProfile: p({
      startPrice: 6, drift: 0.5, vol: 0.5, baseRevenue: 11e9,
      revenueGrowth: 0.42, grossMargin: 0.66, operatingMargin: 0.45,
      marginTrend: 0.012, taxRate: 0.14, sharesOut: 24.4e9,
      equityPctRevenue: 0.55, debtToEquity: 0.2, cashPctRevenue: 0.4,
      dividendPayout: 0.02, capexPctRevenue: 0.04, fundamentalsNoise: 0.18,
    }),
  },
  {
    ticker: "AMZN",
    name: "Amazon.com, Inc.",
    sector: "Consumer Discretionary",
    industry: "Internet Retail",
    exchange: "NASDAQ",
    country: "US",
    cik: "0001018724",
    website: "https://www.amazon.com",
    description:
      "E-commerce marketplace and logistics network plus AWS, the largest cloud-infrastructure business, and a growing ads franchise.",
    mockProfile: p({
      startPrice: 93, drift: 0.17, vol: 0.33, baseRevenue: 280e9,
      revenueGrowth: 0.12, grossMargin: 0.42, operatingMargin: 0.07,
      marginTrend: 0.008, taxRate: 0.18, sharesOut: 10.4e9,
      equityPctRevenue: 0.35, debtToEquity: 0.55, cashPctRevenue: 0.15,
      dividendPayout: 0, capexPctRevenue: 0.12, fundamentalsNoise: 0.1,
    }),
  },
  {
    ticker: "META",
    name: "Meta Platforms, Inc.",
    sector: "Communication Services",
    industry: "Interactive Media",
    exchange: "NASDAQ",
    country: "US",
    cik: "0001326801",
    website: "https://about.meta.com",
    description:
      "Family of apps (Facebook, Instagram, WhatsApp) monetized by ads, with heavy investment in AI and Reality Labs hardware.",
    mockProfile: p({
      startPrice: 210, drift: 0.16, vol: 0.38, baseRevenue: 70e9,
      revenueGrowth: 0.15, grossMargin: 0.81, operatingMargin: 0.36,
      marginTrend: 0.004, taxRate: 0.17, sharesOut: 2.55e9,
      equityPctRevenue: 0.95, debtToEquity: 0.25, cashPctRevenue: 0.4,
      dividendPayout: 0.04, capexPctRevenue: 0.2, fundamentalsNoise: 0.12,
    }),
  },
  {
    ticker: "GOOGL",
    name: "Alphabet Inc.",
    sector: "Communication Services",
    industry: "Interactive Media",
    exchange: "NASDAQ",
    country: "US",
    cik: "0001652044",
    website: "https://abc.xyz",
    description:
      "Google Search, YouTube, Android, and Google Cloud, with AI research (DeepMind/Gemini) woven through every product line.",
    mockProfile: p({
      startPrice: 68, drift: 0.17, vol: 0.3, baseRevenue: 162e9,
      revenueGrowth: 0.13, grossMargin: 0.56, operatingMargin: 0.28,
      marginTrend: 0.004, taxRate: 0.16, sharesOut: 12.2e9,
      equityPctRevenue: 0.95, debtToEquity: 0.12, cashPctRevenue: 0.45,
      dividendPayout: 0.05, capexPctRevenue: 0.13, fundamentalsNoise: 0.06,
    }),
  },
  {
    ticker: "TSLA",
    name: "Tesla, Inc.",
    sector: "Consumer Discretionary",
    industry: "Automobiles",
    exchange: "NASDAQ",
    country: "US",
    cik: "0001318605",
    website: "https://www.tesla.com",
    description:
      "Electric vehicles, energy storage, and charging, with ambitions in autonomy and robotics; famously volatile sentiment.",
    mockProfile: p({
      startPrice: 29, drift: 0.3, vol: 0.6, baseRevenue: 24.6e9,
      revenueGrowth: 0.25, grossMargin: 0.19, operatingMargin: 0.08,
      marginTrend: -0.002, taxRate: 0.12, sharesOut: 3.2e9,
      equityPctRevenue: 0.6, debtToEquity: 0.15, cashPctRevenue: 0.3,
      dividendPayout: 0, capexPctRevenue: 0.08, fundamentalsNoise: 0.25,
    }),
  },
  {
    ticker: "NKE",
    name: "NIKE, Inc.",
    sector: "Consumer Discretionary",
    industry: "Footwear & Apparel",
    exchange: "NYSE",
    country: "US",
    cik: "0000320187",
    website: "https://www.nike.com",
    description:
      "Global athletic footwear and apparel brand navigating a direct-to-consumer transition and inventory cycles.",
    mockProfile: p({
      startPrice: 100, drift: 0.02, vol: 0.3, baseRevenue: 39e9,
      revenueGrowth: 0.04, grossMargin: 0.44, operatingMargin: 0.115,
      marginTrend: -0.003, taxRate: 0.15, sharesOut: 1.5e9,
      equityPctRevenue: 0.35, debtToEquity: 0.9, cashPctRevenue: 0.22,
      dividendPayout: 0.35, capexPctRevenue: 0.025, fundamentalsNoise: 0.09,
    }),
  },
  {
    ticker: "COST",
    name: "Costco Wholesale Corporation",
    sector: "Consumer Staples",
    industry: "Discount Stores",
    exchange: "NASDAQ",
    country: "US",
    cik: "0000909832",
    website: "https://www.costco.com",
    description:
      "Membership warehouse retailer with famously low margins, high renewal rates, and steady comparable-sales growth.",
    mockProfile: p({
      startPrice: 290, drift: 0.17, vol: 0.22, baseRevenue: 153e9,
      revenueGrowth: 0.09, grossMargin: 0.125, operatingMargin: 0.034,
      marginTrend: 0.001, taxRate: 0.24, sharesOut: 0.444e9,
      equityPctRevenue: 0.12, debtToEquity: 0.45, cashPctRevenue: 0.08,
      dividendPayout: 0.28, capexPctRevenue: 0.022, fundamentalsNoise: 0.04,
    }),
  },
  {
    ticker: "WMT",
    name: "Walmart Inc.",
    sector: "Consumer Staples",
    industry: "Discount Stores",
    exchange: "NYSE",
    country: "US",
    cik: "0000104169",
    website: "https://www.walmart.com",
    description:
      "The largest retailer by revenue, expanding grocery e-commerce, advertising, and marketplace businesses.",
    mockProfile: p({
      startPrice: 39, drift: 0.13, vol: 0.2, baseRevenue: 524e9,
      revenueGrowth: 0.05, grossMargin: 0.245, operatingMargin: 0.042,
      marginTrend: 0.001, taxRate: 0.25, sharesOut: 8.0e9,
      equityPctRevenue: 0.15, debtToEquity: 0.7, cashPctRevenue: 0.03,
      dividendPayout: 0.35, capexPctRevenue: 0.022, fundamentalsNoise: 0.04,
    }),
  },
  {
    ticker: "JPM",
    name: "JPMorgan Chase & Co.",
    sector: "Financials",
    industry: "Banks",
    exchange: "NYSE",
    country: "US",
    cik: "0000019617",
    website: "https://www.jpmorganchase.com",
    description:
      "The largest US bank by assets: consumer banking, investment banking, markets, payments, and asset management.",
    mockProfile: p({
      startPrice: 135, drift: 0.13, vol: 0.28, baseRevenue: 118e9,
      revenueGrowth: 0.07, grossMargin: null, operatingMargin: 0.38,
      marginTrend: 0, taxRate: 0.2, sharesOut: 2.8e9,
      equityPctRevenue: 2.4, debtToEquity: 1.4, cashPctRevenue: 3.0,
      dividendPayout: 0.3, capexPctRevenue: 0.0, fundamentalsNoise: 0.08,
    }),
  },
  {
    ticker: "V",
    name: "Visa Inc.",
    sector: "Financials",
    industry: "Payments",
    exchange: "NYSE",
    country: "US",
    cik: "0001403161",
    website: "https://www.visa.com",
    description:
      "Global payments network earning fees on card volume — an asset-light toll road on consumer spending.",
    mockProfile: p({
      startPrice: 190, drift: 0.14, vol: 0.24, baseRevenue: 23e9,
      revenueGrowth: 0.1, grossMargin: 0.8, operatingMargin: 0.66,
      marginTrend: 0.001, taxRate: 0.19, sharesOut: 1.95e9,
      equityPctRevenue: 1.5, debtToEquity: 0.55, cashPctRevenue: 0.7,
      dividendPayout: 0.21, capexPctRevenue: 0.03, fundamentalsNoise: 0.04,
    }),
  },
  {
    ticker: "MA",
    name: "Mastercard Incorporated",
    sector: "Financials",
    industry: "Payments",
    exchange: "NYSE",
    country: "US",
    cik: "0001141391",
    website: "https://www.mastercard.com",
    description:
      "Payments network and services peer to Visa, with faster-growing value-added services revenue.",
    mockProfile: p({
      startPrice: 300, drift: 0.14, vol: 0.25, baseRevenue: 17e9,
      revenueGrowth: 0.11, grossMargin: 0.76, operatingMargin: 0.57,
      marginTrend: 0.001, taxRate: 0.18, sharesOut: 0.92e9,
      equityPctRevenue: 0.4, debtToEquity: 1.7, cashPctRevenue: 0.45,
      dividendPayout: 0.19, capexPctRevenue: 0.03, fundamentalsNoise: 0.04,
    }),
  },
  {
    ticker: "KO",
    name: "The Coca-Cola Company",
    sector: "Consumer Staples",
    industry: "Beverages",
    exchange: "NYSE",
    country: "US",
    cik: "0000021344",
    website: "https://www.coca-colacompany.com",
    description:
      "Concentrate-model beverage giant with a vast bottler network and a six-decade dividend growth streak.",
    mockProfile: p({
      startPrice: 55, drift: 0.07, vol: 0.18, baseRevenue: 37e9,
      revenueGrowth: 0.05, grossMargin: 0.6, operatingMargin: 0.29,
      marginTrend: 0.001, taxRate: 0.19, sharesOut: 4.3e9,
      equityPctRevenue: 0.6, debtToEquity: 1.7, cashPctRevenue: 0.3,
      dividendPayout: 0.72, capexPctRevenue: 0.04, fundamentalsNoise: 0.05,
    }),
  },
  {
    ticker: "PEP",
    name: "PepsiCo, Inc.",
    sector: "Consumer Staples",
    industry: "Beverages",
    exchange: "NASDAQ",
    country: "US",
    cik: "0000077476",
    website: "https://www.pepsico.com",
    description:
      "Snacks (Frito-Lay) plus beverages — a staples portfolio with pricing power and a long dividend record.",
    mockProfile: p({
      startPrice: 135, drift: 0.05, vol: 0.18, baseRevenue: 67e9,
      revenueGrowth: 0.05, grossMargin: 0.54, operatingMargin: 0.15,
      marginTrend: 0, taxRate: 0.2, sharesOut: 1.37e9,
      equityPctRevenue: 0.22, debtToEquity: 2.2, cashPctRevenue: 0.1,
      dividendPayout: 0.65, capexPctRevenue: 0.05, fundamentalsNoise: 0.05,
    }),
  },
  {
    ticker: "MCD",
    name: "McDonald's Corporation",
    sector: "Consumer Discretionary",
    industry: "Restaurants",
    exchange: "NYSE",
    country: "US",
    cik: "0000063908",
    website: "https://www.mcdonalds.com",
    description:
      "Franchise-heavy restaurant royalty model; buybacks have driven book equity negative — a classic accounting quirk.",
    mockProfile: p({
      startPrice: 200, drift: 0.09, vol: 0.2, baseRevenue: 21e9,
      revenueGrowth: 0.05, grossMargin: 0.55, operatingMargin: 0.44,
      marginTrend: 0.001, taxRate: 0.22, sharesOut: 0.715e9,
      equityPctRevenue: -0.22, debtToEquity: 9.5, cashPctRevenue: 0.12,
      dividendPayout: 0.55, capexPctRevenue: 0.1, fundamentalsNoise: 0.05,
    }),
  },
  {
    ticker: "DIS",
    name: "The Walt Disney Company",
    sector: "Communication Services",
    industry: "Entertainment",
    exchange: "NYSE",
    country: "US",
    cik: "0001744489",
    website: "https://www.thewaltdisneycompany.com",
    description:
      "Parks, streaming (Disney+/Hulu), studios, and sports (ESPN) — a media conglomerate mid-transition.",
    mockProfile: p({
      startPrice: 145, drift: 0.03, vol: 0.3, baseRevenue: 70e9,
      revenueGrowth: 0.04, grossMargin: 0.35, operatingMargin: 0.12,
      marginTrend: 0.002, taxRate: 0.2, sharesOut: 1.81e9,
      equityPctRevenue: 1.2, debtToEquity: 0.5, cashPctRevenue: 0.12,
      dividendPayout: 0.1, capexPctRevenue: 0.07, fundamentalsNoise: 0.12,
    }),
  },
  {
    ticker: "NFLX",
    name: "Netflix, Inc.",
    sector: "Communication Services",
    industry: "Entertainment",
    exchange: "NASDAQ",
    country: "US",
    cik: "0001065280",
    website: "https://www.netflix.com",
    description:
      "Streaming leader monetizing via subscriptions and a growing ads tier, with enormous content spend.",
    mockProfile: p({
      startPrice: 330, drift: 0.19, vol: 0.4, baseRevenue: 20e9,
      revenueGrowth: 0.14, grossMargin: 0.43, operatingMargin: 0.21,
      marginTrend: 0.008, taxRate: 0.14, sharesOut: 0.43e9,
      equityPctRevenue: 0.55, debtToEquity: 0.75, cashPctRevenue: 0.3,
      dividendPayout: 0, capexPctRevenue: 0.07, fundamentalsNoise: 0.1,
    }),
  },
  {
    ticker: "AMD",
    name: "Advanced Micro Devices, Inc.",
    sector: "Information Technology",
    industry: "Semiconductors",
    exchange: "NASDAQ",
    country: "US",
    cik: "0000002488",
    website: "https://www.amd.com",
    description:
      "CPUs and data-center GPUs challenging incumbents in both client and AI-accelerator markets.",
    mockProfile: p({
      startPrice: 47, drift: 0.28, vol: 0.5, baseRevenue: 6.7e9,
      revenueGrowth: 0.25, grossMargin: 0.47, operatingMargin: 0.14,
      marginTrend: 0.008, taxRate: 0.13, sharesOut: 1.62e9,
      equityPctRevenue: 1.6, debtToEquity: 0.08, cashPctRevenue: 0.35,
      dividendPayout: 0, capexPctRevenue: 0.05, fundamentalsNoise: 0.16,
    }),
  },
  {
    ticker: "INTC",
    name: "Intel Corporation",
    sector: "Information Technology",
    industry: "Semiconductors",
    exchange: "NASDAQ",
    country: "US",
    cik: "0000050863",
    website: "https://www.intel.com",
    description:
      "x86 incumbent attempting a costly foundry turnaround amid share losses and heavy capital spending.",
    mockProfile: p({
      startPrice: 60, drift: -0.06, vol: 0.4, baseRevenue: 72e9,
      revenueGrowth: -0.02, grossMargin: 0.42, operatingMargin: 0.06,
      marginTrend: -0.015, taxRate: 0.15, sharesOut: 4.3e9,
      equityPctRevenue: 1.4, debtToEquity: 0.55, cashPctRevenue: 0.3,
      dividendPayout: 0.08, capexPctRevenue: 0.32, fundamentalsNoise: 0.2,
    }),
  },
  {
    ticker: "CRM",
    name: "Salesforce, Inc.",
    sector: "Information Technology",
    industry: "Software",
    exchange: "NYSE",
    country: "US",
    cik: "0001108524",
    website: "https://www.salesforce.com",
    description:
      "CRM and enterprise-workflow SaaS pivoting from growth-at-all-costs to margin discipline and AI agents.",
    mockProfile: p({
      startPrice: 165, drift: 0.11, vol: 0.32, baseRevenue: 17e9,
      revenueGrowth: 0.15, grossMargin: 0.74, operatingMargin: 0.14,
      marginTrend: 0.02, taxRate: 0.2, sharesOut: 0.97e9,
      equityPctRevenue: 1.7, debtToEquity: 0.2, cashPctRevenue: 0.4,
      dividendPayout: 0.05, capexPctRevenue: 0.03, fundamentalsNoise: 0.08,
    }),
  },
  {
    ticker: "ADBE",
    name: "Adobe Inc.",
    sector: "Information Technology",
    industry: "Software",
    exchange: "NASDAQ",
    country: "US",
    cik: "0000796343",
    website: "https://www.adobe.com",
    description:
      "Creative Cloud and document software with rich margins, facing investor debate over generative-AI disruption.",
    mockProfile: p({
      startPrice: 330, drift: 0.07, vol: 0.3, baseRevenue: 11.2e9,
      revenueGrowth: 0.12, grossMargin: 0.88, operatingMargin: 0.34,
      marginTrend: 0.002, taxRate: 0.18, sharesOut: 0.44e9,
      equityPctRevenue: 0.75, debtToEquity: 0.4, cashPctRevenue: 0.35,
      dividendPayout: 0, capexPctRevenue: 0.02, fundamentalsNoise: 0.05,
    }),
  },
  {
    ticker: "SHOP",
    name: "Shopify Inc.",
    sector: "Information Technology",
    industry: "Software",
    exchange: "NYSE",
    country: "CA",
    cik: "0001594805",
    website: "https://www.shopify.com",
    description:
      "Commerce operating system for merchants, taking a rising share of GMV through payments and logistics software.",
    mockProfile: p({
      startPrice: 40, drift: 0.24, vol: 0.55, baseRevenue: 1.6e9,
      revenueGrowth: 0.33, grossMargin: 0.51, operatingMargin: 0.02,
      marginTrend: 0.025, taxRate: 0.15, sharesOut: 1.29e9,
      equityPctRevenue: 2.5, debtToEquity: 0.1, cashPctRevenue: 1.5,
      dividendPayout: 0, capexPctRevenue: 0.02, fundamentalsNoise: 0.22,
    }),
  },
  {
    ticker: "RY",
    name: "Royal Bank of Canada",
    sector: "Financials",
    industry: "Banks",
    exchange: "NYSE",
    country: "CA",
    cik: "0001000275",
    website: "https://www.rbc.com",
    description:
      "Canada's largest bank: retail, capital markets, and wealth management with a long dividend history.",
    mockProfile: p({
      startPrice: 80, drift: 0.09, vol: 0.22, baseRevenue: 35e9,
      revenueGrowth: 0.06, grossMargin: null, operatingMargin: 0.34,
      marginTrend: 0, taxRate: 0.21, sharesOut: 1.41e9,
      equityPctRevenue: 2.2, debtToEquity: 1.1, cashPctRevenue: 2.5,
      dividendPayout: 0.45, capexPctRevenue: 0.0, fundamentalsNoise: 0.07,
    }),
  },
  {
    ticker: "TD",
    name: "The Toronto-Dominion Bank",
    sector: "Financials",
    industry: "Banks",
    exchange: "NYSE",
    country: "CA",
    cik: "0000947263",
    website: "https://www.td.com",
    description:
      "Major Canadian bank with a large US retail footprint, working through regulatory remediation.",
    mockProfile: p({
      startPrice: 55, drift: 0.05, vol: 0.24, baseRevenue: 31e9,
      revenueGrowth: 0.05, grossMargin: null, operatingMargin: 0.3,
      marginTrend: -0.004, taxRate: 0.21, sharesOut: 1.75e9,
      equityPctRevenue: 2.5, debtToEquity: 1.0, cashPctRevenue: 2.8,
      dividendPayout: 0.5, capexPctRevenue: 0.0, fundamentalsNoise: 0.09,
    }),
  },
  {
    ticker: "ENB",
    name: "Enbridge Inc.",
    sector: "Energy",
    industry: "Oil & Gas Midstream",
    exchange: "NYSE",
    country: "CA",
    cik: "0000895728",
    website: "https://www.enbridge.com",
    description:
      "North American pipeline and utility infrastructure with contracted cash flows and a high dividend payout.",
    mockProfile: p({
      startPrice: 40, drift: 0.06, vol: 0.25, baseRevenue: 38e9,
      revenueGrowth: 0.04, grossMargin: 0.4, operatingMargin: 0.2,
      marginTrend: 0, taxRate: 0.2, sharesOut: 2.18e9,
      equityPctRevenue: 1.2, debtToEquity: 1.3, cashPctRevenue: 0.05,
      dividendPayout: 0.68, capexPctRevenue: 0.15, fundamentalsNoise: 0.08,
    }),
  },
  {
    ticker: "BN",
    name: "Brookfield Corporation",
    sector: "Financials",
    industry: "Asset Management",
    exchange: "NYSE",
    country: "CA",
    cik: "0001001085",
    website: "https://www.brookfield.com",
    description:
      "Alternative-asset giant across infrastructure, renewables, real estate, credit, and insurance.",
    mockProfile: p({
      startPrice: 32, drift: 0.11, vol: 0.35, baseRevenue: 63e9,
      revenueGrowth: 0.1, grossMargin: null, operatingMargin: 0.14,
      marginTrend: 0.001, taxRate: 0.18, sharesOut: 1.54e9,
      equityPctRevenue: 1.6, debtToEquity: 1.9, cashPctRevenue: 0.2,
      dividendPayout: 0.12, capexPctRevenue: 0.05, fundamentalsNoise: 0.14,
    }),
  },
  {
    ticker: "CNI",
    name: "Canadian National Railway Company",
    sector: "Industrials",
    industry: "Railroads",
    exchange: "NYSE",
    country: "CA",
    cik: "0000016868",
    website: "https://www.cn.ca",
    description:
      "Transcontinental freight rail network — a capital-intensive, wide-moat cyclical with strong operating ratios.",
    mockProfile: p({
      startPrice: 90, drift: 0.07, vol: 0.22, baseRevenue: 11e9,
      revenueGrowth: 0.04, grossMargin: 0.55, operatingMargin: 0.4,
      marginTrend: 0, taxRate: 0.24, sharesOut: 0.63e9,
      equityPctRevenue: 1.5, debtToEquity: 0.85, cashPctRevenue: 0.05,
      dividendPayout: 0.4, capexPctRevenue: 0.18, fundamentalsNoise: 0.06,
    }),
  },
  {
    ticker: "LULU",
    name: "Lululemon Athletica Inc.",
    sector: "Consumer Discretionary",
    industry: "Apparel Retail",
    exchange: "NASDAQ",
    country: "US",
    cik: "0001397187",
    website: "https://www.lululemon.com",
    description:
      "Premium athletic-apparel brand with high margins, international expansion, and fashion-cycle risk.",
    mockProfile: p({
      startPrice: 230, drift: 0.09, vol: 0.38, baseRevenue: 4.4e9,
      revenueGrowth: 0.15, grossMargin: 0.56, operatingMargin: 0.21,
      marginTrend: 0.001, taxRate: 0.28, sharesOut: 0.12e9,
      equityPctRevenue: 0.45, debtToEquity: 0.15, cashPctRevenue: 0.25,
      dividendPayout: 0, capexPctRevenue: 0.06, fundamentalsNoise: 0.1,
    }),
  },
  {
    ticker: "COIN",
    name: "Coinbase Global, Inc.",
    sector: "Financials",
    industry: "Capital Markets",
    exchange: "NASDAQ",
    country: "US",
    cik: "0001679788",
    website: "https://www.coinbase.com",
    description:
      "Largest US crypto exchange; revenue swings violently with crypto volumes, plus growing subscription and custody lines.",
    mockProfile: p({
      startPrice: 250, drift: 0.08, vol: 0.85, ipoDate: "2021-04-14",
      baseRevenue: 5.8e9, revenueGrowth: 0.18, grossMargin: 0.84,
      operatingMargin: 0.12, marginTrend: 0.004, taxRate: 0.2,
      sharesOut: 0.26e9, equityPctRevenue: 1.4, debtToEquity: 0.45,
      cashPctRevenue: 1.0, dividendPayout: 0, capexPctRevenue: 0.02,
      fundamentalsNoise: 0.38,
    }),
  },
  // --- Index proxy (prices only) ---
  {
    ticker: "SPY",
    name: "S&P 500 Index Proxy (SPY)",
    sector: "Index",
    industry: "Index",
    exchange: "NYSE Arca",
    country: "US",
    cik: null,
    website: "https://www.spglobal.com/spdji/",
    description:
      "Benchmark proxy used for relative-strength and backtest comparisons. Not part of the scored universe.",
    isIndex: true,
    mockProfile: p({
      startPrice: 320, drift: 0.1, vol: 0.17, baseRevenue: 1e9,
      revenueGrowth: 0, grossMargin: null, operatingMargin: 0.1,
      marginTrend: 0, taxRate: 0.2, sharesOut: 1e9,
      equityPctRevenue: 1, debtToEquity: 0, cashPctRevenue: 0.1,
      dividendPayout: 0, capexPctRevenue: 0, fundamentalsNoise: 0.01,
    }),
  },
];

/** The scored universe (excludes index proxies). */
export const UNIVERSE_TICKERS = SEED_COMPANIES.filter((c) => !c.isIndex).map(
  (c) => c.ticker,
);

export const INDEX_TICKER = "SPY";
