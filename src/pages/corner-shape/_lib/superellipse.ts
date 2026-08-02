export type Point = { x: number; y: number };
export type Cubic = {
  start: Point;
  control1: Point;
  control2: Point;
  end: Point;
  startAngle: number;
  endAngle: number;
};

const LANCZOS = [
  0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
  12.5073432786869, -0.13857109526572, 0.000009984369578, 0.0000001505632735,
];

export function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  const shifted = z - 1;
  const sum = LANCZOS.slice(1).reduce(
    (value, coefficient, index) => value + coefficient / (shifted + index + 1),
    LANCZOS[0],
  );
  const t = shifted + 7.5;
  return Math.sqrt(2 * Math.PI) * t ** (shifted + 0.5) * Math.exp(-t) * sum;
}

export function quadrantArea(k: number): number {
  if (k === Infinity) return 1;
  if (k === 0) return 0;
  return gamma(1 + 1 / k) ** 2 / gamma(1 + 2 / k);
}

export function fallbackRatio(s: number): number {
  if (s === 1) return 1;
  if (s === Infinity) return 0;
  return Math.sqrt((1 - quadrantArea(2 ** s)) / (1 - Math.PI / 4));
}

function pointAt(s: number, angle: number): Point {
  const power = 2 / 2 ** s;
  return {
    x: 1 - Math.cos(angle) ** power,
    y: 1 - Math.sin(angle) ** power,
  };
}

function tangentAt(s: number, angle: number): Point {
  const power = 2 / 2 ** s;
  const epsilon = 1e-8;
  const a = Math.min(Math.PI / 2 - epsilon, Math.max(epsilon, angle));
  const tangent = {
    x: power * Math.cos(a) ** (power - 1) * Math.sin(a),
    y: -power * Math.sin(a) ** (power - 1) * Math.cos(a),
  };
  const length = Math.hypot(tangent.x, tangent.y);
  return { x: tangent.x / length, y: tangent.y / length };
}

function solve(a: Point, b: Point, value: Point): [number, number] {
  const determinant = a.x * b.y - a.y * b.x;
  return [
    (value.x * b.y - value.y * b.x) / determinant,
    (a.x * value.y - a.y * value.x) / determinant,
  ];
}

export function fitSegment(s: number, startAngle: number, endAngle: number): Cubic {
  const start = pointAt(s, startAngle);
  const end = pointAt(s, endAngle);
  const tangentStart = tangentAt(s, startAngle);
  const tangentEnd = tangentAt(s, endAngle);
  const midpoint = pointAt(s, (startAngle + endAngle) / 2);
  const target = {
    x: (8 * midpoint.x - 4 * start.x - 4 * end.x) / 3,
    y: (8 * midpoint.y - 4 * start.y - 4 * end.y) / 3,
  };
  const [startHandle, endHandle] = solve(
    tangentStart,
    { x: -tangentEnd.x, y: -tangentEnd.y },
    target,
  );
  return {
    start,
    control1: {
      x: start.x + startHandle * tangentStart.x,
      y: start.y + startHandle * tangentStart.y,
    },
    control2: {
      x: end.x - endHandle * tangentEnd.x,
      y: end.y - endHandle * tangentEnd.y,
    },
    end,
    startAngle,
    endAngle,
  };
}

function cubicPoint(segment: Cubic, t: number): Point {
  const u = 1 - t;
  return {
    x:
      u ** 3 * segment.start.x +
      3 * u ** 2 * t * segment.control1.x +
      3 * u * t ** 2 * segment.control2.x +
      t ** 3 * segment.end.x,
    y:
      u ** 3 * segment.start.y +
      3 * u ** 2 * t * segment.control1.y +
      3 * u * t ** 2 * segment.control2.y +
      t ** 3 * segment.end.y,
  };
}

// The curve itself, as a polyline fine enough that measuring against it is the same as
// measuring against the real thing. Bisect in φ until every chord is shorter than
// `chord`, which puts samples where the curve actually turns rather than where φ happens
// to be evenly spaced — φ crowds the diagonal at low `k` and the edges at high `k`, and
// either way a fixed φ step leaves the interesting part unsampled.
function curveOutline(s: number, chord = 0.002): Point[] {
  const first = pointAt(s, 0);
  const outline = [first];
  const walk = (start: number, end: number, from: Point, to: Point, depth: number) => {
    if (depth >= 40 || Math.hypot(to.x - from.x, to.y - from.y) <= chord) {
      outline.push(to);
      return;
    }
    const midpoint = (start + end) / 2;
    const at = pointAt(s, midpoint);
    walk(start, midpoint, from, at, depth + 1);
    walk(midpoint, end, at, to, depth + 1);
  };
  walk(0, Math.PI / 2, first, pointAt(s, Math.PI / 2), 0);
  return outline;
}

// How far one point strays from the curve: the nearest point on the outline, full stop.
// This used to compare radii at a matched polar angle, which is only trustworthy while
// the curve runs across the ray it is measured along. Deep concave corners run *down*
// that ray — near the edge the true radius falls from 1 to 0.92 within one ULP of the
// axis — so the old reading turned a 0.15% miss into 8.5% and sent the adaptive split
// chasing rounding noise. Nearest-point has no such blind spot, in either direction, and
// it needs no special case for a fit that bulges outside the corner box.
function distanceToOutline(outline: Point[], point: Point): number {
  let best = Infinity;
  for (let index = 1; index < outline.length; index += 1) {
    const from = outline[index - 1];
    const to = outline[index];
    const runX = to.x - from.x;
    const runY = to.y - from.y;
    const lengthSquared = runX * runX + runY * runY;
    const along =
      lengthSquared === 0
        ? 0
        : Math.min(
            1,
            Math.max(0, ((point.x - from.x) * runX + (point.y - from.y) * runY) / lengthSquared),
          );
    const gapX = from.x + along * runX - point.x;
    const gapY = from.y + along * runY - point.y;
    best = Math.min(best, gapX * gapX + gapY * gapY);
  }
  return Math.sqrt(best);
}

function deviationFrom(outline: Point[], segment: Cubic): number {
  let maximum = 0;
  for (let index = 1; index < 40; index += 1) {
    maximum = Math.max(maximum, distanceToOutline(outline, cubicPoint(segment, index / 40)));
  }
  return maximum;
}

export function segmentDeviation(
  s: number,
  startAngle: number,
  endAngle: number,
  segment = fitSegment(s, startAngle, endAngle),
): number {
  return deviationFrom(curveOutline(s), segment);
}

// One drag of the shape slider asks for the same curve eight times: four corners, fitted
// once for the live preview and again for the emitted CSS. The fit only depends on `s`,
// and measuring against the outline costs real milliseconds at the concave end, so keep
// recent answers. Bounded, because a drag sweeps through a lot of distinct values.
const fits = new Map<string, Cubic[]>();
const FIT_CACHE_LIMIT = 64;

export function fitSuperellipse(s: number, tolerance = 0.0025): Cubic[] {
  if (s === 0) {
    return [
      {
        start: { x: 0, y: 1 },
        control1: { x: 1 / 3, y: 2 / 3 },
        control2: { x: 2 / 3, y: 1 / 3 },
        end: { x: 1, y: 0 },
        startAngle: 0,
        endAngle: Math.PI / 2,
      },
    ];
  }
  const key = `${s}|${tolerance}`;
  const cached = fits.get(key);
  // Copied on the way out so a caller reordering the segments cannot poison the cache.
  if (cached) return cached.slice();
  // Built once and measured against, rather than rebuilt per segment: it is the same
  // curve every time, and the recursion below asks about it a few hundred times.
  const outline = curveOutline(s);
  const result: Cubic[] = [];
  const split = (start: number, end: number, depth: number) => {
    const segment = fitSegment(s, start, end);
    // Depth 6 clears the whole slider range. Nothing in s ∈ [-3, 5] reaches the cap —
    // the worst case left is 0.249% at s = -2, and convex shapes still finish by depth 3.
    if (depth < 6 && deviationFrom(outline, segment) > tolerance) {
      const midpoint = (start + end) / 2;
      split(start, midpoint, depth + 1);
      split(midpoint, end, depth + 1);
    } else {
      result.push(segment);
    }
  };
  split(0, Math.PI / 2, 0);
  if (fits.size >= FIT_CACHE_LIMIT) {
    const oldest = fits.keys().next().value;
    if (oldest !== undefined) fits.delete(oldest);
  }
  fits.set(key, result);
  return result.slice();
}

export function clampRadii(
  radii: [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  const [topLeft, topRight, bottomRight, bottomLeft] = radii;
  const factor = Math.min(
    1,
    width / (topLeft + topRight || 1),
    height / (topRight + bottomRight || 1),
    width / (bottomLeft + bottomRight || 1),
    height / (topLeft + bottomLeft || 1),
  );
  return radii.map((radius) => radius * factor) as [number, number, number, number];
}
