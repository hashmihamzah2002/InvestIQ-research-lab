import { describe, expect, it } from "vitest";
import { FCF_YIELD_ANCHORS, RATIO_VS_MEDIAN_ANCHORS } from "@/lib/scoring/constants";
import {
  median,
  percentileInGroup,
  piecewiseLinear,
  quantileSorted,
  winsorize,
} from "@/lib/scoring/normalize";

describe("piecewiseLinear", () => {
  it("interpolates linearly between anchors (hand-computed)", () => {
    // FCF yield 3.5% sits halfway between (2%, 45) and (5%, 75) -> 60.
    expect(piecewiseLinear(0.035, FCF_YIELD_ANCHORS)).toBe(60);
    // Ratio 0.8 sits 1/3 between (0.7, 85) and (1.0, 60) -> 85 - 25/3 = 76.67.
    expect(piecewiseLinear(0.8, RATIO_VS_MEDIAN_ANCHORS)).toBe(76.67);
  });

  it("returns exact scores at anchor points", () => {
    expect(piecewiseLinear(0.02, FCF_YIELD_ANCHORS)).toBe(45);
    expect(piecewiseLinear(1.0, RATIO_VS_MEDIAN_ANCHORS)).toBe(60);
  });

  it("clamps beyond the outer anchors", () => {
    expect(piecewiseLinear(-1, FCF_YIELD_ANCHORS)).toBe(5);
    expect(piecewiseLinear(0.5, FCF_YIELD_ANCHORS)).toBe(95);
    expect(piecewiseLinear(99, RATIO_VS_MEDIAN_ANCHORS)).toBe(5);
  });

  it("throws on empty anchors", () => {
    expect(() => piecewiseLinear(1, [])).toThrow();
  });
});

describe("percentileInGroup (midrank)", () => {
  it("handles values present in the group", () => {
    // group [1,2,3,4], value 2: below=1, ties share rank -> 37.5th pctl.
    expect(percentileInGroup(2, [1, 2, 3, 4])).toBe(37.5);
  });

  it("handles inserted values", () => {
    // group [1,2,3,4], value 2.5 -> exactly the middle.
    expect(percentileInGroup(2.5, [1, 2, 3, 4])).toBe(50);
  });

  it("handles ties fairly", () => {
    // group [5,5,5,10], value 5: below=0, equal=3 -> rank 2 -> 37.5.
    expect(percentileInGroup(5, [5, 5, 5, 10])).toBe(37.5);
  });

  it("returns 50 for singleton/empty groups (no information)", () => {
    expect(percentileInGroup(7, [7])).toBe(50);
    expect(percentileInGroup(7, [])).toBe(50);
  });

  it("filters non-finite group members", () => {
    expect(percentileInGroup(2, [1, NaN, 3, Infinity])).toBe(
      percentileInGroup(2, [1, 3]),
    );
  });
});

describe("winsorize / quantiles / median", () => {
  it("clamps to the 5th/95th percentile by default", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const w = winsorize(values);
    // p5 of 1..10 = 1.45, p95 = 9.55.
    expect(Math.min(...w)).toBeCloseTo(1.45, 10);
    expect(Math.max(...w)).toBeCloseTo(9.55, 10);
    expect(w[4]).toBe(5); // interior untouched
  });

  it("handles empty and single-element arrays", () => {
    expect(winsorize([])).toEqual([]);
    expect(winsorize([42])).toEqual([42]);
  });

  it("computes interpolated quantiles and medians", () => {
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([NaN])).toBeNull();
  });
});
