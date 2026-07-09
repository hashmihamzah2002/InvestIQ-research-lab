/**
 * Deterministic PRNG for mock data. Same seed string -> same sequence on
 * every machine and every run. NEVER use Math.random() for data generation —
 * determinism is what makes mock-backed tests and screenshots stable.
 */

/** FNV-1a 32-bit string hash. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — small fast PRNG with decent statistical quality. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRng {
  private readonly next01: () => number;
  private spareGaussian: number | null = null;

  constructor(seed: string) {
    this.next01 = mulberry32(fnv1a(seed));
  }

  /** Uniform [0, 1). */
  next(): number {
    return this.next01();
  }

  /** Uniform [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Standard normal via Box-Muller (spare value cached). */
  gaussian(mean = 0, std = 1): number {
    if (this.spareGaussian !== null) {
      const g = this.spareGaussian;
      this.spareGaussian = null;
      return mean + std * g;
    }
    let u = 0;
    let v = 0;
    // Avoid log(0).
    do {
      u = this.next();
    } while (u === 0);
    v = this.next();
    const mag = Math.sqrt(-2 * Math.log(u));
    this.spareGaussian = mag * Math.sin(2 * Math.PI * v);
    return mean + std * mag * Math.cos(2 * Math.PI * v);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }
}
