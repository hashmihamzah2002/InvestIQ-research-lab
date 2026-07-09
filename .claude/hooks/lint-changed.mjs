// PostToolUse hook: auto-fix lint issues on the file Claude just edited.
// Reads the hook payload from stdin, runs eslint --fix on TS/TSX sources.
// Always exits 0 — lint problems surface via `npm run check`, never by
// blocking an edit.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const filePath = payload?.tool_input?.file_path;
if (typeof filePath !== "string") process.exit(0);

const normalized = filePath.replace(/\\/g, "/");
const isLintable =
  /\.(ts|tsx)$/.test(normalized) &&
  !normalized.includes("/src/generated/") &&
  !normalized.includes("/node_modules/") &&
  !normalized.includes("/.next/");

if (!isLintable) process.exit(0);

try {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["eslint", "--fix", "--no-warn-ignored", filePath],
    { stdio: "ignore", timeout: 45000, shell: process.platform === "win32" },
  );
} catch {
  // Remaining errors are reported by `npm run check`; do not block the edit.
}
process.exit(0);
