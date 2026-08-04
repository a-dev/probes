// The control layer: every element the generator touches, looked up once, plus the rules
// keeping a field's slider, number box, and committed value in step. Nothing here knows
// what a shape or a radius means.

export type Values = Record<string, string>;

export type Field = {
  /** The only input the form serialises; the committed value. */
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

const radiusFields = [...fields].flatMap(([name, field]) =>
  name.startsWith("radius-") ? [field] : [],
);

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

// Re-hang the radius sliders on the laid-out card: past half its shorter side a radius has
// nothing left to bend, and that ceiling belongs to the card, not the markup. Returns
// whether a radius had to shrink, which makes the serialised form stale.
export function limitRadii(width: number, height: number): boolean {
  const max = Math.min(width, height) / 2;
  const maxAttribute = max.toFixed(2);
  let shrankAny = false;

  for (const field of radiusFields) {
    const shrank = Number(field.hidden.value) > max;
    if (shrank) {
      field.hidden.value = String(max);
      shrankAny = true;
    }
    for (const peer of field.peers) {
      if (peer.max !== maxAttribute) peer.max = maxAttribute;
      if (shrank) peer.value = String(max);
    }
  }
  return shrankAny;
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
