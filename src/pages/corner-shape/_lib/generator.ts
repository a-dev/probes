import { highlightElement } from "@speed-highlight/core";

import {
  CORNERS,
  computedFallback,
  declarationValues,
  emitCss,
  exactClipPath,
  shapeValue,
  type Corner,
  type GeneratorState,
} from "./emit";

const form = document.querySelector<HTMLFormElement>("#generator-form")!;
const stage = document.querySelector<HTMLElement>("#stage")!;
const card = document.querySelector<HTMLElement>("#preview-card")!;
const readout = document.querySelector<HTMLElement>("#value-readout")!;
const output = document.querySelector<HTMLElement>("#css-output")!;
const copyStatus = document.querySelector<HTMLElement>("#copy-status")!;
const unit = document.querySelector<HTMLInputElement>("#unit")!;
const unitToggle = document.querySelector<HTMLButtonElement>("#toggle-unit")!;
const overrides = new Set<string>();

function number(data: Record<string, FormDataEntryValue>, name: string): number {
  return Number(data[name]);
}

function text(value: FormDataEntryValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function shape(data: Record<string, FormDataEntryValue>, name: string): number {
  const value = text(data[name]);
  if (value === "infinity") return Infinity;
  if (value === "-infinity") return -Infinity;
  return Number(value);
}

function values<T>(make: (corner: Corner) => T): Record<Corner, T> {
  return Object.fromEntries(CORNERS.map((corner) => [corner, make(corner)])) as Record<Corner, T>;
}

// Everything that decides how big the card is, applied before anything measures it.
function frameCard(data: Record<string, FormDataEntryValue>): void {
  const style = document.documentElement.style;
  style.setProperty("--size", String(number(data, "size")));
  style.setProperty("--ratio", String(number(data, "ratio")));
  style.setProperty("--p", `${number(data, "padding")}%`);
  style.setProperty("--fs", `${number(data, "font-size")}rem`);
}

// The card takes its size from the frame it sits in rather than from rem sliders, so the
// only way to know what the radii have to clamp against is to ask the laid-out box.
function cardSize(): { width: number; height: number } {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const box = card.getBoundingClientRect();
  return { width: box.width / rem, height: box.height / rem };
}

function makeState(
  data: Record<string, FormDataEntryValue>,
  size: { width: number; height: number },
): GeneratorState {
  const individual = data.mode === "individual";
  const shapes = values((corner) => shape(data, individual ? `shape-${corner}` : "shape-all"));
  const radii = values((corner) => number(data, individual ? `radius-${corner}` : "radius-all"));
  const fallbackRadii = values((corner) => {
    const key = individual ? `fb-${corner}` : "fb-all";
    return overrides.has(key) ? number(data, key) : computedFallback(radii[corner], shapes[corner]);
  });
  return {
    selector: text(data.selector),
    unit: data.unit === "px" ? "px" : "rem",
    width: size.width,
    height: size.height,
    shapes,
    radii,
    fallbackRadii,
    exact: data.exact === "on",
  };
}

function setFallbackFields(state: GeneratorState, individual: boolean): void {
  const fields = individual ? CORNERS : (["all"] as const);
  for (const field of fields) {
    const corner = field === "all" ? "tl" : field;
    const input = form.elements.namedItem(`fb-${field}`) as HTMLInputElement;
    if (!overrides.has(`fb-${field}`))
      input.value = Number(state.fallbackRadii[corner].toFixed(3)).toString();
  }
}

function render(data: Record<string, FormDataEntryValue>): void {
  frameCard(data);
  const state = makeState(data, cardSize());
  const individual = data.mode === "individual";
  const style = document.documentElement.style;
  for (const corner of CORNERS) {
    style.setProperty(`--r-${corner}`, `${state.radii[corner]}rem`);
    style.setProperty(`--fb-r-${corner}`, `${state.fallbackRadii[corner]}rem`);
    style.setProperty(`--shape-${corner}`, shapeValue(state.shapes[corner]));
  }
  for (const input of form.querySelectorAll<HTMLInputElement>(".shape-control .range-input")) {
    const value = shape(data, input.dataset.bind!);
    input.setAttribute("aria-valuetext", shapeValue(value));
  }
  const clip = exactClipPath({ ...state, unit: "rem" });
  style.setProperty("--preview-clip", clip ?? "none");
  stage.dataset.preview = text(data.preview);
  stage.dataset.exact = String(state.exact && Boolean(clip));
  // No clip path means one of two things, and they need opposite treatment: every corner
  // is round (border-radius already draws it) or every corner is square (nothing to draw).
  stage.dataset.clip = clip ? "path" : "none";
  stage.dataset.square = String(CORNERS.every((corner) => state.shapes[corner] === Infinity));
  card.textContent = text(data.text) || " ";
  const declarations = declarationValues(state);
  readout.textContent = `border-radius: ${declarations.radius};\ncorner-shape: ${declarations.shape};`;
  setFallbackFields(state, individual);
  output.textContent = emitCss(state);
  void highlightElement(output, "css", "multiline", { hideLineNumbers: true });
  form.dataset.mode = individual ? "individual" : "all";
}

function syncPair(target: HTMLInputElement): void {
  const binding = target.dataset.bind;
  if (!binding) return;
  const hidden = form.querySelector<HTMLInputElement>(`[data-value-for="${binding}"]`)!;
  const peers = form.querySelectorAll<HTMLInputElement>(`[data-bind="${binding}"]`);
  let value = target.value.trim().toLowerCase().replace("∞", "infinity");
  if (value === "+infinity") value = "infinity";
  const finite = Number(value);
  if (Number.isFinite(finite)) {
    const range = [...peers].find((peer) => peer.type === "range");
    const clamped = range
      ? Math.min(Number(range.max), Math.max(Number(range.min), finite)).toString()
      : value;
    value = clamped;
    for (const peer of peers) peer.value = clamped;
  } else if (value === "infinity" || value === "-infinity") {
    for (const peer of peers) {
      peer.value = peer.type === "range" ? (value.startsWith("-") ? peer.min : peer.max) : value;
    }
  } else {
    return;
  }
  hidden.value = value;
}

function selectPreset(target: HTMLInputElement): void {
  const binding = target.dataset.presetFor;
  if (!binding) return;
  const numberInput = form.querySelector<HTMLInputElement>(
    `[data-bind="${binding}"]:not([type="range"])`,
  )!;
  numberInput.value = target.value;
  syncPair(numberInput);
}

function updatePresetStates(data: Record<string, FormDataEntryValue>): void {
  for (const preset of form.querySelectorAll<HTMLInputElement>("[data-preset-for]")) {
    preset.checked = text(data[preset.dataset.presetFor!]) === preset.value;
  }
}

form.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  selectPreset(target);
  syncPair(target);
  if (target.name.startsWith("fb-")) overrides.add(target.name);
  const binding = target.dataset.bind ?? target.dataset.presetFor;
  if (binding?.startsWith("shape-") || binding?.startsWith("radius-")) {
    overrides.delete(`fb-${binding.split("-").at(-1)}`);
  }
  const data = Object.fromEntries(new FormData(form));
  updatePresetStates(data);
  render(data);
});

document.querySelector("#copy-css")!.addEventListener("click", async () => {
  await navigator.clipboard.writeText(output.textContent ?? "");
  copyStatus.textContent = "Copied.";
  setTimeout(() => (copyStatus.textContent = ""), 2000);
});

// A frame that grows with the viewport moves the point where the radii start clamping,
// and the clamp is baked into the emitted clip path.
window.addEventListener("resize", () => render(Object.fromEntries(new FormData(form))));

unitToggle.addEventListener("click", () => {
  unit.value = unit.value === "rem" ? "px" : "rem";
  unitToggle.textContent = unit.value;
  unitToggle.ariaLabel = `Unit: ${unit.value}. Switch to ${unit.value === "rem" ? "px" : "rem"}`;
  unit.dispatchEvent(new Event("input", { bubbles: true }));
});

render(Object.fromEntries(new FormData(form)));
