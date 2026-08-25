import { clampFactor, fallbackRatio, fitSuperellipse, type Point } from "./superellipse";

export const CORNERS = ["tl", "tr", "br", "bl"] as const;
export type Corner = (typeof CORNERS)[number];
export type CornerValues = Record<Corner, number>;
export type RadiusValues = { x: CornerValues; y: CornerValues };

export type Unit = "px" | "rem" | "%";

export type GeneratorState = {
  selector: string;
  width: number;
  height: number;
  rem: number;
  shapes: CornerValues;
  radii: RadiusValues;
  radiusUnits: Record<Corner, Unit>;
  fallbackRadii: RadiusValues;
  exact: boolean;
};

const KEYWORDS = new Map<number, string>([
  [-Infinity, "notch"],
  [-1, "scoop"],
  [0, "bevel"],
  [1, "round"],
  [2, "squircle"],
  [Infinity, "square"],
]);

export function shapeValue(s: number): string {
  return KEYWORDS.get(s) ?? `superellipse(${Number(s.toFixed(1))})`;
}

export function computedFallback(radii: RadiusValues, shapes: CornerValues): RadiusValues {
  const axis = (values: CornerValues) =>
    Object.fromEntries(
      CORNERS.map((corner) => [
        corner,
        shapes[corner] < 0 ? values[corner] : values[corner] * fallbackRatio(shapes[corner]),
      ]),
    ) as CornerValues;
  return { x: axis(radii.x), y: axis(radii.y) };
}

function decimal(value: number): string {
  return Number(value.toFixed(3)).toString();
}

// The number is already in the unit it was typed in, so nothing is converted on the way
// out. Zero is written bare, the one length with no unit to carry.
function length(value: number, unit: Unit): string {
  const scaled = decimal(value);
  return scaled === "0" ? "0" : `${scaled}${unit}`;
}

function shorthand(values: string[]): string {
  if (values.every((value) => value === values[0])) return values[0];
  if (values[0] === values[2] && values[1] === values[3]) return values.slice(0, 2).join(" ");
  if (values[1] === values[3]) return values.slice(0, 3).join(" ");
  return values.join(" ");
}

export function radiusShorthand(
  x: CornerValues,
  y: CornerValues,
  units: Record<Corner, Unit>,
): string {
  const group = (values: CornerValues) =>
    shorthand(CORNERS.map((corner) => length(values[corner], units[corner])));
  const horizontal = group(x);
  const vertical = group(y);
  return horizontal === vertical ? horizontal : `${horizontal} / ${vertical}`;
}

export function declarationValues(state: GeneratorState): { radius: string; shape: string } {
  return {
    radius: radiusShorthand(state.radii.x, state.radii.y, state.radiusUnits),
    shape: shorthand(CORNERS.map((corner) => shapeValue(state.shapes[corner]))),
  };
}

// Percentages need no conversion on the way out: inside `polygon()` and `shape()` they
// resolve as they do in `border-radius`, against the width on one axis and the height on
// the other, which is what the two radii already mean.
//
// The rotation each corner gets means its point components do not line up with the screen —
// `tr` writes `far(point.y) direct(point.x)`. The axes do line up, though: the emitted pair
// is always `<horizontal> <vertical>`, so the first slot scales by `rx` and the second by
// `ry` whichever component feeds it. A wrong-axis scale still looks plausible, so
// `emit.test.ts` pins the `tr` mapping.
function pointExpression(corner: Corner, point: Point, rx: number, ry: number, unit: Unit): string {
  const scaledBy = (radius: number) => (scale: number) => length(radius * scale, unit);
  const away = (near: (scale: number) => string) => (scale: number) => {
    const offset = near(scale);
    return offset === "0" ? "100%" : `calc(100% - ${offset})`;
  };
  const h = scaledBy(rx);
  const v = scaledBy(ry);
  const farH = away(h);
  const farV = away(v);

  if (corner === "tl") return `${h(point.x)} ${v(point.y)}`;
  if (corner === "tr") return `${farH(point.y)} ${v(point.x)}`;
  if (corner === "br") return `${farH(point.x)} ${farV(point.y)}`;
  return `${h(point.y)} ${farV(point.x)}`;
}

const A = { x: 0, y: 1 };
const B = { x: 1, y: 0 };
const OUTER = { x: 0, y: 0 };
const INNER = { x: 1, y: 1 };

// Only `square` collapses both endpoints onto the box corner. A notch still enters and
// leaves on the edges, it just detours through the inner corner on the way.
function endpoint(s: number, which: "a" | "b"): Point {
  return s === Infinity ? OUTER : which === "a" ? A : B;
}

function polygonPath(state: GeneratorState, radii: RadiusValues): string {
  const points: string[] = [];
  for (const corner of CORNERS) {
    const s = state.shapes[corner];
    const add = (point: Point) =>
      points.push(
        pointExpression(corner, point, radii.x[corner], radii.y[corner], state.radiusUnits[corner]),
      );
    add(endpoint(s, "a"));
    if (s === -Infinity) add(INNER);
    if (s !== Infinity) add(B);
  }
  return `polygon(\n    ${points.join(",\n    ")}\n  )`;
}

// The commands that turn one corner, entered on its edge and left on the next.
function cornerCommands(state: GeneratorState, corner: Corner, rx: number, ry: number): string[] {
  const s = state.shapes[corner];
  const at = (point: Point) => pointExpression(corner, point, rx, ry, state.radiusUnits[corner]);

  if (s === Infinity) return [];
  if (s === 0) return [`line to ${at(B)}`];
  if (s === -Infinity) return [`line to ${at(INNER)}`, `line to ${at(B)}`];
  if (s === -1) return [`curve to ${at(B)} with ${at(INNER)}`];
  return fitSuperellipse(s).map(
    (segment) =>
      `curve to ${at(segment.end)} with ${at(segment.control1)} / ${at(segment.control2)}`,
  );
}

function shapePath(state: GeneratorState, radii: RadiusValues): string {
  const start = pointExpression(
    "tl",
    endpoint(state.shapes.tl, "b"),
    radii.x.tl,
    radii.y.tl,
    state.radiusUnits.tl,
  );
  const commands = [`from ${start}`];
  for (const corner of ["tr", "br", "bl", "tl"] as const) {
    const rx = radii.x[corner];
    const ry = radii.y[corner];
    const unit = state.radiusUnits[corner];
    commands.push(
      `line to ${pointExpression(corner, endpoint(state.shapes[corner], "a"), rx, ry, unit)}`,
      ...cornerCommands(state, corner, rx, ry),
    );
  }
  commands.push("close");
  return `shape(\n    ${commands.join(",\n    ")}\n  )`;
}

// The radii the path is actually drawn from: what was typed, shrunk to fit the box the
// preview is showing, the way a browser shrinks `border-radius` to fit an element. Four
// corners can be written in three units, so the overlap is measured in the one thing they
// share — the card's own rem — and the shrink comes back as a single factor each radius
// then takes in its own unit.
function clippedRadii(state: GeneratorState): RadiusValues {
  const used = (axis: keyof RadiusValues, side: number) =>
    CORNERS.map((corner) => {
      const radius = state.radii[axis][corner];
      if (state.radiusUnits[corner] === "%") return (radius / 100) * side;
      return state.radiusUnits[corner] === "px" ? radius / state.rem : radius;
    }) as [number, number, number, number];

  const factor = clampFactor(
    used("x", state.width),
    used("y", state.height),
    state.width,
    state.height,
  );
  const scaled = (values: CornerValues) =>
    Object.fromEntries(CORNERS.map((corner) => [corner, values[corner] * factor])) as CornerValues;
  return { x: scaled(state.radii.x), y: scaled(state.radii.y) };
}

export function exactClipPath(state: GeneratorState): string | null {
  const shapes = CORNERS.map((corner) => state.shapes[corner]);
  // Round is already what border-radius draws, and square needs no path at all.
  if (shapes.every((s) => s === 1) || shapes.every((s) => s === Infinity)) return null;
  const radii = clippedRadii(state);
  // Straight-edged shapes are exact as polygons, and readable as output; only curves
  // need `shape()`.
  return shapes.every((s) => s === -Infinity || s === 0 || s === Infinity)
    ? polygonPath(state, radii)
    : shapePath(state, radii);
}

const CLIP_NOTE =
  "/* a clip path cuts at the border box, so a border, outline, or box-shadow\n   loses its corners to the cut */";
const ROUNDED_CLIP_NOTE =
  "/* the radius is for the border; the clip path still cuts an outline or box-shadow */";

// A rounded border only hides under a corner at least as full as a circle — `k = 2^s ≥ 2`,
// so `s ≥ 1`. `round` is the exact case, the two curves being the same one. Below it the
// circle bulges back out through the clip and the corners go again, and `square` has no
// curve to hide under at all, so those keep a square border and the warning.
function radiusUnderClip(state: GeneratorState): string | null {
  const hidden = CORNERS.every((corner) => {
    const s = state.shapes[corner];
    return s >= 1 && Number.isFinite(s);
  });
  if (!hidden) return null;
  const radii = clippedRadii(state);
  return radiusShorthand(radii.x, radii.y, state.radiusUnits);
}

function concaveNote(state: GeneratorState): string {
  const concave = CORNERS.find((corner) => state.shapes[corner] < 0);
  if (!concave) return "";
  return (
    `  /* ${shapeValue(state.shapes[concave])} bends inward and border-radius only bends outward, so\n` +
    `     this radius is a placeholder, not a match. Switch on the exact\n` +
    `     fallback if you need the real shape. */\n`
  );
}

// What a browser without `corner-shape` gets: either the outline traced exactly, or a
// radius tuned to remove the same corner area.
function fallbackTier(state: GeneratorState, selector: string, clipPath: string | null): string {
  if (clipPath) {
    const underClip = radiusUnderClip(state);
    const note = underClip ? ROUNDED_CLIP_NOTE : CLIP_NOTE;
    const rounding = underClip ? `  border-radius: ${underClip};\n` : "";
    return `${note}\n${selector} {\n${rounding}  clip-path: ${clipPath};\n}`;
  }
  const radius = radiusShorthand(state.fallbackRadii.x, state.fallbackRadii.y, state.radiusUnits);
  return `${selector} {\n${concaveNote(state)}  border-radius: ${radius};\n}`;
}

// What a browser with `corner-shape` gets, undoing the clip path if one was laid down.
function enhancedTier(selector: string, radius: string, shape: string, clipped: boolean): string {
  const undoClip = clipped ? "    clip-path: none;\n" : "";
  return (
    `@supports (corner-shape: ${shape}) {\n  ${selector} {\n${undoClip}` +
    `    border-radius: ${radius};\n\n    corner-shape: ${shape};\n  }\n}`
  );
}

export function emitCss(state: GeneratorState): string {
  const selector = state.selector.trim() || ".card";
  // Nothing reads the path unless the exact tier is on, and building one costs a curve fit.
  const clipPath = state.exact ? exactClipPath(state) : null;
  const { radius, shape } = declarationValues(state);
  return `${fallbackTier(state, selector, clipPath)}\n\n${enhancedTier(selector, radius, shape, clipPath !== null)}`;
}
