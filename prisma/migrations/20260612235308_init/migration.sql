-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "cik" TEXT,
    "description" TEXT,
    "website" TEXT,
    "isIndex" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mockProfileJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceBar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "adjClose" REAL NOT NULL,
    "volume" REAL NOT NULL,
    "source" TEXT NOT NULL,
    CONSTRAINT "PriceBar_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FundamentalsPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "periodType" TEXT NOT NULL,
    "revenue" REAL,
    "grossProfit" REAL,
    "operatingIncome" REAL,
    "netIncome" REAL,
    "eps" REAL,
    "sharesOut" REAL,
    "totalAssets" REAL,
    "totalLiabilities" REAL,
    "totalEquity" REAL,
    "cash" REAL,
    "totalDebt" REAL,
    "currentAssets" REAL,
    "currentLiabilities" REAL,
    "ebitda" REAL,
    "operatingCashFlow" REAL,
    "capex" REAL,
    "dividendsPaid" REAL,
    "interestExpense" REAL,
    "reportedAt" DATETIME,
    "source" TEXT NOT NULL,
    CONSTRAINT "FundamentalsPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "price" REAL,
    "marketCap" REAL,
    "pe" REAL,
    "forwardPe" REAL,
    "peg" REAL,
    "evToEbitda" REAL,
    "priceToSales" REAL,
    "fcfYield" REAL,
    "dividendYield" REAL,
    "grossMargin" REAL,
    "operatingMargin" REAL,
    "netMargin" REAL,
    "roe" REAL,
    "roa" REAL,
    "debtToEquity" REAL,
    "netDebtToEbitda" REAL,
    "interestCoverage" REAL,
    "currentRatio" REAL,
    "revenueGrowthYoY" REAL,
    "revenueCagr3y" REAL,
    "epsGrowthYoY" REAL,
    "forwardGrowth" REAL,
    "marginExpansion" REAL,
    "return1m" REAL,
    "return3m" REAL,
    "return6m" REAL,
    "return12m" REAL,
    "relReturn1m" REAL,
    "relReturn3m" REAL,
    "relReturn6m" REAL,
    "relReturn12m" REAL,
    "earningsVolatility" REAL,
    "fcfConsistency" REAL,
    "sentiment90d" REAL,
    "dataQualityJson" TEXT,
    CONSTRAINT "MetricSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoreSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "valuationScore" REAL,
    "qualityScore" REAL,
    "growthScore" REAL,
    "momentumScore" REAL,
    "riskScore" REAL,
    "overallScore" REAL NOT NULL,
    "coverage" REAL NOT NULL,
    "rating" TEXT NOT NULL,
    "ratingReason" TEXT NOT NULL,
    "rank" INTEGER,
    "sectorRank" INTEGER,
    "breakdownJson" TEXT NOT NULL,
    CONSTRAINT "ScoreSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Filing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "accessionNo" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "filedAt" DATETIME NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "flagsJson" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL,
    CONSTRAINT "Filing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT,
    "summary" TEXT,
    "sentiment" REAL,
    "provider" TEXT NOT NULL,
    CONSTRAINT "NewsItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MacroIndicator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "MacroObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "indicatorId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "value" REAL NOT NULL,
    "source" TEXT NOT NULL,
    CONSTRAINT "MacroObservation_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "MacroIndicator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "note" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchlistItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "weightPct" REAL NOT NULL,
    "note" TEXT,
    CONSTRAINT "Position_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Position_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UpdateRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stepsJson" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "ProviderHealth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "lastSuccessAt" DATETIME,
    "lastErrorAt" DATETIME,
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ApiCache" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "payload" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "rowsOk" INTEGER NOT NULL,
    "rowsFailed" INTEGER NOT NULL,
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_ticker_key" ON "Company"("ticker");

-- CreateIndex
CREATE INDEX "PriceBar_date_idx" ON "PriceBar"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBar_companyId_date_key" ON "PriceBar"("companyId", "date");

-- CreateIndex
CREATE INDEX "FundamentalsPeriod_companyId_periodType_periodEnd_idx" ON "FundamentalsPeriod"("companyId", "periodType", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "FundamentalsPeriod_companyId_periodEnd_periodType_key" ON "FundamentalsPeriod"("companyId", "periodEnd", "periodType");

-- CreateIndex
CREATE INDEX "MetricSnapshot_asOf_idx" ON "MetricSnapshot"("asOf");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_companyId_asOf_key" ON "MetricSnapshot"("companyId", "asOf");

-- CreateIndex
CREATE INDEX "ScoreSnapshot_date_idx" ON "ScoreSnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreSnapshot_companyId_date_key" ON "ScoreSnapshot"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Filing_accessionNo_key" ON "Filing"("accessionNo");

-- CreateIndex
CREATE INDEX "Filing_companyId_filedAt_idx" ON "Filing"("companyId", "filedAt");

-- CreateIndex
CREATE INDEX "Filing_filedAt_idx" ON "Filing"("filedAt");

-- CreateIndex
CREATE INDEX "NewsItem_companyId_publishedAt_idx" ON "NewsItem"("companyId", "publishedAt");

-- CreateIndex
CREATE INDEX "NewsItem_publishedAt_idx" ON "NewsItem"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_companyId_url_key" ON "NewsItem"("companyId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "MacroIndicator_seriesId_key" ON "MacroIndicator"("seriesId");

-- CreateIndex
CREATE INDEX "MacroObservation_date_idx" ON "MacroObservation"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MacroObservation_indicatorId_date_key" ON "MacroObservation"("indicatorId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_companyId_key" ON "WatchlistItem"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_portfolioId_companyId_key" ON "Position"("portfolioId", "companyId");

-- CreateIndex
CREATE INDEX "UpdateRun_startedAt_idx" ON "UpdateRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderHealth_provider_category_key" ON "ProviderHealth"("provider", "category");

-- CreateIndex
CREATE INDEX "ApiCache_expiresAt_idx" ON "ApiCache"("expiresAt");
