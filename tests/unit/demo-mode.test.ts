import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "@/lib/config/env";

/**
 * Public-demo hardening: with DEMO_MODE=1 every /api/admin operation returns
 * 403 BEFORE doing any work (no refresh kicked off, no body parsed). The
 * admin page renders a locked notice via the same flag (same getEnv gate).
 */
describe("demo mode lockdown", () => {
  beforeAll(() => {
    process.env.DEMO_MODE = "1";
    resetEnvCache();
  });

  afterAll(() => {
    delete process.env.DEMO_MODE;
    resetEnvCache();
  });

  it("parses the flag (default off, coerced number)", () => {
    expect(loadEnv({}).DEMO_MODE).toBe(0);
    expect(loadEnv({ DEMO_MODE: "1" }).DEMO_MODE).toBe(1);
  });

  it("403s the refresh trigger and status endpoints", async () => {
    const route = await import("@/app/api/admin/refresh/route");
    const post = await route.POST();
    expect(post.status).toBe(403);
    const postBody = (await post.json()) as { error: { message: string } };
    expect(postBody.error.message).toMatch(/disabled on this public demo/i);

    const get = await route.GET();
    expect(get.status).toBe(403);
  });

  it("403s CSV imports before reading the multipart body", async () => {
    const route = await import("@/app/api/admin/import/route");
    // Deliberately NOT a multipart request: the demo guard must fire first,
    // so this returns 403 rather than the 400 body-parse error.
    const response = await route.POST(
      new Request("http://localhost/api/admin/import", { method: "POST" }),
    );
    expect(response.status).toBe(403);
  });
});
