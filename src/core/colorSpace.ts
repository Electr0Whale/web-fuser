export interface BeadColor {
  code: string;
  name: string;
  hex: string;
  rgb: [number, number, number];
  lab: [number, number, number];
  group?: string;
}

export interface BeadBrandPalette {
  id: string;
  label: string;
  source?: string;
  colors: BeadColor[];
}

export type ColorMetric = 'ciede2000' | 'cie76';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
const POW25_7 = Math.pow(25, 7);

export function clampByte(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return Math.round(v);
}

export function rgbToHex(r: number, g: number, b: number): string {
  const rr = clampByte(r).toString(16).padStart(2, '0').toUpperCase();
  const gg = clampByte(g).toString(16).padStart(2, '0').toUpperCase();
  const bb = clampByte(b).toString(16).padStart(2, '0').toUpperCase();
  return `#${rr}${gg}${bb}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [Number.isNaN(r) ? 0 : r, Number.isNaN(g) ? 0 : g, Number.isNaN(b) ? 0 : b];
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [Number.isNaN(r) ? 0 : r, Number.isNaN(g) ? 0 : g, Number.isNaN(b) ? 0 : b];
}

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) / 1.00000;
  const z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);
  return [L, a, bVal];
}

export function deltaE76(lab1: readonly [number, number, number], lab2: readonly [number, number, number]): number {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * CIEDE2000 perceptual color difference (Sharma, Wu, Dalal 2005).
 */
export function deltaE2000(lab1: readonly [number, number, number], lab2: readonly [number, number, number]): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) * 0.5;
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = C1p === 0 ? 0 : Math.atan2(b1, a1p) * RAD2DEG;
  if (h1p < 0) h1p += 360;
  let h2p = C2p === 0 ? 0 : Math.atan2(b2, a2p) * RAD2DEG;
  if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) {
      dhp = diff;
    } else if (diff > 180) {
      dhp = diff - 360;
    } else {
      dhp = diff + 360;
    }
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * 0.5 * DEG2RAD);

  const Lbarp = (L1 + L2) * 0.5;
  const Cbarp = (C1p + C2p) * 0.5;

  let hbarp = 0;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) * 0.5;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) * 0.5;
  } else {
    hbarp = (h1p + h2p - 360) * 0.5;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * DEG2RAD) +
    0.24 * Math.cos(2 * hbarp * DEG2RAD) +
    0.32 * Math.cos((3 * hbarp + 6) * DEG2RAD) -
    0.20 * Math.cos((4 * hbarp - 63) * DEG2RAD);

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));

  const LbarpMinus50Sq = (Lbarp - 50) * (Lbarp - 50);
  const Sl = 1 + (0.015 * LbarpMinus50Sq) / Math.sqrt(20 + LbarpMinus50Sq);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * DEG2RAD) * Rc;

  const termL = dLp / Sl;
  const termC = dCp / Sc;
  const termH = dHp / Sh;

  return Math.sqrt(
    termL * termL + termC * termC + termH * termH + Rt * termC * termH,
  );
}

export function colorDistanceLab(
  lab1: readonly [number, number, number],
  lab2: readonly [number, number, number],
  metric: ColorMetric = 'ciede2000',
): number {
  return metric === 'cie76' ? deltaE76(lab1, lab2) : deltaE2000(lab1, lab2);
}

export function findNearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  palette: readonly BeadColor[],
  metric: ColorMetric = 'ciede2000',
  allowedIndices?: readonly number[],
): number {
  const lab = srgbToLab(r, g, b);
  let bestIdx = allowedIndices ? allowedIndices[0] : 0;
  let bestDist = Infinity;

  if (allowedIndices) {
    for (let i = 0; i < allowedIndices.length; i++) {
      const idx = allowedIndices[i];
      const d = colorDistanceLab(lab, palette[idx].lab, metric);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    }
  } else {
    for (let i = 0; i < palette.length; i++) {
      const d = colorDistanceLab(lab, palette[i].lab, metric);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}

/**
 * Fast RGB-to-palette matcher with an exact 24-bit RGB memoization cache.
 */
export class PaletteMatcher {
  private readonly palette: readonly BeadColor[];
  private readonly metric: ColorMetric;
  private readonly allowedIndices?: readonly number[];
  private readonly cache = new Map<number, number>();

  constructor(
    palette: readonly BeadColor[],
    metric: ColorMetric = 'ciede2000',
    allowedIndices?: readonly number[],
  ) {
    this.palette = palette;
    this.metric = metric;
    this.allowedIndices = allowedIndices;
  }

  match(r: number, g: number, b: number): number {
    const key = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const idx = findNearestPaletteIndex(r, g, b, this.palette, this.metric, this.allowedIndices);
    this.cache.set(key, idx);
    return idx;
  }
}

/**
 * Select up to `maxColors` representative colors from `palette` using weighted
 * marginal distortion reduction over the image's initial matched color distribution.
 * Preserves both dominant fills and small high-contrast accents (e.g. eyes/skin).
 */
export function selectTopNPaletteIndices(
  matchedGrid: Int16Array,
  palette: readonly BeadColor[],
  maxColors: number,
  metric: ColorMetric = 'ciede2000',
): number[] {
  if (maxColors <= 0 || maxColors >= palette.length) {
    return palette.map((_, idx) => idx);
  }

  const counts = new Int32Array(palette.length);
  for (let i = 0; i < matchedGrid.length; i++) {
    const idx = matchedGrid[i];
    if (idx >= 0 && idx < palette.length) {
      counts[idx]++;
    }
  }

  const usedIndices: number[] = [];
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0) usedIndices.push(i);
  }

  if (usedIndices.length <= maxColors) {
    return usedIndices;
  }

  // Sort by frequency descending
  usedIndices.sort((a, b) => counts[b] - counts[a]);

  // Sub-linear importance weight so tiny high-contrast details (eyes/lines) keep representation
  const weights = new Float64Array(usedIndices.length);
  for (let i = 0; i < usedIndices.length; i++) {
    weights[i] = Math.pow(counts[usedIndices[i]], 0.65);
  }

  const n = usedIndices.length;
  const distSq = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = colorDistanceLab(palette[usedIndices[i]].lab, palette[usedIndices[j]].lab, metric);
      const d2 = d * d;
      distSq[i * n + j] = d2;
      distSq[j * n + i] = d2;
    }
  }

  const selectedLocal: number[] = [0]; // Always keep the single most frequent color
  const isSelected = new Uint8Array(n);
  isSelected[0] = 1;
  const minDistSq = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    minDistSq[i] = distSq[i * n];
  }

  while (selectedLocal.length < maxColors) {
    let bestCand = -1;
    let bestGain = -1;
    for (let c = 0; c < n; c++) {
      if (isSelected[c]) continue;
      let gain = 0;
      const rowOffset = c * n;
      for (let i = 0; i < n; i++) {
        const d2 = distSq[rowOffset + i];
        if (d2 < minDistSq[i]) {
          gain += weights[i] * (minDistSq[i] - d2);
        }
      }
      if (gain > bestGain) {
        bestGain = gain;
        bestCand = c;
      }
    }
    if (bestCand === -1) break;
    isSelected[bestCand] = 1;
    selectedLocal.push(bestCand);
    const rowOffset = bestCand * n;
    for (let i = 0; i < n; i++) {
      const d2 = distSq[rowOffset + i];
      if (d2 < minDistSq[i]) {
        minDistSq[i] = d2;
      }
    }
  }

  return selectedLocal.map((localIdx) => usedIndices[localIdx]);
}

/**
 * Remap an already-matched grid onto a restricted subset of palette indices.
 */
export function remapGridToSubset(
  grid: Int16Array,
  palette: readonly BeadColor[],
  allowedIndices: readonly number[],
  metric: ColorMetric = 'ciede2000',
): Int16Array {
  const allowedSet = new Set(allowedIndices);
  const remapTable = new Int16Array(palette.length).fill(-1);
  for (let idx = 0; idx < palette.length; idx++) {
    if (allowedSet.has(idx)) {
      remapTable[idx] = idx;
    } else {
      let best = allowedIndices[0];
      let bestDist = Infinity;
      for (let j = 0; j < allowedIndices.length; j++) {
        const cand = allowedIndices[j];
        const d = colorDistanceLab(palette[idx].lab, palette[cand].lab, metric);
        if (d < bestDist) {
          bestDist = d;
          best = cand;
        }
      }
      remapTable[idx] = best;
    }
  }

  const out = new Int16Array(grid.length);
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    out[i] = v < 0 ? -1 : remapTable[v];
  }
  return out;
}

export function getContrastTextColor(rgb: readonly [number, number, number]): '#1F1F1F' | '#FFFFFF' {
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return lum > 0.58 ? '#1F1F1F' : '#FFFFFF';
}
