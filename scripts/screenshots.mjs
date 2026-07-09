/**
 * Regenerate the README screenshots in docs/screenshots/.
 *
 * Prereqs (playwright is intentionally NOT a project dependency):
 *   npm i -D playwright && npx playwright install chromium
 *   npm run start            # production server on :3000 (or npm run dev)
 * Then:
 *   node scripts/screenshots.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const OUT = "docs/screenshots";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2, // crisp on GitHub
});

async function go(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800); // let recharts finish animating
}

// 1. Dashboard
await go("/");
await page.screenshot({ path: `${OUT}/dashboard.png` });
console.log("dashboard.png");

// 2. Screener
await go("/screener");
await page.screenshot({ path: `${OUT}/screener.png` });
console.log("screener.png");

// 3. Stock detail — score breakdown with the valuation factor table open
await go("/stocks/ADBE");
const breakdownCard = page
  .locator("div[data-slot=card]", { hasText: "Score breakdown" })
  .first();
await breakdownCard.scrollIntoViewIfNeeded();
await breakdownCard.locator("button[data-slot=accordion-trigger]").first().click();
await page.waitForTimeout(500);
await breakdownCard.screenshot({ path: `${OUT}/score-breakdown.png` });
console.log("score-breakdown.png");

// 4. Backtest — run with defaults and capture the results
await go("/backtest");
await page.getByRole("button", { name: /run backtest/i }).click();
await page.waitForSelector("text=Growth of 1.00", { timeout: 120_000 });
await page.waitForTimeout(1200); // chart animation
await page.screenshot({ path: `${OUT}/backtest.png`, fullPage: false });
console.log("backtest.png");

await browser.close();
console.log(`Done -> ${OUT}/`);
