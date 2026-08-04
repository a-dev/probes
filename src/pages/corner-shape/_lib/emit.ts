import { clampRadii, fallbackRatio, fitSuperellipse, type Point } from "./superellipse";

export const CORNERS = ["tl", "tr", "br", "bl"] as const;
export type Corner = (typeof CORNERS)[number];
export type CornerValues = Record<Corner, number>;

export type GeneratorState = {
  selector: string;
  unit: "rem" | "px";
  width: number;
  height: number;
  shapes: CornerValues;
  radii: CornerValues;
  fallbackRadii: CornerValues;
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

export function computedFallback(radius: number, s: number): number {
  return s < 0 ? radius : radius * fallbackRatio(s);
}

function decimal(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function length(value: number, unit: GeneratorState["unit"]): string {
  const scaled = decimal(unit === "px" ? value * 16 : value);
  return scaled === "0" ? "0" : `${scaled}${unit}`;
}

function shorthand(values: string[]): string {
  if (values.every((value) => value === values[0])) return values[0];
  if (values[0] === values[2] && values[1] === values[3]) return values.slice(0, 2).join(" ");
  if (values[1] === values[3]) return values.slice(0, 3).join(" ");
  return values.join(" ");
}

export function declarationValues(state: GeneratorState): { radius: string; shape: string } {
  return {
    radius: shorthand(CORNERS.map((corner) => length(state.radii[corner], state.unit))),
    shape: shorthand(CORNERS.map((corner) => shapeValue(state.shapes[corner]))),
  };
}

function pointExpression(
  corner: Corner,
  point: Point,
  radius: number,
  unit: GeneratorState["unit"],
): string {
  const direct = (scale: number) => length(radius * scale, unit);
  const far = (scale: number) => {
    const offset = direct(scale);
    return offset === "0" ? "100%" : `calc(100% - ${offset})`;
  };
  if (corner === "tl") return `${direct(point.x)} ${direct(point.y)}`;
  if (corner === "tr") return `${far(point.y)} ${direct(point.x)}`;
  if (corner === "br") return `${far(point.x)} ${far(point.y)}`;
  return `${direct(point.y)} ${far(point.x)}`;
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

function polygonPath(state: GeneratorState, radii: CornerValues): string {
  const points: string[] = [];
  for (const corner of CORNERS) {
    const s = state.shapes[corner];
    const add = (point: Point) =>
      points.push(pointExpression(corner, point, radii[corner], state.unit));
    add(endpoint(s, "a"));
    if (s === -Infinity) add(INNER);
    if (s !== Infinity) add(B);
  }
  return `polygon(\n    ${points.join(",\n    ")}\n  )`;
}

// The commands that turn one corner, entered on its edge and left on the next.
function cornerCommands(state: GeneratorState, corner: Corner, radius: number): string[] {
  const s = state.shapes[corner];
  const at = (point: Point) => pointExpression(corner, point, radius, state.unit);

  if (s === Infinity) return [];
  if (s === 0) return [`line to ${at(B)}`];
  if (s === -Infinity) return [`line to ${at(INNER)}`, `line to ${at(B)}`];
  if (s === -1) return [`curve to ${at(B)} with ${at(INNER)}`];
  return fitSuperellipse(s).map(
    (segment) =>
      `curve to ${at(segment.end)} with ${at(segment.control1)} / ${at(segment.control2)}`,
  );
}

function shapePath(state: GeneratorState, radii: CornerValues): string {
  const start = pointExpression("tl", endpoint(state.shapes.tl, "b"), radii.tl, state.unit);
  const commands = [`from ${start}`];
  for (const corner of ["tr", "br", "bl", "tl"] as const) {
    const radius = radii[corner];
    commands.push(
      `line to ${pointExpression(corner, endpoint(state.shapes[corner], "a"), radius, state.unit)}`,
      ...cornerCommands(state, corner, radius),
    );
  }
  commands.push("close");
  return `shape(\n    ${commands.join(",\n    ")}\n  )`;
}

export function exactClipPath(state: GeneratorState): string | null {
  const shapes = CORNERS.map((corner) => state.shapes[corner]);
  // Round is already what border-radius draws, and square needs no path at all.
  if (shapes.every((s) => s === 1) || shapes.every((s) => s === Infinity)) return null;
  const [tl, tr, br, bl] = clampRadii(
    CORNERS.map((corner) => state.radii[corner]) as [number, number, number, number],
    state.width,
    state.height,
  );
  const radii = { tl, tr, br, bl };
  // Straight-edged shapes are exact as polygons, and readable as output; only curves
  // need `shape()`.
  return shapes.every((s) => s === -Infinity || s === 0 || s === Infinity)
    ? polygonPath(state, radii)
    : shapePath(state, radii);
}

const CLIP_NOTE =
  "/* a clip path also cuts off box-shadow, outline, and anything the border\n   draws outside it */";

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
  if (clipPath) return `${CLIP_NOTE}\n${selector} {\n  clip-path: ${clipPath};\n}`;
  const radius = shorthand(
    CORNERS.map((corner) => length(state.fallbackRadii[corner], state.unit)),
  );
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
