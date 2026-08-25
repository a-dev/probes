# The fallback algorithm

`corner-shape` is Chromium-only (2026). Everyone else gets whatever the `@supports` fallback says, so the fallback is the part worth deriving rather than guessing. Every figure below was computed and checked against Chrome's rendering, not estimated.

## 1. The property

`corner-shape` reshapes the curve `border-radius` already carved. It has **no effect at
`border-radius: 0`** — the radius defines the corner box, `corner-shape` only decides what path crosses it.

Six keywords, all sugar for one function:

| Keyword    | Equivalent                | Exponent `k` |
| ---------- | ------------------------- | ------------ |
| `notch`    | `superellipse(-infinity)` | `0`          |
| `scoop`    | `superellipse(-1)`        | `0.5`        |
| `bevel`    | `superellipse(0)`         | `1`          |
| `round`    | `superellipse(1)`         | `2`          |
| `squircle` | `superellipse(2)`         | `4`          |
| `square`   | `superellipse(infinity)`  | `∞`          |

**The exponent is `k = 2^s`, not `2s`.** The parameter is the base-2 log of the exponent, by resolution — _"RESOLVED: Use the log2 range for the superellipse parameter"_ ([CSSWG, April 2025](https://lists.w3.org/Archives/Public/public-css-archive/2025Apr/0019.html), on [csswg-drafts#11609](https://github.com/w3c/csswg-drafts/issues/11609)). The log scale buys symmetry about `bevel` and an even interpolation velocity; interpolating `k` itself races through the concave half and crawls through the convex one ([#11608](https://github.com/w3c/csswg-drafts/issues/11608)).

`bevel` settles it: `superellipse(0)` draws a straight diagonal, which is `|x| + |y| = 1`, exponent `1`. `k = 2^s` gives `1`; `k = 2s` gives `0`, and `|x|⁰ + |y|⁰ = 2` is not a curve.

The wrong form is worth naming because it is easy to arrive at honestly. `2^s = 2s` has exactly two real roots, `s = 1` and `s = 2` — which are `round` and `squircle`, the two values anyone is most likely to spot-check. Chrome's own implementation write-up also reads "represent 2k" in published form ([developer.chrome.com](https://developer.chrome.com/blog/implementing-corner-shape)); the same article writes `y=x^n` with a proper superscript two paragraphs later, so it is a dropped `<sup>` rather than a claim, but the rendered sentence says `2k`.

Measured directly in Chromium 148, binary-searching the hit-test boundary along the 45° diagonal at `r = 200px` (`k = −ln2 / ln(1 − d/r)`):

| `s`   | `0`  | `0.5` | `1`  | `2`  | `3`  | `4`   |
| ----- | ---- | ----- | ---- | ---- | ---- | ----- |
| `2^s` | 1    | 1.41  | 2    | 4    | 8    | 16    |
| `2s`  | 0    | 1     | 2    | 4    | 6    | 8     |
| found | 1.01 | 1.43  | 2.02 | 4.07 | 8.26 | 17.01 |

The two agree at `s = 1` and `s = 2` and nowhere else, exactly as the algebra says.

## 2. Corner geometry

Put the box corner at the origin: the corner box is `[0, r] × [0, r]`, its inner corner (the centre of curvature) is `(r, r)`, and the curve runs from `(0, r)` to `(r, 0)`. Substituting `u = 1 − x/r` and `v = 1 − y/r`:

```
u^k + v^k = 1,    u, v ∈ [0, 1],    k = 2^s
```

Checks: `k = 2` is a circle centred on the inner corner (round), `k = 1` is `x + y = r` (bevel), `k → ∞` hugs both edges (square), `k → 0` removes an `r × r` bite (notch).

Tangent direction at the edge, needed for curve fitting:

```
dx/dy = −(tan φ)^(2 − 2/k)
```

For `k > 1` the curve meets the edge **tangentially**; for `k < 1` it meets it **perpendicularly**, a visible crease. A fitter that assumes the convex case produces garbage on `scoop`.

### ⚠ Open defect: the formula is wrong for `s < 0`

Measured against Chrome, `u^k + v^k = 1` holds for `s ≥ 0` and **not** for `s < 0`. Chrome draws a negative `s` as `superellipse(-s)` reflected across the chord joining the two edge points — which here means dropping the `1 −` substitution:

```
concave, s < 0:   (x/r)^K + (y/r)^K = 1,    K = 2^(−s)
```

So `scoop` is a quarter circle centred on the _box_ corner, not the parabola `√u + √v = 1`. The two models agree at `s = 0` (bevel) and in the `s → −∞` limit (notch), which is how it survived: both endpoints of the concave range check out.

| `s`    | max error, `u^k + v^k = 1` | max error, reflection |
| ------ | -------------------------- | --------------------- |
| `-0.5` | 8.6 px                     | 1.1 px                |
| `-1`   | 30.7 px                    | 2.0 px                |
| `-2`   | 80.8 px                    | 1.0 px                |
| `-3`   | 39.2 px                    | 1.0 px                |

Sampled at `r = 300px` by binary-searching the hit-test boundary (`corner-shape` affects hit testing, so `elementFromPoint` reads the real curve); the residual 1–2 px is that search's own quantization. Confirmed again by painting a `polygon()` of each model over the native corner with `mix-blend-mode: difference` — the reflection cancels to black, `u^k + v^k = 1` does not. The same probe reproduces `k = 2^s` for `s > 0` to within a pixel, so §1 stands; only the concave branch is wrong.

The §1 diagonal measurement re-confirms it a third way, and more sharply, since one point on the curve can be located precisely. The reflection predicts every concave sample to a constant `−0.49 px` — the same bias the convex samples carry, i.e. one device pixel at `dpr = 2` — while the curve this code actually draws is out by far more than measurement error:

| `s`    | measured `d` | reflection | what `pointAt` draws |
| ------ | ------------ | ---------- | -------------------- |
| `-0.5` | 122.02       | 122.51     | 124.96               |
| `-1`   | 140.92       | 141.42     | 150.00               |
| `-2`   | 167.68       | 168.18     | 187.50               |

**Not fixed.** The blast radius is `pointAt`/`tangentAt`, the `s = -1` quadratic shortcut in `emit.ts` (a quarter circle is not a quadratic Bézier), and the `scoop` row in §4. The fitter itself needs no change — refit against the reflected curve and `s = -3` lands at `0.1884%` in 4 segments, and every concave `s` fits as well as convex `|s|` does, which is what a reflection should do.

## 3. The default fallback: match the area removed

For `s ≥ 0` the shape is convex and `border-radius` can approximate it. Two defensible metrics: matching the cut depth at the 45° apex is one line of maths but matches a single point and systematically under-rounds, since a superellipse stays fatter everywhere else. **Area-match** — equalising how much corner area is removed — models perceived corner weight better, so that is what
the generator uses.

The fraction of the corner box that stays filled is the superellipse quadrant area:

```
Q(k) = ∫₀¹ (1 − u^k)^(1/k) du = Γ(1 + 1/k)² / Γ(1 + 2/k)
```

`Q(2) = π/4`, `Q(1) = 1/2`, `Q(∞) = 1`, `Q(0) = 0`, all four hold. Area removed is `r²(1 − Q(k))`; setting it equal to a round corner's, where `Q = π/4`:

```
r_fallback = r · √( (1 − Q(2^s)) / (1 − π/4) )
```

`Γ` comes from a Lanczos approximation (`g = 7`, 9 coefficients), about twelve lines.

| `s`            | `k`  | ratio      |     | `s`          | `k`   | ratio      |
| -------------- | ---- | ---------- | --- | ------------ | ----- | ---------- |
| `0` (bevel)    | 1.00 | **1.5264** |     | `2.5`        | 5.66  | **0.4326** |
| `0.5`          | 1.41 | **1.2578** |     | `3`          | 8.00  | **0.3168** |
| `1` (round)    | 2.00 | **1.0000** |     | `3.5`        | 11.31 | **0.2298** |
| `1.5`          | 2.83 | **0.7723** |     | `4`          | 16.00 | **0.1654** |
| `2` (squircle) | 4.00 | **0.5831** |     | `5`          | 32.00 | **0.0846** |
|                |      |            |     | `∞` (square) | ∞     | **0**      |

`s = 1` returns exactly `1.0` — a round corner falls back to itself, which is the test that matters. `square` falls back to a sharp corner. `bevel` needs a radius half again as large as the one you typed, which surprises people but is right: a bevel cuts far more corner than a round of the same radius.

For an elliptical corner with axes `rₓ` and `rᵧ`, anisotropic scaling changes the removed area to `rₓrᵧ(1 − Q(k))`. The round fallback is an ellipse too. Applying the ratio above to both axes gives `rₓrᵧ · ratio² · (1 − π/4)`, which is the same area. The ratio is therefore axis-independent; the generator applies it to ↔ and ↕ separately.

The number the Chrome docs hand out for `superellipse(3)` at `1rem` is `0.5rem`. Area-match puts it at **`0.317rem`** — the published figure is roughly 1.6× too round.

### The same ratio as one `calc()`

The generator knows `s` when it runs, so it emits the ratio already multiplied out — `border-radius: 0.583rem` beats any expression that recomputes it. The closed form below is for the other case: **`s` as a live custom property**, set per component, swapped at a breakpoint, themed, or transitioned. Then the fallback tracks it with no JavaScript, and it composes with a `--radius` that is itself a `clamp()`.

CSS has `pow()`, `exp()`, `log()` and `sqrt()` but no `Γ`, so the formula above cannot be transcribed directly. Transcribing Lanczos instead would work — it is only arithmetic — but it is around forty lines of nested division per gamma call, twice. The asymptotics give something far smaller.

Expand `ln Q` for small `ε = 1/k`. With `lnΓ(1 + x) = −γx + Σ(−1)ⁿζ(n)xⁿ/n` the Euler–Mascheroni terms cancel between `2 lnΓ(1 + ε)` and `lnΓ(1 + 2ε)`, leaving `ln Q ≈ −ζ(2)ε² + 2ζ(3)ε³ − …`. So `1 − Q → (π²/6)ε²` and the whole ratio decays as a pure `C/k`:

```
C = π · √( 2 / (3(4 − π)) ) = 2.76858
```

Factor that out and what remains is a correction on `ε ∈ (0, 1]` whose series coefficients are `−0.728, +0.444, −0.227, +0.063` — alternating, each roughly `−0.5×` the last. That is a geometric series, and a geometric series **is** `1/(1 + x)`: a polynomial has to chase it term by term (a quartic gets to `0.045%`), a denominator absorbs the tail in two terms and does slightly better.

```
ratio(s) ≈ C·ε / (1 + a·ε + b·ε²),    ε = 2^(−s)
```

`a` and `b` are not fitted. Two anchors pin them exactly:

- **`s = 1`** — round must fall back to itself, so `C/2 = 1 + a/2 + b/4`.
- **`s = 0`** — bevel has the closed form `√(2/(4 − π))`, and `C / ratio(0) = √(π²/3) = π/√3`, the `(1 − π/4)` cancelling out.

```
a = 2C − 3 − π/√3   = 0.72337
b = 2(π/√3 + 1 − C) = 0.09043
```

Three custom properties, one `pow()`, two constants:

```css
.card {
  --radius: 1rem;
  --s: 2;

  /* area-match fallback ratio: C·ε / (1 + aε + bε²), ε = 2^-s */
  --_e: pow(2, calc(-1 * var(--s)));
  --_ratio: calc(2.76858 * var(--_e) / (1 + var(--_e) * (0.72337 + 0.09043 * var(--_e))));

  border-radius: calc(var(--radius) * var(--_ratio));
}

@supports (corner-shape: squircle) {
  .card {
    border-radius: var(--radius);
    corner-shape: superellipse(var(--s));
  }
}
```

Computed `border-top-left-radius` in Chromium 148 at `--radius: 16px`, against `fallbackRatio()`:

| `s`        | `0`         | `0.5`       | `1`    | `1.5`       | `2`         | `2.5`       | `3`         | `4`         | `5`         |
| ---------- | ----------- | ----------- | ------ | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| computed   | `24.4224px` | `20.1212px` | `16px` | `12.3605px` | `9.33365px` | `6.92555px` | `5.07143px` | `2.64793px` | `1.35357px` |
| rel. error | **0**       | `-0.020%`   | **0**  | `0.027%`    | `0.046%`    | `0.052%`    | `0.049%`    | `0.034%`    | `0.019%`    |

Worst case over `s ∈ [0, 8]` is **`0.052%`** — `0.013px` at `r = 16px`, `0.04px` at `r = 48px`, three orders of magnitude under a device pixel. `bevel` and `round` are exact, which is the property worth having: a card that sets `round` round-trips through the fallback unchanged. A cubic denominator (`+ 0.011ε³`) reaches `0.0065%` and buys nothing.

Dropping to one coefficient, `C·ε / (1 + 0.79476ε)`, costs more than it looks: **`1.06%`** worst case is still only `0.26px` at `r = 16px`, but it puts `round` at `0.9906` instead of `1`, so the round-trip stops holding. The second coefficient is worth its four characters.

Four things this tier does not do:

- **Convex only.** `ε = 2^(−s)` passes `1` for `s < 0` and the fit leaves its domain — but §4 is the real reason: no radius approximates a scoop, so the honest move is to scope the expression to `s ≥ 0` rather than extend it. `square` (`s = ∞`) has to be written `0` by hand.
- **`pow()` is Baseline September 2023** (Chrome 111, Safari 15.4, Firefox 118) — older than the `shape()` tier of §5 needs anyway, so every browser missing `corner-shape` has it. Anything older drops the declaration whole, which a plain `border-radius: var(--radius)` ahead of it covers for one line.
- **Animating `s` needs `@property`.** An unregistered custom property does not interpolate; `@property --s { syntax: "<number>"; inherits: true; initial-value: 1 }` makes the whole chain transition, `pow()` included.
- **Feature-detect `pow()` as a number.** It resolves to a `<number>`, not a length, so `CSS.supports('width', 'pow(2,3)px')` reports false. The working probe is `CSS.supports('width', 'calc(1px * pow(2, 3))')`.

Clamping, at least, is free here in a way it is not for the generated paths: `border-radius` applies §6 itself.

## 4. Concave has no `border-radius` fallback

For `s < 0` the curve bends inward and `border-radius` only bends outward. There is no radius that approximates a `scoop`. Not a worse one — none.

The formula still returns values (`scoop` → `1.97r`, `notch` → `2.16r`) because equal area is satisfiable, but visually it is a lie: a fat convex bite where a concave notch was. So the generator keeps the radius the user typed and says so in a comment in the emitted CSS.

## 5. The exact tier

`clip-path: shape()` reached Baseline in February 2026 — Chrome 119+, Firefox 136+, Safari 18.2+, precisely the browsers missing `corner-shape`. It takes lengths and percentages, so the result stays responsive with no JavaScript.

The cost never goes away and belongs in a comment in the emitted CSS: **any `clip-path` clips away `box-shadow`, `outline`, and borders drawn outside the path.**

### Five of six keywords need no fitting

| Value    | Exact form                                                       | Verified                      |
| -------- | ---------------------------------------------------------------- | ----------------------------- |
| `square` | no corner; plain rectangle                                       | trivially                     |
| `round`  | `border-radius` already is this                                  | no clip path needed           |
| `bevel`  | one `line` per corner → 8-point `polygon()`                      | exact                         |
| `notch`  | two `line`s per corner → 12-point `polygon()`                    | exact                         |
| `scoop`  | one quadratic Bézier, control point at the inner corner `(r, r)` | `0.000000%` over 1000 samples |

`scoop` being exactly a parabola is worth a moment: at `k = 1/2`, substituting `u = t²` gives `v = (1 − t)²`, a quadratic parametrization, so a quadratic Bézier reproduces it perfectly. (Under the reflected model of §2 this shortcut is wrong — a quarter circle is not a quadratic.)

Only `squircle` and arbitrary `superellipse(n)` need fitted cubics.

### Fitting arbitrary `superellipse(n)`

Split the corner into cubic segments over `φ ∈ [0, π/2]`. Per segment: take the exact endpoints and tangent directions from §2, then solve the two control-handle magnitudes so the Bézier passes through the segment's midpoint — a 2×2 linear solve, no iterative optimizer. Subdivide adaptively (uniform splitting wastes segments: curvature concentrates near the diagonal at low `k` and near the edges at high `k`), tolerance `0.25%` of `r`, recursion capped at depth 6.

**Measure deviation as distance to the curve, not as a radial difference.** Comparing radii at a matched polar angle is only trustworthy while the curve crosses the ray being measured along. Deep concave corners run _down_ that ray: at `k = 0.125` the true radius drops from `1` to `0.92` within one ULP of the axis, so a point `0.15%` off reads as `8.5%` wrong — and the adaptive split then spends segments chasing floating-point noise. What works is the nearest point on the curve, taken against a polyline bisected in `φ` until every chord is under `0.002`. A distance is also defined where a fit bulges outside the corner box; a radial reading there raises a negative base to a fractional power and returns `NaN`, which compares false against the tolerance and silently switches the split off.

Two checks confirm the fitter: a circle at one segment gives **0.0272%** deviation — the textbook single-cubic quadrant error — and its control handles come out at **0.552285**, κ to six figures.

Segments per corner at `≤ 0.25%`:

| `s`    | segments | achieved |     | `s`   | segments | achieved |
| ------ | -------- | -------- | --- | ----- | -------- | -------- |
| `-3`   | 2        | 0.1887%  |     | `1`   | 1        | 0.0272%  |
| `-2.5` | 10       | 0.1242%  |     | `1.5` | 4        | 0.0628%  |
| `-2`   | 8        | 0.2494%  |     | `2`   | 4        | 0.1041%  |
| `-1.5` | 1        | 0.1231%  |     | `3`   | 4        | 0.1884%  |
| `-0.5` | 2        | 0.0739%  |     | `4`   | 6        | 0.0682%  |
| `0.5`  | 2        | 0.2268%  |     | `5`   | 6        | 0.1063%  |

Swept at `0.05` steps over the slider's full `s ∈ [-3, 5]`, the worst fit is **0.2494%** at `s = -2` and the heaviest is **12 segments** at `s = -2.9`. Nothing hits the depth cap, so the tolerance is met everywhere rather than approached. Verified both directions — forward (fitted → curve) and backward (curve → fitted) Hausdorff distance against a reference bisected to `2e-5` chords — so the fit is not quietly skipping an arc of the curve to score well on its own samples.

At four corners, a squircle's 4 segments are 16 curve commands, about 1.8 KB of `shape()`. The
`s = -2.9` worst case is 48 commands, about 5 KB. Chunky but copyable.

## 6. Radius clamping

CSS scales radii down when two on an edge would overlap. Per CSS Backgrounds 3 §5.5: let `f = min(Lᵢ / Sᵢ)` over the four edges, where `Lᵢ` is the edge length and `Sᵢ` the sum of the two radii on it; if `f < 1`, multiply every radius by `f`.

`border-radius` and `corner-shape` do this automatically. **Generated `polygon()` and `shape()` paths do not** — an unclamped path with `r > min(width, height) / 2` self-intersects and renders as garbage, so the generator applies the same formula before emitting any clip path. The preview's size and aspect-ratio sliders make this reachable by dragging, so it gets hit.

## 7. Scope limits

- **Physical corners only.** Logical longhands are not emitted.
- Fitted geometry is independent of box size, so output stays responsive: corner curves use their horizontal and vertical lengths, while far edges use `calc(100% - rₓ)` or `calc(100% - rᵧ)`.

## 8. What the tests assert

`_lib/superellipse.test.ts` and `_lib/emit.test.ts`, run by `bun run test`:

1. `Γ(1.5) = 0.8862269`; `Q(2) = π/4`, `Q(1) = 0.5`.
2. `ratio(1) === 1.0` exactly, `ratio(2) ≈ 0.5831`, `ratio(3) ≈ 0.3168`.
3. Circle at one segment: deviation `≈ 0.0272%`, handle length `≈ 0.552285`.
4. `scoop` as a quadratic with control at `(r, r)`: deviation `< 1e-9`.
5. Adaptive fit over the full `s ∈ [-3, 5]`: deviation `≤ 0.25%`. Starting this sweep in the convex half is what let the concave miss sit unnoticed.
6. Deviation over `s ∈ [-3, 0)` is a number, never `NaN` — the guard against a return to a reading with a domain.
7. Segment count over `s ∈ [-3, 0)` stays `≤ 12` per corner. Converging is half the requirement; every extra segment is emitted CSS.
8. Clamping: `r > min(w, h) / 2` produces a non-self-intersecting path.
9. Emission: notch keeps its inner-corner detour, bevel is an 8-point polygon, round and square emit no path, zero offsets are written `0` / `100%`, and equal corners collapse to one value.

Assertions 2, 3, and 4 are load-bearing — each has a known closed-form answer, so they fail loudly if the geometry drifts.
