import { describe, expect, test } from "vitest";

import { emitCss, exactClipPath, type GeneratorState } from "./emit";

const state: GeneratorState = {
  selector: ".card",
  unit: "rem",
  width: 12,
  height: 12,
  shapes: { tl: 2, tr: 2, br: 2, bl: 2 },
  radii: { tl: 1, tr: 1, br: 1, bl: 1 },
  fallbackRadii: { tl: 0.583, tr: 0.583, br: 0.583, bl: 0.583 },
  exact: false,
};

const uniform = (s: number): GeneratorState => ({
  ...state,
  shapes: { tl: s, tr: s, br: s, bl: s },
});

describe("clip path emission", () => {
  test("cuts a notch out of every corner", () => {
    // The two lines per corner have to land on the edges and detour through the inner
    // corner. Collapsing them onto the box corner leaves a path that draws a plain
    // rectangle, which is what shipped, because a rectangle looks deliberate.
    const path = exactClipPath(uniform(-Infinity))!;
    expect(path).toContain("1rem 1rem");
    expect(path).toContain("calc(100% - 1rem) 1rem");
    expect(path.match(/\n/g)).toHaveLength(13);
  });

  test("draws a bevel as the eight-point polygon", () => {
    const path = exactClipPath(uniform(0))!;
    expect(path.startsWith("polygon(")).toBe(true);
    expect(path.match(/\n/g)).toHaveLength(9);
  });

  test("leaves round and square to border-radius", () => {
    expect(exactClipPath(uniform(1))).toBeNull();
    expect(exactClipPath(uniform(Infinity))).toBeNull();
  });

  test("writes zero offsets as 0 and 100%", () => {
    const path = exactClipPath(uniform(0))!;
    expect(path).not.toContain("0rem");
    expect(path).not.toContain("100% - 0");
  });
});

describe("css emission", () => {
  test("converts to px on request", () => {
    expect(emitCss({ ...state, unit: "px" })).toContain("border-radius: 16px");
  });

  test("says so when no radius can approximate the shape", () => {
    expect(emitCss(uniform(-1))).toContain("bends inward");
  });

  test("shortens four equal corners to one value", () => {
    expect(emitCss(state)).toContain("corner-shape: squircle;");
    expect(emitCss({ ...state, shapes: { ...state.shapes, tr: 0 } })).toContain(
      "corner-shape: squircle bevel squircle squircle;",
    );
  });
});
