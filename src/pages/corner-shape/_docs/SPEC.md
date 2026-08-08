# corner-shape generator — current state

A one-page generator for the CSS `corner-shape` property at `/corner-shape`: drag sliders, watch a live preview, copy the CSS. What makes it more than a syntax formatter is the **fallback** — `corner-shape` is Chromium-only, so the generator computes a fallback that matches the enhanced shape as closely as older properties allow, instead of guessing at a radius. The maths behind that is in [`fallback-algorithm.md`](./fallback-algorithm.md).

No React. One `<form>` holds the whole tool; a vanilla `input` listener re-serialises it and repaints from the result, so the DOM is the single source of truth.

## Page

```
head.astro             title, intro, folded "In depth" explainer
support-warning.astro  shown only when the browser lacks corner-shape
generator.astro        <form id="generator-form">
  stage.astro            preview card, Enhanced/Fallback toggle, value readout
  shape-settings.astro   card properties, All/Individual mode, corner fields
  output-section.astro   emitted CSS, copy button, exact toggle, selector, unit
baseline.astro         <baseline-status featureId="corner-shape">
```

Single column, `max-width: 83rem`. Above `54rem` the stage and controls sit side by side and the stage is sticky; the output block spans the full width below them.

## Render pipeline

`_lib/generator.ts` on every `input` / `change` / `resize`, coalesced to one run per animation frame (a drag outruns paint, and measuring the card forces layout):

1. `readValues()` — `FormData` over the form.
2. `frameCard()` — write `--size`, `--ratio`, `--p`, `--fs` to `documentElement.style`.
3. Measure the laid-out card, then `limitRadii()` re-hangs every radius slider's `max` at half the card's shorter side. If a radius had to shrink, the values are re-read.
4. `makeState()` — build `GeneratorState`: shapes, radii, derived fallback radii, unit, selector, exact flag.
5. Paint: custom properties onto `:root`, `data-*` on the stage, then the emitted CSS into the
   output block (skipped when the text is unchanged, since re-highlighting rebuilds the block).

Custom properties driving the preview live in `_styles/vars.css` with their server-rendered starting values: `--size`, `--ratio`, `--p`, `--fs`, `--r-*`, `--fb-r-*`, `--shape-*`, `--preview-clip`.

`_lib/form.ts` owns the control layer and knows nothing about shapes: element lookups done once, `data-value-for` / `data-bind` keeping each field's hidden input, slider and text box in step, preset checks, radius ceilings, and the `--progress` each slider paints its played track from.

## Controls

| Control          | Type                | Range / step        | Default                    |
| ---------------- | ------------------- | ------------------- | -------------------------- |
| Preview text     | textarea + Clear    | —                   | a sentence on the property |
| Size             | slider + number     | `0.1–1`, `0.01`     | `0.6` of the frame         |
| Aspect ratio     | slider + number     | `0.25–4`, `0.05`    | `1`                        |
| Padding          | slider + number     | `0–30%`, `0.5`      | `10%`                      |
| Font size        | slider + number     | `0.75–4rem`, `0.05` | `1rem`                     |
| Corner mode      | All / Individual    | —                   | All                        |
| Preset           | 6-position toggle   | six keywords        | Squircle                   |
| Superellipse `s` | slider + text       | `-3–5`, `0.1`       | `2`                        |
| Radius           | slider + number     | `0–18rem`, `0.01`   | `1rem`                     |
| Preview tier     | Enhanced / Fallback | —                   | Enhanced                   |
| Exact fallback   | checkbox            | —                   | off                        |
| Selector         | text                | —                   | `.card`                    |
| Unit             | rem / px            | —                   | rem                        |

Both corner modes stay in the markup and the mode switch shows one of them, so the form always serialises a complete answer for whichever mode is active. In Individual mode the preset, shape and radius fields repeat in a 2×2 grid mapped to the physical corners — shape and radius always travel together; there is no separate link toggle.

Presets write their number into the shape field and stay lit only while it matches, so dragging off `2` un-checks Squircle. `notch` and `square` are `±infinity` and unreachable by dragging: picking one pins the slider to its end, and the shape field is a text input so it can hold `infinity` at all. The radius slider's `18rem` maximum is a server-side guess overwritten on the first render.

**The fallback radius is not a control.** It is derived from `(r, s)` and only ever appears in the generated CSS.

## Output

Corner properties only — the size and padding sliders are staging for judging corners, and everything emitted is box-independent. `_lib/emit.ts` builds one string: the fallback declaration first so every browser gets something, then an `@supports` block for browsers that can honour the real shape. `px` output multiplies rem by 16; equal corners collapse through the `border-radius` shorthand rules.

**Default tier** — a radius tuned to remove the same corner area (squircle at `1rem`):

```css
.card {
  border-radius: 0.583rem;
}

@supports (corner-shape: squircle) {
  .card {
    border-radius: 1rem;

    corner-shape: squircle;
  }
}
```

Concave shapes get the typed radius plus a comment saying it is a placeholder, not a match.

**Exact tier** (opt-in) — the base rule carries a clip path and the `@supports` block removes it with `clip-path: none`. `bevel` and `notch` emit `polygon()`, everything else `shape()`; all-round and all-square need no path at all and fall back to the radius. Radii are clamped before emission. The trade-off is stated in a comment in the output: the cut lands on the border box, so a `border`, `outline`, or `box-shadow` on the element loses its corners to it — straight stubs of edge with bare curve between them — and the comment sends stroked elements back to the radius tier. That is why the exact tier is opt-in rather than the default.

Where every corner is at least as full as a circle — `s ≥ 1`, so `k = 2^s ≥ 2` — the tier also emits the clamped `border-radius` the path was drawn from, and swaps the comment for one that says what that buys. A rounded border stays inside the clip instead of losing its corners to it, `round` being the exact case where the two curves are the same one. Below `round` (`bevel`, `scoop`, `notch`, any `0 < s < 1`) the circle bulges back out through the clip and the corners are cut anyway, and `square` has no curve to hide under, so those emit the path alone and keep the original warning rather than shipping a fix that does not fix.

The radius only keeps the border whole; it does not make it follow the shape. A circle drifts from the superellipse as the radius grows — under 2px at 19px, 9px at `squircle` on 3rem, 12.5px at the 4.9rem the support panel used to carry — which is why `_components/baseline.astro` takes the radius tier instead. `outline` and `box-shadow` are cut either way.

## Preview

One card, A/B toggled between tiers so both land on the same pixels — which is how a half-pixel radius difference becomes visible. Neither tier is a mockup: the enhanced card carries the real declaration, the fallback card the real generated CSS. The card is sized as a fraction of a fixed dotted frame rather than in rem, so dragging to a wide flat box makes radius clamping engage; it is sized, not `scale()`d, because a transform would shrink the radius being judged.

An inline script in `<head>` sets `data-corner-shape="supported"` or `"unsupported"` on `<html>` from `CSS.supports("corner-shape: squircle")` before paint, so there is no flash. When unsupported, the enhanced state is synthesized from the fitter's `clip-path`, the warning banner explains that, and the fitter runs every frame instead of only when the exact tier is on.

The figure is `aria-hidden` — everything it shows is stated by the controls and the output. Sliders carry `aria-valuetext` (`squircle`, `superellipse(2.4)`), preset groups are radio groups in fieldsets, and the copy button reports success in a polite live region.

## Files

```
src/pages/corner-shape/
  index.astro          full <html> page, per repo convention
  _components/*.astro  markup + component-local <style>; toggle.astro and
                       slider-field.astro are the two reused primitives
  _styles/
    index.css          @layer reset, ui — everything two components would copy
    colors.css         palette (marked do-not-change) and semantic tokens
    vars.css           live-state custom properties, documented inline
  _lib/
    controls.ts        control data the markup loops over
    superellipse.ts    gamma, quadrant area, area-match ratio, curve fitting, clamping
    emit.ts            GeneratorState → CSS strings and clip paths
    form.ts            element lookups, field syncing, radius ceilings
    generator.ts       the render pipeline
    *.test.ts          vitest, run by `bun run test`
  _docs/               this file and fallback-algorithm.md
```

`_components/` here holds Astro components rather than React islands, and their logic lives in
`_lib/` — a deliberate deviation from the CLAUDE.md description of the convention.

Dependencies this probe adds: `baseline-status` (pulls in `lit` and `@lit/task`, fetches from `api.webstatus.dev` at runtime — the first runtime network dependency in the repo, with a text fallback for the offline case) and `@speed-highlight/core` for the output block.

## Known gaps

- **The concave curve model is wrong.** For `s < 0` the fitter draws `u^k + v^k = 1` where Chrome draws a reflection; see the open defect in [`fallback-algorithm.md`](./fallback-algorithm.md) §2 for the measurements and the blast radius. Convex shapes are unaffected.
- No `_article.md` and no entry in the repo `README.md` — every other probe pairs its demo with a published explainer, and this one should too.
- No URL-shareable configs: the form owns all state.
- Elliptical corners (two radii per corner) and logical longhands are out of scope.
