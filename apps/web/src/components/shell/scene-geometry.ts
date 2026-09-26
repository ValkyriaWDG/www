/**
 * Deterministic geometry for the original fallback landscape (no game imagery). Seeded
 * generators keep server output stable between renders and across builds.
 */

export const SCENE_WIDTH = 1920;
export const SCENE_HEIGHT = 1080;

/** Small seeded PRNG (mulberry32); returns values in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r = (value: number) => Math.round(value);

/** Mountain range: overlapping sloped peaks plus fine midpoint noise, closed to the bottom edge. */
export function mountainPath(seed: number, options: { baseY: number; peaks: number; minHeight: number; maxHeight: number; slope?: number }): string {
  const { baseY, peaks, minHeight, maxHeight, slope = 0.55 } = options;
  const random = seededRandom(seed);
  const summits = Array.from({ length: peaks }, () => ({ x: random() * SCENE_WIDTH, h: minHeight + random() * (maxHeight - minHeight), s: slope * (0.7 + random() * 0.6) }));
  const noise = seededRandom(seed + 1);
  let d = `M0 ${SCENE_HEIGHT}`;
  for (let x = 0; x <= SCENE_WIDTH; x += 16) {
    const lift = Math.max(0, ...summits.map((peak) => peak.h - Math.abs(x - peak.x) * peak.s));
    d += ` L${x} ${r(baseY - lift + (noise() - 0.5) * 6)}`;
  }
  return `${d} L${SCENE_WIDTH} ${SCENE_HEIGHT}Z`;
}

/** Terrain ridge by midpoint displacement (optional linear tilt), closed down to the bottom edge. */
export function ridgePath(seed: number, options: { baseY: number; amplitude: number; roughness?: number; iterations?: number; tilt?: number }): string {
  const { baseY, amplitude, roughness = 0.52, iterations = 7, tilt = 0 } = options;
  const random = seededRandom(seed);
  let points: [number, number][] = [
    [0, baseY - tilt / 2 + (random() - 0.5) * amplitude],
    [SCENE_WIDTH, baseY + tilt / 2 + (random() - 0.5) * amplitude],
  ];
  let displacement = amplitude;
  for (let i = 0; i < iterations; i += 1) {
    const next: [number, number][] = [];
    for (let j = 0; j < points.length - 1; j += 1) {
      const [x0, y0] = points[j]!;
      const [x1, y1] = points[j + 1]!;
      next.push([x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 + (random() - 0.5) * displacement]);
    }
    next.push(points[points.length - 1]!);
    points = next;
    displacement *= roughness;
  }
  return `M0 ${SCENE_HEIGHT}${points.map(([x, y]) => ` L${r(x)} ${r(y)}`).join('')} L${SCENE_WIDTH} ${SCENE_HEIGHT}Z`;
}

/** Tiered conifer profile: [horizontal fraction of half-width, vertical fraction of height]. */
const PINE_PROFILE: readonly (readonly [number, number])[] = [
  [-1, 0],
  [-0.5, 0.22],
  [-0.78, 0.24],
  [-0.38, 0.47],
  [-0.6, 0.49],
  [-0.24, 0.72],
  [-0.36, 0.74],
  [0, 1],
];

/** A rolling line of conifers closed to the bottom edge (union via nonzero fill). */
export function forestPath(
  seed: number,
  options: {
    baseY: number;
    minHeight: number;
    maxHeight: number;
    minGap: number;
    maxGap: number;
    roll?: number;
    from?: number;
    to?: number;
    slenderness?: number;
    /** `bottom` fills down to the frame edge; `base` closes along the ground line (free-standing cluster). */
    close?: 'bottom' | 'base';
  },
): string {
  const { baseY, minHeight, maxHeight, minGap, maxGap, roll = 12, from = -40, to = SCENE_WIDTH + 40, slenderness = 0.2, close = 'bottom' } = options;
  const random = seededRandom(seed);
  const phase = random() * Math.PI * 2;
  const base = (x: number) => baseY + Math.sin(x / 260 + phase) * roll + Math.sin(x / 97 + phase * 2) * roll * 0.35;
  if (close === 'base') {
    let cluster = '';
    for (let x = from; x <= to; x += minGap + random() * (maxGap - minGap)) {
      const height = minHeight + random() * (maxHeight - minHeight);
      const half = height * (slenderness + random() * 0.06);
      const b = base(x);
      const points = [...PINE_PROFILE, ...[...PINE_PROFILE].reverse().slice(1).map(([fx, fy]) => [-fx, fy] as const)];
      cluster += `M${points.map(([fx, fy]) => `${r(x + fx * half)} ${r(b - fy * height)}`).join(' L')} L${r(x + half * 0.12)} ${r(b)} L${r(x + half * 0.12)} ${r(b + 170)} L${r(x - half * 0.12)} ${r(b + 170)} L${r(x - half * 0.12)} ${r(b)}Z`;
    }
    return cluster;
  }
  let d = `M${r(from)} ${SCENE_HEIGHT} L${r(from)} ${r(base(from))}`;
  for (let x = from; x <= to; x += minGap + random() * (maxGap - minGap)) {
    const height = minHeight + random() * (maxHeight - minHeight);
    const half = height * (slenderness + random() * 0.06);
    const b = base(x);
    const left = PINE_PROFILE.map(([fx, fy]) => ` L${r(x + fx * half)} ${r(b - fy * height)}`).join('');
    const right = [...PINE_PROFILE]
      .reverse()
      .slice(1)
      .map(([fx, fy]) => ` L${r(x - fx * half)} ${r(b - fy * height)}`)
      .join('');
    d += left + right;
  }
  return `${d} L${r(to)} ${r(base(to))} L${r(to)} ${SCENE_HEIGHT}Z`;
}

/** Slightly tapered industrial stack with a rim band. */
export function chimneyPath(x: number, top: number, bottom: number, width: number): string {
  const half = width / 2;
  const topHalf = half * 0.78;
  return `M${r(x - half)} ${r(bottom)} L${r(x - topHalf)} ${r(top + 10)} L${r(x - topHalf - 2)} ${r(top + 10)} L${r(x - topHalf - 2)} ${r(top)} L${r(x + topHalf + 2)} ${r(top)} L${r(x + topHalf + 2)} ${r(top + 10)} L${r(x + topHalf)} ${r(top + 10)} L${r(x + half)} ${r(bottom)}Z`;
}

/** Lattice transmission tower outline (legs + cross bracing), drawn as a stroke path. */
export function pylonPath(x: number, top: number, bottom: number, width: number): string {
  const levels = 6;
  const legAt = (y: number) => ((y - top) / (bottom - top)) * (width / 2) + 3;
  let d = `M${r(x - width / 2)} ${r(bottom)} L${r(x - 3)} ${r(top)} L${r(x + 3)} ${r(top)} L${r(x + width / 2)} ${r(bottom)}`;
  for (let i = 0; i < levels; i += 1) {
    const y0 = top + ((bottom - top) * i) / levels;
    const y1 = top + ((bottom - top) * (i + 1)) / levels;
    d += ` M${r(x - legAt(y0))} ${r(y0)} L${r(x + legAt(y1))} ${r(y1)} M${r(x + legAt(y0))} ${r(y0)} L${r(x - legAt(y1))} ${r(y1)}`;
  }
  const arm = top + (bottom - top) * 0.12;
  d += ` M${r(x - width * 0.9)} ${r(arm)} L${r(x + width * 0.9)} ${r(arm)} M${r(x - width * 0.6)} ${r(arm + 22)} L${r(x + width * 0.6)} ${r(arm + 22)}`;
  return d;
}
