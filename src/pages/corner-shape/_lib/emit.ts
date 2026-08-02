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

export function declarationValues(state: GeneratorState): {
  radius: string;
  shape: string;
} {
  return {
    radius: shorthand(CORNERS.map((corner) => length(state.radii[corner], state.unit))),
    shape: shorthand(CORNERS.map((corner) => shapeValue(state.shapes[corner]))),
  };
}

type PhysicalCorner = "tl" | "tr" | "br" | "bl";

function pointExpression(
  corner: PhysicalCorner,
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

function shapePath(state: GeneratorState, radii: CornerValues): string {
  const start = pointExpression("tl", endpoint(state.shapes.tl, "b"), radii.tl, state.unit);
  const commands = [`from ${start}`];
  for (const corner of ["tr", "br", "bl", "tl"] as const) {
    const radius = radii[corner];
    const s = state.shapes[corner];
    commands.push(`line to ${pointExpression(corner, endpoint(s, "a"), radius, state.unit)}`);
    if (s === Infinity) continue;
    if (s === 0) {
      commands.push(`line to ${pointExpression(corner, B, radius, state.unit)}`);
    } else if (s === -Infinity) {
      commands.push(`line to ${pointExpression(corner, INNER, radius, state.unit)}`);
      commands.push(`line to ${pointExpression(corner, B, radius, state.unit)}`);
    } else if (s === -1) {
      commands.push(
        `curve to ${pointExpression(corner, B, radius, state.unit)} with ${pointExpression(corner, INNER, radius, state.unit)}`,
      );
    } else {
      for (const segment of fitSuperellipse(s)) {
        commands.push(
          `curve to ${pointExpression(corner, segment.end, radius, state.unit)} with ${pointExpression(corner, segment.control1, radius, state.unit)} / ${pointExpression(corner, segment.control2, radius, state.unit)}`,
        );
      }
    }
  }
  commands.push("close");
  return `shape(\n    ${commands.join(",\n    ")}\n  )`;
}

export function exactClipPath(state: GeneratorState): string | null {
  const shapes = CORNERS.map((corner) => state.shapes[corner]);
  if (shapes.every((s) => s === 1) || shapes.every((s) => s === Infinity)) return null;
  const [tl, tr, br, bl] = clampRadii(
    CORNERS.map((corner) => state.radii[corner]) as [number, number, number, number],
    state.width,
    state.height,
  );
  const radii = { tl, tr, br, bl };
  return shapes.every((s) => s === -Infinity || s === 0 || s === Infinity)
    ? polygonPath(state, radii)
    : shapePath(state, radii);
}

export function emitCss(state: GeneratorState): string {
  const fallback = CORNERS.map((corner) => length(state.fallbackRadii[corner], state.unit));
  const { radius: radiusValue, shape } = declarationValues(state);
  const fallbackValue = shorthand(fallback);
  const clipPath = exactClipPath(state);
  const concave = CORNERS.find((corner) => state.shapes[corner] < 0);
  const selector = state.selector.trim() || ".card";

  const base =
    state.exact && clipPath
      ? `/* a clip path also cuts off box-shadow, outline, and anything the border\n   draws outside it */\n${selector} {\n  clip-path: ${clipPath};\n}`
      : `${selector} {\n${concave ? `  /* ${shapeValue(state.shapes[concave])} bends inward and border-radius only bends outward, so\n     this radius is a placeholder, not a match. Switch on the exact\n     fallback if you need the real shape. */\n` : ""}  border-radius: ${fallbackValue};\n}`;

  return `${base}\n\n@supports (corner-shape: ${shape}) {\n  ${selector} {\n${state.exact && clipPath ? `    clip-path: none;\n` : ""}    border-radius: ${radiusValue};\n\n    corner-shape: ${shape};\n  }\n}`;
}
