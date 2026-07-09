/**
 * Sliding-window rate limiter. Each adapter owns one instance sized to its
 * provider's published limits (conservatively). acquire() resolves when a
 * request slot is available.
 */
export interface RateLimiterDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
  private stamps: number[] = [];

  constructor(
    readonly maxRequests: number,
    readonly intervalMs: number,
    private readonly deps: RateLimiterDeps = {},
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const now = (this.deps.now ?? Date.now)();
      this.stamps = this.stamps.filter((t) => now - t < this.intervalMs);
      if (this.stamps.length < this.maxRequests) {
        this.stamps.push(now);
        return;
      }
      const waitMs = Math.max(1, this.intervalMs - (now - this.stamps[0]));
      await (this.deps.sleep ?? realSleep)(waitMs);
    }
  }

  /** Requests currently counted inside the window (for tests/diagnostics). */
  get pendingInWindow(): number {
    const now = (this.deps.now ?? Date.now)();
    return this.stamps.filter((t) => now - t < this.intervalMs).length;
  }
}
