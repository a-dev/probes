export type Point = { x: number; y: number };
export type Cubic = {
  start: Point;
  control1: Point;
  control2: Point;
  end: Point;
  startAngle: number;
  endAngle: number;
};

const QUARTER = Math.PI / 2;

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
  const a = Math.min(QUARTER - epsilon, Math.max(epsilon, angle));
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

// The curve as a polyline. Bisecting in φ puts samples where the curve turns, not where φ
// is evenly spaced; angles ride along so a measurement can scan only its own stretch.
type Outline = { points: Point[]; angles: number[] };

function curveOutline(s: number, chord = 0.002): Outline {
  const points = [pointAt(s, 0)];
  const angles = [0];
  const walk = (start: number, end: number, from: Point, to: Point, depth: number) => {
    if (depth >= 40 || Math.hypot(to.x - from.x, to.y - from.y) <= chord) {
      points.push(to);
      angles.push(end);
      return;
    }
    const midpoint = (start + end) / 2;
    const at = pointAt(s, midpoint);
    walk(start, midpoint, from, at, depth + 1);
    walk(midpoint, end, at, to, depth + 1);
  };
  walk(0, QUARTER, points[0], pointAt(s, QUARTER), 0);
  return { points, angles };
}

// Nearest-point rather than radii at a matched polar angle: deep concave corners run *down*
// that ray, which turned a 0.15% miss into 8.5%.
function distanceToOutline(outline: Outline, point: Point, from: number, to: number): number {
  const { points } = outline;
  let best = Infinity;
  for (let index = Math.max(1, from); index <= to; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const runX = end.x - start.x;
    const runY = end.y - start.y;
    const lengthSquared = runX * runX + runY * runY;
    const along =
      lengthSquared === 0
        ? 0
        : Math.min(
            1,
            Math.max(0, ((point.x - start.x) * runX + (point.y - start.y) * runY) / lengthSquared),
          );
    const gapX = start.x + along * runX - point.x;
    const gapY = start.y + along * runY - point.y;
    best = Math.min(best, gapX * gapX + gapY * gapY);
  }
  return Math.sqrt(best);
}

function angleIndex(angles: number[], angle: number): number {
  let low = 0;
  let high = angles.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (angles[middle] < angle) low = middle + 1;
    else high = middle;
  }
  return low;
}

// A segment strays only near its own stretch, so scanning all ~1300 points is wasted work.
// Padding by its own span cannot change the accept/split decision: a fit whose nearest
// point falls outside the window is already over tolerance inside it.
function windowFor(outline: Outline, segment: Cubic): [number, number] {
  const { angles } = outline;
  const pad = segment.endAngle - segment.startAngle;
  return [
    angleIndex(angles, segment.startAngle - pad),
    Math.min(angles.length - 1, angleIndex(angles, segment.endAngle + pad) + 1),
  ];
}

const SAMPLES = 40;

// `limit` stops early once a segment is known to be too coarse; the exact maximum only
// matters when nothing exceeded it.
function deviationFrom(outline: Outline, segment: Cubic, limit = Infinity): number {
  const [from, to] = windowFor(outline, segment);
  let maximum = 0;
  for (let index = 1; index < SAMPLES; index += 1) {
    const point = cubicPoint(segment, index / SAMPLES);
    maximum = Math.max(maximum, distanceToOutline(outline, point, from, to));
    if (maximum > limit) return maximum;
  }
  return maximum;
}

export function segmentDeviation(
  s: number,
  startAngle: number,
  endAngle: number,
  segment = fitSegment(s, startAngle, endAngle),
): number {
  const outline = curveOutline(s);
  let maximum = 0;
  for (let index = 1; index < SAMPLES; index += 1) {
    const point = cubicPoint(segment, index / SAMPLES);
    maximum = Math.max(maximum, distanceToOutline(outline, point, 1, outline.points.length - 1));
  }
  return maximum;
}

// One frame asks for the same curve up to eight times and it depends only on `s`.
// LRU-bounded, because a drag sweeps through a lot of distinct values.
const fits = new Map<string, Cubic[]>();
const FIT_CACHE_LIMIT = 64;

const BEVEL: Cubic = {
  start: { x: 0, y: 1 },
  control1: { x: 1 / 3, y: 2 / 3 },
  control2: { x: 2 / 3, y: 1 / 3 },
  end: { x: 1, y: 0 },
  startAngle: 0,
  endAngle: QUARTER,
};

export function fitSuperellipse(s: number, tolerance = 0.0025): Cubic[] {
  if (s === 0) return [BEVEL];

  const key = `${s}|${tolerance}`;
  const cached = fits.get(key);
  if (cached) {
    fits.delete(key);
    fits.set(key, cached);
    // Copied on the way out so a caller reordering the segments cannot poison the cache.
    return cached.slice();
  }

  // Built once, not per segment: the recursion below asks about it a few hundred times.
  const outline = curveOutline(s);
  const result: Cubic[] = [];
  const split = (start: number, end: number, depth: number) => {
    const segment = fitSegment(s, start, end);
    // Depth 6 clears s ∈ [-3, 5] without ever reaching the cap: worst case 0.249% at s = -2.
    if (depth < 6 && deviationFrom(outline, segment, tolerance) > tolerance) {
      const midpoint = (start + end) / 2;
      split(start, midpoint, depth + 1);
      split(midpoint, end, depth + 1);
    } else {
      result.push(segment);
    }
  };
  split(0, QUARTER, 0);

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
