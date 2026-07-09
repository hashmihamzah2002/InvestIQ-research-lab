import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchJson } from "@/lib/providers/http";
import { ProviderError } from "@/lib/providers/types";
import { fakeFetch } from "../helpers/fake-fetch";
import { createTestDb, type TestDb } from "../helpers/test-db";

const noSleep = async (): Promise<void> => {};

describe("fetchJson", () => {
  it("returns parsed JSON on success", async () => {
    const { fetchImpl, calls } = fakeFetch([{ match: "example.com", body: { a: 1 } }]);
    const result = await fetchJson(
      { provider: "test", category: "macro", url: "https://example.com/x" },
      { fetchImpl, sleep: noSleep },
    );
    expect(result).toEqual({ a: 1 });
    expect(calls).toHaveLength(1);
  });

  it("retries 5xx then succeeds", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: "example.com", status: 503, body: "oops", times: 2 },
      { match: "example.com", body: { ok: true } },
    ]);
    const result = await fetchJson(
      { provider: "test", category: "macro", url: "https://example.com/x", maxRetries: 3 },
      { fetchImpl, sleep: noSleep },
    );
    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
  });

  it("fails fast on non-retryable 4xx", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: "example.com", status: 403, body: "denied" },
    ]);
    await expect(
      fetchJson(
        { provider: "test", category: "news", url: "https://example.com/x" },
        { fetchImpl, sleep: noSleep },
      ),
    ).rejects.toThrow(ProviderError);
    expect(calls).toHaveLength(1);
  });

  it("gives up after retry budget on 429", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: "example.com", status: 429, body: "slow down" },
    ]);
    await expect(
      fetchJson(
        { provider: "test", category: "news", url: "https://example.com/x", maxRetries: 1 },
        { fetchImpl, sleep: noSleep },
      ),
    ).rejects.toThrow(/after 2 attempts/);
    expect(calls).toHaveLength(2);
  });

  it("treats non-JSON bodies as immediate provider failure", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: "example.com", body: "<html>maintenance</html>" },
    ]);
    await expect(
      fetchJson(
        { provider: "test", category: "macro", url: "https://example.com/x" },
        { fetchImpl, sleep: noSleep },
      ),
    ).rejects.toThrow(/Non-JSON/);
    expect(calls).toHaveLength(1);
  });

  describe("response cache", () => {
    let tdb: TestDb;
    beforeAll(() => {
      tdb = createTestDb();
    });
    afterAll(async () => {
      await tdb.cleanup();
    });

    it("serves the second call from cache and refetches after expiry", async () => {
      const { fetchImpl, calls } = fakeFetch([
        { match: "example.com", body: { fresh: true } },
      ]);
      let clock = new Date("2026-06-10T00:00:00Z");
      const deps = { fetchImpl, sleep: noSleep, now: () => clock };
      const opts = {
        provider: "cachetest",
        category: "macro" as const,
        url: "https://example.com/data",
        db: tdb.db,
        cacheTtlMs: 60_000,
      };

      await fetchJson(opts, deps);
      const second = await fetchJson(opts, deps);
      expect(second).toEqual({ fresh: true });
      expect(calls).toHaveLength(1); // cache hit

      clock = new Date(clock.getTime() + 61_000);
      await fetchJson(opts, deps);
      expect(calls).toHaveLength(2); // expired -> refetch
    });
  });
});
