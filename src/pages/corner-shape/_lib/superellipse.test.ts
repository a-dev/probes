import { describe, expect, test } from "vitest";

import {
  clampRadii,
  fallbackRatio,
  fitSegment,
  fitSuperellipse,
  gamma,
  quadrantArea,
  segmentDeviation,
} from "./superellipse";

describe("superellipse geometry", () => {
  test("matches the closed-form reference values", () => {
    expect(gamma(1.5)).toBeCloseTo(0.8862269, 7);
    expect(quadrantArea(2)).toBeCloseTo(Math.PI / 4, 12);
    expect(quadrantArea(1)).toBeCloseTo(0.5, 12);
    expect(fallbackRatio(1)).toBe(1);
    expect(fallbackRatio(2)).toBeCloseTo(0.5831, 4);
    expect(fallbackRatio(3)).toBeCloseTo(0.3168, 4);
  });

  test("fits a circle with the textbook cubic", () => {
    const circle = fitSegment(1, 0, Math.PI / 2);
    expect(circle.control1.x).toBeCloseTo(0, 6);
    expect(1 - circle.control1.y).toBeCloseTo(0.552285, 6);
    expect(segmentDeviation(1, 0, Math.PI / 2, circle)).toBeLessThan(0.0004);
  });

  test("keeps adaptive fits and radii within bounds", () => {
    // The whole slider range, not just the convex half. Deep concave used to miss by a
    // mile here — s = -2.5 sat at 0.98% and s = -3 at 8.56% — because the deviation was
    // read radially and blew up near the edges, not because the curves could not be fitted.
    for (const s of [...Array.from({ length: 33 }, (_, i) => -3 + i * 0.25), -2.9, -2.1, 3.5]) {
      for (const segment of fitSuperellipse(s)) {
        expect(
          segmentDeviation(s, segment.startAngle, segment.endAngle, segment),
        ).toBeLessThanOrEqual(0.0025);
      }
    }
    expect(clampRadii([10, 10, 10, 10], 12, 8)).toEqual([4, 4, 4, 4]);
  });

  test("does not pay for the concave range in segments", () => {
    // Converging is half of it: a deviation reading that over-reports still splits, and
    // the emitted CSS carries every segment. s = -3 used to ship 22 per corner and miss
    // tolerance anyway. Twelve is the worst case across the range now.
    for (let s = -3; s < 0; s += 0.1) {
      expect(fitSuperellipse(s).length).toBeLessThanOrEqual(12);
    }
  });

  test("keeps measuring concave fits instead of returning NaN", () => {
    // A concave fit can bulge outside the corner box, where the radial reading used to go
    // NaN. NaN compares false against the tolerance, so the adaptive split gave up after
    // one segment and shipped a curve nobody had measured.
    for (let s = -3; s < 0; s += 0.25) {
      for (const segment of fitSuperellipse(s)) {
        expect(segmentDeviation(s, segment.startAngle, segment.endAngle, segment)).not.toBeNaN();
      }
    }
    expect(fitSuperellipse(-2).length).toBeGreaterThan(1);
  });

  test("represents scoop exactly as a quadratic", () => {
    let deviation = 0;
    for (let index = 0; index <= 1000; index += 1) {
      const t = index / 1000;
      const bezier = { x: t ** 2, y: (1 - t) ** 2 };
      deviation = Math.max(deviation, Math.abs(Math.sqrt(bezier.x) + Math.sqrt(bezier.y) - 1));
    }
    expect(deviation).toBeLessThan(1e-9);
  });
});
