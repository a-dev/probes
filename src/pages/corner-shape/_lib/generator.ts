// The render pipeline. Every input event re-serialises the form and repaints from the
// result, so the DOM stays the single source of truth.

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
import {
  applyPreset,
  form,
  limitRadii,
  markPresetTransition,
  paintRangeProgress,
  readValues,
  shapeRanges,
  syncField,
  syncPresetChecks,
  type Values,
} from "./form";

const root = document.documentElement;
const stage = document.querySelector<HTMLElement>("#stage")!;
const card = document.querySelector<HTMLElement>("#preview-card")!;
const readout = document.querySelector<HTMLElement>("#value-readout")!;
const output = document.querySelector<HTMLElement>("#css-output")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copy-css")!;

// Without support the enhanced preview is faked from a clip path, so the outline is needed
// whether or not `exact` is on.
const previewIsSynthetic = root.dataset.cornerShape === "unsupported";

function shapeNumber(value = ""): number {
  if (value === "infinity") return Infinity;
  if (value === "-infinity") return -Infinity;
  return Number(value);
}

function perCorner<T>(make: (corner: Corner) => T): Record<Corner, T> {
  return Object.fromEntries(CORNERS.map((corner) => [corner, make(corner)])) as Record<Corner, T>;
}

function makeState(values: Values, width: number, height: number): GeneratorState {
  const suffix = values.mode === "individual" ? null : "all";
  const shapes = perCorner((corner) => shapeNumber(values[`shape-${suffix ?? corner}`]));
  const radii = perCorner((corner) => Number(values[`radius-${suffix ?? corner}`]));
  return {
    selector: values.selector ?? "",
    unit: values.unit === "px" ? "px" : "rem",
    width,
    height,
    shapes,
    radii,
    fallbackRadii: perCorner((corner) => computedFallback(radii[corner], shapes[corner])),
    exact: values.exact === "on",
  };
}

// The card is sized by its frame, not in rem, so the clamp ceiling comes from the laid-out
// box or nowhere.
function cardSize(): { width: number; height: number } {
  const rem = parseFloat(getComputedStyle(root).fontSize);
  const box = card.getBoundingClientRect();
  return { width: box.width / rem, height: box.height / rem };
}

// Everything that decides how big the card is, applied before anything measures it.
function frameCard(values: Values): void {
  root.style.setProperty("--size", String(Number(values.size)));
  root.style.setProperty("--ratio", String(Number(values.ratio)));
  root.style.setProperty("--p", `${Number(values.padding)}%`);
  root.style.setProperty("--fs", `${Number(values["font-size"])}rem`);
}

// Only needed when the preview has to draw one, which saves a curve fit on every frame of
// a slider drag in a browser that can do `corner-shape` itself.
function previewClip(state: GeneratorState): string | null {
  if (!previewIsSynthetic && !state.exact) return null;
  return exactClipPath({ ...state, unit: "rem" });
}

function paintPreview(state: GeneratorState, values: Values, clip: string | null): void {
  for (const corner of CORNERS) {
    root.style.setProperty(`--r-${corner}`, `${state.radii[corner]}rem`);
    root.style.setProperty(`--fb-r-${corner}`, `${state.fallbackRadii[corner]}rem`);
    root.style.setProperty(`--shape-${corner}`, shapeValue(state.shapes[corner]));
  }
  root.style.setProperty("--preview-clip", clip ?? "none");
  stage.dataset.preview = values.preview ?? "enhanced";
  stage.dataset.exact = String(state.exact && clip !== null);
  // No clip path means all-round (border-radius draws it) or all-square (nothing to draw).
  stage.dataset.clip = clip ? "path" : "none";
  stage.dataset.square = String(CORNERS.every((corner) => state.shapes[corner] === Infinity));
  card.textContent = values.text || " ";
}

function paintControls(values: Values): void {
  for (const input of shapeRanges) {
    input.setAttribute("aria-valuetext", shapeValue(shapeNumber(values[input.dataset.bind!])));
  }
  syncPresetChecks(values);
  paintRangeProgress();
  form.dataset.mode = values.mode === "individual" ? "individual" : "all";
}

let emitted = "";

function paintOutput(state: GeneratorState): void {
  const { radius, shape } = declarationValues(state);
  readout.textContent = `border-radius: ${radius};\ncorner-shape: ${shape};`;

  const css = emitCss(state);
  // Highlighting re-parses and rebuilds the block; identical text leaves it nothing to do.
  if (css === emitted) return;
  emitted = css;
  output.textContent = css;
  void highlightElement(output, "css", "multiline", { hideLineNumbers: true });
}

function render(): void {
  const values = readValues();
  frameCard(values);
  const { width, height } = cardSize();
  // Clamping rewrites the radius inputs, which makes the values read a moment ago stale.
  const settled = limitRadii(width, height) ? readValues() : values;
  const state = makeState(settled, width, height);

  paintControls(settled);
  paintPreview(state, settled, previewClip(state));
  paintOutput(state);
}

// A drag fires `input` faster than the page can paint, and measuring the card forces
// layout. One render per frame is all any of them can show.
let frame = 0;

function scheduleRender(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    render();
  });
}

form.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  const fromToggle = target.matches("[data-preset-for]");
  if (fromToggle) applyPreset(target);
  else syncField(target);
  markPresetTransition(fromToggle);
  scheduleRender();
});

// Typing has stopped: a half-typed or out-of-range number snaps into shape.
form.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  if (!target.matches("[data-preset-for]")) syncField(target, true);
  scheduleRender();
});

// A frame that grows with the viewport moves where the radii start clamping, and that
// clamp is baked into the emitted clip path.
window.addEventListener("resize", scheduleRender, { passive: true });

let copiedTimer: ReturnType<typeof setTimeout> | undefined;

copyButton.addEventListener("click", async () => {
  try {
    // The emitted source, not the highlighted DOM, which is wrapped in the parser's markup.
    await navigator.clipboard.writeText(emitted);
  } catch {
    return;
  }
  copyButton.dataset.copied = "";
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => delete copyButton.dataset.copied, 2000);
});

render();
