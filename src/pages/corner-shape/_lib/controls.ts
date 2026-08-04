// Every control the generator draws is described once, here, so the markup stays a loop
// over data instead of four hand-copied corners. Nothing in this file knows how a control
// is rendered — only what it means and what range of numbers it accepts.

import type { Corner } from "./emit";

// The card is measured against the square frame it sits in, not in rem: `size` is the
// fraction of that frame it fills (1 leaves the 0.5rem the frame is padded with) and
// `ratio` stretches it from a wide bar to a tall one without ever letting it escape.
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

// The four corners, in the order `border-radius` writes them.
export const CORNER_LABELS: { id: Corner; label: string }[] = [
  { id: "tl", label: "top-left" },
  { id: "tr", label: "top-right" },
  { id: "br", label: "bottom-right" },
  { id: "bl", label: "bottom-left" },
];

// The named stops on the shape scale. `s` is an exponent, so the two ends are the
// keywords the spec hands out once the curve has flattened into a straight line.
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

// Shape and radius take the same two ranges everywhere they appear.
export const SHAPE_RANGE = { min: -3, max: 5, step: 0.1 } as const;
// The radius maximum here is only what the server can guess before anything is laid out.
// The real ceiling is half the card's shorter side — a circle — and `_lib/generator.ts`
// rewrites it on every render, so this value survives about one frame.
export const RADIUS_RANGE = { min: 0, max: 18, step: 0.01 } as const;
