import type {
  CompanyRef,
  CompanyProfileDTO,
  DateRange,
  FilingDTO,
  FilingsProvider,
  FundamentalsProvider,
  KeyMetricsDTO,
  MacroObservationDTO,
  MacroProvider,
  MarketDataProvider,
  NewsItemDTO,
  NewsProvider,
  PriceBarDTO,
  ProviderContext,
  StatementPeriodDTO,
} from "@/lib/providers/types";
import { MockProfileSchema, defaultProfileFor, type MockProfile } from "./profile";
import {
  generateDailyPrices,
  generateFilings,
  generateFundamentals,
  generateKeyMetrics,
  generateMacroSeries,
  generateNews,
} from "./generators";

function profileFor(company: CompanyRef): MockProfile {
  if (company.mockProfileJson) {
    try {
      return MockProfileSchema.parse(JSON.parse(company.mockProfileJson));
    } catch {
      // Malformed profile -> deterministic default; never fail.
    }
  }
  return defaultProfileFor(company.ticker);
}

/**
 * Terminal fallback provider for every category. Always configured, never
 * throws, fully deterministic. Everything it returns is labeled mock by the
 * pipeline (`source: "mock"`) and badged as illustrative in the UI.
 */
export class MockProvider
  implements
    MarketDataProvider,
    FundamentalsProvider,
    FilingsProvider,
    NewsProvider,
    MacroProvider
{
  readonly name = "mock";
  readonly categories = [
    "market-data",
    "fundamentals",
    "filings",
    "news",
    "macro",
  ] as const;

  isConfigured(): boolean {
    return true;
  }

  async getDailyPrices(
    company: CompanyRef,
    range: DateRange,
  ): Promise<PriceBarDTO[]> {
    return generateDailyPrices(company.ticker, profileFor(company), range);
  }

  async getStatements(
    company: CompanyRef,
    ctx: ProviderContext,
  ): Promise<StatementPeriodDTO[]> {
    if (company.isIndex) return [];
    return generateFundamentals(company.ticker, profileFor(company), ctx.asOf);
  }

  async getCompanyProfile(company: CompanyRef): Promise<CompanyProfileDTO> {
    return { ticker: company.ticker };
  }

  async getKeyMetrics(
    company: CompanyRef,
    ctx: ProviderContext,
  ): Promise<KeyMetricsDTO> {
    if (company.isIndex) return {};
    return generateKeyMetrics(company.ticker, profileFor(company), ctx.asOf);
  }

  async getRecentFilings(
    company: CompanyRef,
    since: Date,
    ctx: ProviderContext,
  ): Promise<FilingDTO[]> {
    if (company.isIndex) return [];
    return generateFilings(
      company.ticker,
      profileFor(company),
      company.country ?? "US",
      since,
      ctx.asOf,
    );
  }

  async getCompanyNews(
    company: CompanyRef,
    since: Date,
    ctx: ProviderContext,
  ): Promise<NewsItemDTO[]> {
    if (company.isIndex) return [];
    return generateNews(
      company.ticker,
      profileFor(company),
      company.sector ?? "General",
      since,
      ctx.asOf,
    );
  }

  async getSeries(
    seriesId: string,
    since: Date,
    ctx: ProviderContext,
  ): Promise<MacroObservationDTO[]> {
    return generateMacroSeries(seriesId, since, ctx.asOf);
  }
}

export const mockProvider = new MockProvider();
