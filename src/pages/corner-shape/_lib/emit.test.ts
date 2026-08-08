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

  test("rounds the border under a clip that is fuller than a circle", () => {
    // Without it the border keeps its square corners under the cut and loses them. The
    // radius has to be the one the path was drawn from, or the two curves disagree.
    const css = emitCss({ ...uniform(2), exact: true });
    expect(css).toContain("border-radius: 1rem;\n  clip-path: shape(");
    expect(css).toContain("the radius is for the border");
  });

  test("leaves the border square where a circle would poke back out", () => {
    // `bevel` and below sit inside the circle, so rounding the border would clip its
    // corners again — the bug it was meant to fix, wearing a fix's clothes.
    for (const s of [-Infinity, -1, 0, 0.5]) {
      const css = emitCss({ ...uniform(s), exact: true });
      expect(css).not.toContain("border-radius: 1rem;\n  clip-path:");
      expect(css).toContain("loses its corners to the cut");
    }
  });

  test("counts a square corner as no curve to hide under", () => {
    const mixed = { ...state, shapes: { tl: 2, tr: Infinity, br: 2, bl: 2 }, exact: true };
    expect(emitCss(mixed)).not.toContain("border-radius: 1rem;\n  clip-path:");
  });

  test("shrinks the border to the radius the path was clamped to", () => {
    // A 1rem radius on a 1rem-tall box is drawn at 0.5rem, path and border alike.
    const flat = { ...uniform(2), exact: true, height: 1 };
    expect(emitCss(flat)).toContain("border-radius: 0.5rem;\n  clip-path: shape(");
  });

  test("shortens four equal corners to one value", () => {
    expect(emitCss(state)).toContain("corner-shape: squircle;");
    expect(emitCss({ ...state, shapes: { ...state.shapes, tr: 0 } })).toContain(
      "corner-shape: squircle bevel squircle squircle;",
    );
  });
});
