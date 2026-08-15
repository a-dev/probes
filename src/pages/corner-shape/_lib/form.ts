// The control layer: every element the generator touches, looked up once, plus the rules
// keeping a field's slider, number box, and committed value in step. Nothing here knows
// what a shape or a radius means.

import { PERCENT_CEILING, radiusStepFor } from "./controls";

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
type RadiusField = { field: Field; units: HTMLInputElement[]; unit: string };

const radiusFields: RadiusField[] = [...fields].flatMap(([name, field]) => {
  if (!name.startsWith("radius-")) return [];
  const units = all(`[data-unit-for="${name}"]`);
  return [{ field, units, unit: units.find((unit) => unit.checked)?.value ?? "rem" }];
});

// The card as last measured, in rem, with the rem itself. A unit switch converts against
// this rather than forcing its own layout — the numbers were read a frame ago at most.
let card: CardBox = { width: 0, height: 0, rem: 16 };

/** Half the card's shorter side, in rem: the length past which a corner stops bending. */
function halfShorterSide(): number {
  return Math.min(card.width, card.height) / 2;
}

// The same ceiling said three ways. A percentage says it about each side separately, so
// there it is a constant.
function ceilingFor({ unit }: RadiusField): number {
  if (unit === "%") return PERCENT_CEILING;
  return unit === "px" ? halfShorterSide() * card.rem : halfShorterSide();
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
function retune(radius: RadiusField): boolean {
  const { field } = radius;
  const max = ceilingFor(radius);
  const maxAttribute = max.toFixed(2);
  const step = radiusStepFor(radius.unit);
  const stepAttribute = String(step);

  // A ceiling is wherever the card's shorter side falls, so it almost never sits on a step.
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

// Re-hang the radius sliders on the laid-out card: past half its shorter side a radius has
// nothing left to bend, and that ceiling belongs to the card, not the markup. Returns
// whether a radius had to shrink, which makes the serialised form stale.
export function limitRadii(box: CardBox): boolean {
  card = box;
  let shrankAny = false;
  for (const radius of radiusFields) shrankAny = retune(radius) || shrankAny;
  return shrankAny;
}

// rem is the unit the other two are measured through, so a swap is two steps rather than
// six. Between px and rem this is exact; a percentage is read against the card's shorter
// side, which is exact only where that is also the longer one, because a percentage
// resolves against the width on one axis and the height on the other and one number cannot
// hold both. The shorter side is the same one the ceiling and the clamp are measured from.
function toRem(value: number, unit: string, side: number): number {
  if (unit === "%") return (value / 100) * side;
  return unit === "px" ? value / card.rem : value;
}

function fromRem(value: number, unit: string, side: number): number {
  if (unit === "%") return (value / side) * 100;
  return unit === "px" ? value * card.rem : value;
}

/** Re-express a radius in the unit its switch just moved to, keeping the corner it drew. */
export function convertRadius(unitInput: HTMLInputElement): void {
  const radius = radiusFields.find(({ units }) => units.includes(unitInput));
  const side = halfShorterSide() * 2;
  if (!radius || !side) return;

  const value = Number(radius.field.hidden.value);
  const converted = fromRem(toRem(value, radius.unit, side), unitInput.value, side);
  radius.unit = unitInput.value;
  // The new unit brings its own step, and the conversion almost never lands on one — 25px is
  // 1.5625rem — so the number is snapped to it here rather than left for the slider to round
  // behind everyone's back.
  radius.field.hidden.value = String(snap(converted, radiusStepFor(radius.unit)));

  // The ceiling moves with the unit and a range input silently clamps anything written
  // past its `max`, so the inputs are re-hung before the number lands on them.
  retune(radius);
  for (const peer of radius.field.peers) peer.value = radius.field.hidden.value;
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
