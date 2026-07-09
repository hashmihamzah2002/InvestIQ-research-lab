import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/lib/providers/rate-limiter";

function fakeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
  };
}

describe("RateLimiter", () => {
  it("allows maxRequests immediately, then waits for the window", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(3, 1000, clock);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(clock.sleeps).toHaveLength(0);

    await limiter.acquire(); // must wait for slot 1 to expire
    expect(clock.sleeps.length).toBeGreaterThan(0);
    expect(clock.sleeps[0]).toBeGreaterThan(0);
    expect(clock.sleeps[0]).toBeLessThanOrEqual(1000);
  });

  it("frees slots as the window slides", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(2, 1000, clock);

    await limiter.acquire();
    clock.advance(600);
    await limiter.acquire();
    clock.advance(500); // first stamp now expired (1100 > 1000)
    await limiter.acquire();
    expect(clock.sleeps).toHaveLength(0);
    expect(limiter.pendingInWindow).toBe(2);
  });
});
