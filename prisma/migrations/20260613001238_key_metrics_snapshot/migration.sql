-- CreateTable
CREATE TABLE "KeyMetricsSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "forwardPe" REAL,
    "forwardGrowth" REAL,
    "epsRevisionTrend" REAL,
    "dividendYield" REAL,
    "source" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "KeyMetricsSnapshot_companyId_asOf_key" ON "KeyMetricsSnapshot"("companyId", "asOf");
