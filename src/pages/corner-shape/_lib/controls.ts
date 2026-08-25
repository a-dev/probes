import type { Corner } from "./emit";

export const DIMENSIONS = [
  {
    name: "size",
    label: "Size",
    min: 0.1,
    max: 1,
    step: 0.01,
    value: 0.6,
    unit: "fraction of the frame",
  },
  {
    name: "ratio",
    label: "Aspect ratio",
    min: 0.25,
    max: 4,
    step: 0.05,
    value: 1,
    unit: "width divided by height",
  },
  {
    name: "padding",
    label: "Padding",
    min: 0,
    max: 30,
    step: 0.5,
    value: 10,
    unit: "percent",
  },
  {
    name: "font-size",
    label: "Font size",
    min: 0.75,
    max: 4,
    step: 0.05,
    value: 1,
    unit: "rem",
  },
] as const;

export const CORNER_LABELS: { id: Corner; label: string }[] = [
  { id: "tl", label: "top-left" },
  { id: "tr", label: "top-right" },
  { id: "br", label: "bottom-right" },
  { id: "bl", label: "bottom-left" },
];

// `s` is an exponent, so the two ends are the keywords the spec hands out once the curve
// has flattened into a straight line.
export const PRESETS = [
  { label: "Notch", value: "-infinity" },
  { label: "Scoop", value: "-1" },
  { label: "Bevel", value: "0" },
  { label: "Round", value: "1" },
  { label: "Squircle", value: "2" },
  { label: "Square", value: "infinity" },
] as const;

export const DEFAULT_SHAPE = "2";
export const DEFAULT_RADIUS = "1";

export const AXIS_MODES = [
  { label: "Circular", value: "circular" },
  { label: "Elliptical", value: "elliptical" },
];
export const DEFAULT_AXES = "circular";

export const RADIUS_UNITS = [
  { label: "px", value: "px" },
  { label: "rem", value: "rem" },
  { label: "%", value: "%" },
];

export const DEFAULT_RADIUS_UNIT = "rem";

// How much of its side one radius may take. A circular corner's single number drives both
// axes, so past half a side the neighbours' overlap scales it straight back and nothing new
// is drawn. An elliptical corner's axes are independent: a corner sweeping a whole side —
// `border-radius: 100% 0 0 0 / 50% 0 0 0` — is a shape no half-side value can reach.
export const CEILING_FRACTION: Record<string, number> = { circular: 0.5, elliptical: 1 };

const RADIUS_STEPS: Record<string, number> = { px: 1, rem: 0.1, "%": 1 };

export function radiusStepFor(unit: string): number {
  return RADIUS_STEPS[unit] ?? 1;
}

export const SHAPE_RANGE = { min: -3, max: 5, step: 0.1 } as const;
export const RADIUS_RANGE = { min: 0, max: 18 } as const;
