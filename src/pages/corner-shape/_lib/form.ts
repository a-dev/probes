// The control layer: every element the generator touches, looked up once, plus the rules
// keeping a field's slider, number box, and committed value in step. Nothing here knows
// what a shape or a radius means.

import { CEILING_FRACTION, DEFAULT_AXES, radiusStepFor } from "./controls";

export type Values = Record<string, string>;

export type CardBox = { width: number; height: number; rem: number };

export type Field = {
  hidden: HTMLInputElement;
  peers: HTMLInputElement[];
  range: HTMLInputElement | undefined;
};

export const form = document.querySelector<HTMLFormElement>("#generator-form")!;

const all = (selector: string) => [...form.querySelectorAll<HTMLInputElement>(selector)];

// The markup never changes shape, so lookups happen here rather than on every render.
export const fields: Map<string, Field> = new Map(
  all("[data-value-for]").map((hidden) => {
    const name = hidden.dataset.valueFor!;
    const peers = all(`[data-bind="${name}"]`);
    return [name, { hidden, peers, range: peers.find((peer) => peer.type === "range") }];
  }),
);

export const rangeInputs = all(".range-input");
export const shapeRanges = all(".shape-control .range-input");

// A radius and the switch deciding what its number means. `unit` is what the number is
// written in *now* — the switch itself cannot say, since by the time a press is heard the
// option that was checked has already lost the flag, and converting needs both ends.
type Axis = "x" | "y";
type RadiusField = { x: Field; y: Field; units: HTMLInputElement[]; unit: string };

const radiusFields: RadiusField[] = [...fields].flatMap(([name, x]) => {
  if (!name.startsWith("radius-") || !name.endsWith("-x")) return [];
  const y = fields.get(`${name.slice(0, -1)}y`);
  if (!y) return [];
  const units = all(`[data-unit-for="${name}"]`);
  return [{ x, y, units, unit: units.find((unit) => unit.checked)?.value ?? "rem" }];
});

// The card as last measured, in rem, with the rem itself. A unit switch converts against
// this rather than forcing its own layout — the numbers were read a frame ago at most.
let card: CardBox = { width: 0, height: 0, rem: 16 };
let axisMode = DEFAULT_AXES;

// Read off the radios rather than out of a `FormData`: this runs on every `input`, and
// serialising the whole form to learn one of two words is the expensive way to ask.
const axisInputs = all('input[name="axes"]');

function readAxisMode(): void {
  axisMode = axisInputs.find((input) => input.checked)?.value ?? DEFAULT_AXES;
}

// The side a radius is measured against, in rem. One number driving both axes can only be
// held to the shorter one; split axes each get their own.
function sideFor(axis: Axis): number {
  return axisMode === "elliptical"
    ? card[axis === "x" ? "width" : "height"]
    : Math.min(card.width, card.height);
}

// The same ceiling said three ways: a fraction of that side, in whichever unit the switch
// is on. A percentage is already a fraction of it, so there the fraction *is* the ceiling.
function ceilingFor({ unit }: RadiusField, axis: Axis): number {
  const fraction = CEILING_FRACTION[axisMode] ?? CEILING_FRACTION.circular;
  if (unit === "%") return fraction * 100;
  const ceiling = sideFor(axis) * fraction;
  return unit === "px" ? ceiling * card.rem : ceiling;
}

const presets = all("[data-preset-for]").map((input) => ({
  input,
  target: input.dataset.presetFor!,
  toggle: input.closest<HTMLElement>(".toggle")!,
}));

const presetToggles = [...new Set(presets.map((preset) => preset.toggle))];

export function readValues(): Values {
  return Object.fromEntries(
    [...new FormData(form)].map(([key, value]) => [key, typeof value === "string" ? value : ""]),
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

// The value to commit, or null while the text is still mid-edit ("", "-", "1."). A number
// input reports "" for a partial number, so both cases land here.
function parseTyped(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace("∞", "infinity").replace(/^\+/, "");
  if (value === "infinity" || value === "-infinity") return value;
  return value !== "" && Number.isFinite(Number(value)) ? value : null;
}

// Push one input's value out to the rest of its field. `commit` is `change` rather than
// `input`: typing has stopped, so the box typed into is rewritten and clamped too.
export function syncField(target: HTMLInputElement, commit = false): void {
  const field = fields.get(target.dataset.bind ?? "");
  if (!field) return;
  const parsed = parseTyped(target.value);
  if (parsed === null) return;

  const infinite = parsed === "infinity" || parsed === "-infinity";
  const committed = infinite
    ? parsed
    : String(
        field.range
          ? clamp(Number(parsed), Number(field.range.min), Number(field.range.max))
          : Number(parsed),
      );

  for (const peer of field.peers) {
    // Never rewrite the box being typed in: "1." would collapse to "1" and the next
    // keystroke would land on the wrong side of the decimal point.
    if (peer === target && !commit) continue;
    peer.value =
      infinite && peer.type === "range"
        ? parsed.startsWith("-")
          ? peer.min
          : peer.max
        : committed;
  }
  field.hidden.value = committed;
}

/** Write a named stop into the field it drives, as though it had been typed and committed. */
export function applyPreset(preset: HTMLInputElement): void {
  const field = fields.get(preset.dataset.presetFor ?? "");
  const box = field?.peers.find((peer) => peer.type !== "range");
  if (!box) return;
  box.value = preset.value;
  syncField(box, true);
}

// A stop the slider merely crossed is not a move anyone made with the toggle: the thumb
// would slide in and straight back out. Only a press gets the slide.
export function markPresetTransition(fromToggle: boolean): void {
  const instant = String(!fromToggle);
  for (const toggle of presetToggles) {
    if (toggle.dataset.instant !== instant) toggle.dataset.instant = instant;
  }
}

export function syncPresetChecks(values: Values): void {
  for (const { input, target } of presets) input.checked = values[target] === input.value;
}

// The nearest value a step can actually hold. Counting steps is a division by a decimal, so
// it lands a hair off — 8.5 / 0.1 is 84.999… and a floor would drop a whole step — and the
// count is rounded to six places before it is used.
function snap(value: number, step: number, round: (n: number) => number = Math.round): number {
  return Number((round(Number((value / step).toFixed(6))) * step).toFixed(2));
}

// Re-hang one radius's inputs on the ceiling and the step its unit gives them, shrinking a
// value that no longer fits under the ceiling. Returns whether it had to.
function retune(radius: RadiusField, axis: Axis): boolean {
  const field = radius[axis];
  const max = ceilingFor(radius, axis);
  const maxAttribute = max.toFixed(2);
  const step = radiusStepFor(radius.unit);
  const stepAttribute = String(step);

  // A ceiling comes from a laid-out side, so it almost never sits on a step.
  // A shrunk field lands on the last whole step under it instead: a slider silently rounds
  // anything off-step, and would otherwise part company with the number beside it.
  const fitted = String(snap(max, step, Math.floor));
  const shrank = Number(field.hidden.value) > max;
  if (shrank) field.hidden.value = fitted;

  for (const peer of field.peers) {
    if (peer.max !== maxAttribute) peer.max = maxAttribute;
    if (peer.step !== stepAttribute) peer.step = stepAttribute;
    if (shrank) peer.value = fitted;
  }
  return shrank;
}

// Re-hang the radius sliders on the laid-out card. The ceiling belongs to the card, not the
// markup. Returns whether a radius had to shrink, which makes the serialised form stale.
export function limitRadii(box: CardBox): boolean {
  card = box;
  readAxisMode();
  let shrankAny = false;
  for (const radius of radiusFields) {
    for (const axis of ["x", "y"] as const) shrankAny = retune(radius, axis) || shrankAny;
  }
  return shrankAny;
}

// In circular mode one number drives both axes, so a committed `-x` writes its `-y` twin.
// Every `input` on the page comes through here — a shape drag, the preview text — and in
// the steady state the twin already agrees, so a corner that is already mirrored is left
// alone rather than written over with what it holds.
export function mirrorAxes(): void {
  readAxisMode();
  if (axisMode !== "circular") return;
  for (const { x, y } of radiusFields) {
    if (y.hidden.value === x.hidden.value) continue;
    y.hidden.value = x.hidden.value;
    for (const peer of y.peers) peer.value = x.hidden.value;
  }
}

// Rem is the unit the other two are measured through. Elliptical percentages use their own
// axis; circular percentages keep using the shorter side because one number drives both.
function toRem(value: number, unit: string, axis: Axis): number {
  const side = sideFor(axis);
  if (unit === "%") return (value / 100) * side;
  return unit === "px" ? value / card.rem : value;
}

function fromRem(value: number, unit: string, axis: Axis): number {
  const side = sideFor(axis);
  if (unit === "%") return (value / side) * 100;
  return unit === "px" ? value * card.rem : value;
}

/** Re-express a radius in the unit its switch just moved to, keeping the corner it drew. */
export function convertRadius(unitInput: HTMLInputElement): void {
  const radius = radiusFields.find(({ units }) => units.includes(unitInput));
  if (!radius || !sideFor("x") || !sideFor("y")) return;

  const converted = (["x", "y"] as const).map((axis) =>
    fromRem(toRem(Number(radius[axis].hidden.value), radius.unit, axis), unitInput.value, axis),
  );
  radius.unit = unitInput.value;
  for (const [index, axis] of (["x", "y"] as const).entries()) {
    const field = radius[axis];
    // The new unit brings its own step, and the conversion almost never lands on one —
    // 25px is 1.5625rem — so snap it before the slider silently rounds it.
    field.hidden.value = String(snap(converted[index], radiusStepFor(radius.unit)));

    // Re-hang the inputs before writing a value past a newly smaller `max`.
    retune(radius, axis);
    for (const peer of field.peers) peer.value = field.hidden.value;
  }
}

// The played half of a slider's track: no pseudo-element for it exists outside Firefox, so
// CSS draws it from `--progress`.
export function paintRangeProgress(): void {
  for (const input of rangeInputs) {
    const min = Number(input.min);
    const span = Number(input.max) - min;
    input.style.setProperty(
      "--progress",
      (span > 0 ? (input.valueAsNumber - min) / span : 0).toFixed(4),
    );
  }
}
