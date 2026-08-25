import { describe, expect, test } from "vitest";

import { declarationValues, emitCss, exactClipPath, type GeneratorState } from "./emit";
import { clampFactor } from "./superellipse";

const state: GeneratorState = {
  selector: ".card",
  width: 12,
  height: 12,
  rem: 16,
  shapes: { tl: 2, tr: 2, br: 2, bl: 2 },
  radii: {
    x: { tl: 1, tr: 1, br: 1, bl: 1 },
    y: { tl: 1, tr: 1, br: 1, bl: 1 },
  },
  radiusUnits: { tl: "rem", tr: "rem", br: "rem", bl: "rem" },
  fallbackRadii: {
    x: { tl: 0.583, tr: 0.583, br: 0.583, bl: 0.583 },
    y: { tl: 0.583, tr: 0.583, br: 0.583, bl: 0.583 },
  },
  exact: false,
};

const uniform = (s: number): GeneratorState => ({
  ...state,
  shapes: { tl: s, tr: s, br: s, bl: s },
});

// The same corners, written as a share of the box instead of a length.
const percent = (overrides: Partial<GeneratorState> = {}): GeneratorState => ({
  ...state,
  radii: {
    x: { tl: 10, tr: 10, br: 10, bl: 10 },
    y: { tl: 10, tr: 10, br: 10, bl: 10 },
  },
  radiusUnits: { tl: "%", tr: "%", br: "%", bl: "%" },
  fallbackRadii: {
    x: { tl: 5.831, tr: 5.831, br: 5.831, bl: 5.831 },
    y: { tl: 5.831, tr: 5.831, br: 5.831, bl: 5.831 },
  },
  ...overrides,
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

describe("units", () => {
  test("writes each corner in the unit it was typed in", () => {
    // No conversion on the way out and no output-wide unit to answer to: the number is
    // already in the unit beside it, and four corners may disagree.
    const mixed = emitCss({
      ...state,
      radii: {
        x: { tl: 16, tr: 1, br: 10, bl: 1 },
        y: { tl: 16, tr: 1, br: 10, bl: 1 },
      },
      radiusUnits: { tl: "px", tr: "rem", br: "%", bl: "rem" },
    });
    // Three values, not four: the two 1rem corners are opposite each other, so the
    // shorthand still collapses across a mixture of units.
    expect(mixed).toContain("border-radius: 16px 1rem 10%;");
  });

  test("measures a px corner against the card through the rem", () => {
    // 192px is 12rem, the whole width, so with a 4rem corner beside it on the same side
    // the pair is 16rem of a 12rem edge and both give up a quarter.
    const clamped = emitCss({
      ...state,
      exact: true,
      radii: {
        x: { tl: 192, tr: 4, br: 0, bl: 0 },
        y: { tl: 192, tr: 4, br: 0, bl: 0 },
      },
      radiusUnits: { tl: "px", tr: "rem", br: "rem", bl: "rem" },
    });
    expect(clamped).toContain("border-radius: 144px 3rem 0 0");
  });
});

describe("percentage radii", () => {
  test("writes the same percentage on both axes", () => {
    // 10% of the width horizontally and 10% of the height vertically is exactly what
    // border-radius does with one number, and it is why a percentage corner turns
    // elliptical on a card that is not square. Nothing is converted to reach that.
    const path = exactClipPath({ ...percent(), exact: true })!;
    expect(path.startsWith("shape(")).toBe(true);
    expect(path).not.toContain("rem");
    expect(path).toContain("calc(100% - 10%)");
  });

  test("shrinks overlapping percentages the way the box would", () => {
    // 60% + 60% on one side is 120% of it, so every corner comes back at 50%.
    const css = emitCss({
      ...percent({
        radii: {
          x: { tl: 60, tr: 60, br: 60, bl: 60 },
          y: { tl: 60, tr: 60, br: 60, bl: 60 },
        },
      }),
      exact: true,
    });
    expect(css).toContain("border-radius: 50%;\n  clip-path: shape(");
  });

  test("measures a mixed pair against the side they share", () => {
    // 100% of a 12rem-wide card plus a 4rem corner is 16rem of a 12rem side, so both
    // ends give up a quarter — each in its own unit.
    const mixed = emitCss({
      ...state,
      exact: true,
      radii: {
        x: { tl: 100, tr: 4, br: 0, bl: 0 },
        y: { tl: 100, tr: 4, br: 0, bl: 0 },
      },
      radiusUnits: { tl: "%", tr: "rem", br: "rem", bl: "rem" },
    });
    expect(mixed).toContain("border-radius: 75% 3rem 0 0");
  });
});

describe("css emission", () => {
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

describe("elliptical radii", () => {
  test("omits the slash only while both axes match", () => {
    expect(declarationValues(state).radius).toBe("1rem");
    expect(
      declarationValues({
        ...state,
        radii: { ...state.radii, y: { ...state.radii.y, tr: 2 } },
      }).radius,
    ).toBe("1rem / 1rem 2rem 1rem 1rem");
  });

  test("collapses one horizontal radius and four vertical radii", () => {
    expect(
      declarationValues({
        ...state,
        radii: {
          x: { tl: 1, tr: 1, br: 1, bl: 1 },
          y: { tl: 2, tr: 0, br: 0, bl: 0 },
        },
      }).radius,
    ).toBe("1rem / 2rem 0 0");
  });

  test("scales a top-right point by its screen axis", () => {
    const path = exactClipPath({
      ...state,
      shapes: { ...state.shapes, tr: -1 },
      radii: {
        x: { tl: 0, tr: 4, br: 0, bl: 0 },
        y: { tl: 0, tr: 2, br: 0, bl: 0 },
      },
    })!;
    expect(path).toContain("curve to 100% 2rem with calc(100% - 4rem) 2rem");
  });

  test("clamps genuinely different horizontal and vertical radii", () => {
    expect(clampFactor([8, 8, 0, 0], [1, 9, 9, 1], 12, 12)).toBe(2 / 3);
  });

  // The two tiers that write a radius without going through `declarationValues`, and so
  // could pair the axes the wrong way round on their own.
  test("splits the axes of the area-matched fallback radius", () => {
    const css = emitCss({
      ...state,
      fallbackRadii: {
        x: { tl: 0.583, tr: 0.583, br: 0.583, bl: 0.583 },
        y: { tl: 1.166, tr: 0.583, br: 0.583, bl: 0.583 },
      },
    });
    expect(css).toContain("border-radius: 0.583rem / 1.166rem 0.583rem 0.583rem;");
  });

  test("splits the axes of the border hiding under an exact clip path", () => {
    const css = emitCss({
      ...state,
      exact: true,
      radii: {
        x: { tl: 4, tr: 1, br: 1, bl: 1 },
        y: { tl: 2, tr: 1, br: 1, bl: 1 },
      },
    });
    expect(css).toContain("border-radius: 4rem 1rem 1rem / 2rem 1rem 1rem;\n  clip-path: shape(");
  });
});
