import { type BeadColor, type ColorMetric, colorDistanceLab } from './colorSpace';

export interface GridPoint {
  x: number;
  y: number;
}

export interface BomEntry {
  paletteIndex: number;
  color: BeadColor;
  count: number;
  ratio: number;
}

export interface BomSummary {
  totalCells: number;
  filledCount: number;
  emptyCount: number;
  entries: BomEntry[];
}

export function getSymmetryPoints(
  x: number,
  y: number,
  width: number,
  height: number,
  mirrorX: boolean,
  mirrorY: boolean,
): GridPoint[] {
  const candidates: GridPoint[] = [{ x, y }];
  if (mirrorX) candidates.push({ x: width - 1 - x, y });
  if (mirrorY) candidates.push({ x, y: height - 1 - y });
  if (mirrorX && mirrorY) candidates.push({ x: width - 1 - x, y: height - 1 - y });

  const seen = new Set<number>();
  const unique: GridPoint[] = [];
  for (const pt of candidates) {
    if (pt.x < 0 || pt.x >= width || pt.y < 0 || pt.y >= height) continue;
    const key = pt.y * width + pt.x;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(pt);
    }
  }
  return unique;
}

export function bresenhamLine(x0: number, y0: number, x1: number, y1: number): GridPoint[] {
  const points: GridPoint[] = [];
  let cx = x0;
  let cy = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    points.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
  return points;
}

export function rectanglePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled = false,
): GridPoint[] {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const points: GridPoint[] = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (filled || x === minX || x === maxX || y === minY || y === maxY) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

/**
 * BFS flood-fill on a bead grid starting at (startX, startY), optionally mirrored.
 */
export function floodFillGrid(
  grid: Int16Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  replacementColorIdx: number,
  mirrorX = false,
  mirrorY = false,
): { nextGrid: Int16Array; changedCount: number } {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return { nextGrid: new Int16Array(grid), changedCount: 0 };
  }

  const nextGrid = new Int16Array(grid);
  const seeds = getSymmetryPoints(startX, startY, width, height, mirrorX, mirrorY);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let totalChanged = 0;

  for (const seed of seeds) {
    const startIdx = seed.y * width + seed.x;
    const targetVal = nextGrid[startIdx];
    if (targetVal === replacementColorIdx || visited[startIdx]) continue;

    let head = 0;
    let tail = 0;
    visited[startIdx] = 1;
    queue[tail++] = startIdx;

    while (head < tail) {
      const idx = queue[head++];
      if (nextGrid[idx] !== replacementColorIdx) {
        nextGrid[idx] = replacementColorIdx;
        totalChanged++;
      }

      const x = idx % width;
      const y = (idx - x) / width;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x + 1 < width ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y + 1 < height ? idx + width : -1,
      ];
      for (let i = 0; i < 4; i++) {
        const nIdx = neighbors[i];
        if (nIdx >= 0 && !visited[nIdx] && nextGrid[nIdx] === targetVal) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }
  }

  return { nextGrid, changedCount: totalChanged };
}

/**
 * Global replacement of all cells matching `fromColorIdx` with `toColorIdx`.
 */
export function replaceColorInGrid(
  grid: Int16Array,
  fromColorIdx: number,
  toColorIdx: number,
): { nextGrid: Int16Array; changedCount: number } {
  const nextGrid = new Int16Array(grid);
  if (fromColorIdx === toColorIdx) return { nextGrid, changedCount: 0 };
  let changedCount = 0;
  for (let i = 0; i < nextGrid.length; i++) {
    if (nextGrid[i] === fromColorIdx) {
      nextGrid[i] = toColorIdx;
      changedCount++;
    }
  }
  return { nextGrid, changedCount };
}

/**
 * Merge rare colors (count < thresholdCount) into the perceptually closest dominant color
 * already used on the canvas (count >= thresholdCount), reducing bead shopping count.
 */
export function mergeRareColorsInGrid(
  grid: Int16Array,
  palette: readonly BeadColor[],
  thresholdCount = 5,
  metric: ColorMetric = 'ciede2000',
): { nextGrid: Int16Array; changedCells: number; mergedColorCount: number } {
  const counts = new Int32Array(palette.length);
  for (let i = 0; i < grid.length; i++) {
    const idx = grid[i];
    if (idx >= 0 && idx < palette.length) counts[idx]++;
  }

  const dominant: number[] = [];
  const rare: number[] = [];
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] === 0) continue;
    if (counts[i] >= thresholdCount) dominant.push(i);
    else rare.push(i);
  }

  if (rare.length === 0 || dominant.length === 0) {
    return { nextGrid: new Int16Array(grid), changedCells: 0, mergedColorCount: 0 };
  }

  const remap = new Int16Array(palette.length).fill(-1);
  for (const rIdx of rare) {
    let bestDom = dominant[0];
    let bestDist = Infinity;
    for (const dIdx of dominant) {
      const dist = colorDistanceLab(palette[rIdx].lab, palette[dIdx].lab, metric);
      if (dist < bestDist) {
        bestDist = dist;
        bestDom = dIdx;
      }
    }
    remap[rIdx] = bestDom;
  }

  const nextGrid = new Int16Array(grid);
  let changedCells = 0;
  for (let i = 0; i < nextGrid.length; i++) {
    const v = nextGrid[i];
    if (v >= 0 && remap[v] >= 0) {
      nextGrid[i] = remap[v];
      changedCells++;
    }
  }

  return { nextGrid, changedCells, mergedColorCount: rare.length };
}

export function computeBomStats(
  grid: Int16Array,
  palette: readonly BeadColor[],
): BomSummary {
  const counts = new Int32Array(palette.length);
  let filledCount = 0;

  for (let i = 0; i < grid.length; i++) {
    const idx = grid[i];
    if (idx >= 0 && idx < palette.length) {
      counts[idx]++;
      filledCount++;
    }
  }

  const entries: BomEntry[] = [];
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0) {
      entries.push({
        paletteIndex: i,
        color: palette[i],
        count: counts[i],
        ratio: filledCount > 0 ? counts[i] / filledCount : 0,
      });
    }
  }

  entries.sort((a, b) => b.count - a.count || a.color.code.localeCompare(b.color.code));

  return {
    totalCells: grid.length,
    filledCount,
    emptyCount: grid.length - filledCount,
    entries,
  };
}

export function resizeGridPreserveContent(
  oldGrid: Int16Array,
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
): Int16Array {
  const next = new Int16Array(newW * newH).fill(-1);
  const copyW = Math.min(oldW, newW);
  const copyH = Math.min(oldH, newH);
  for (let y = 0; y < copyH; y++) {
    for (let x = 0; x < copyW; x++) {
      next[y * newW + x] = oldGrid[y * oldW + x];
    }
  }
  return next;
}

export function columnIndexToLabel(col: number, format: 'number' | 'alpha-col'): string {
  if (format === 'number') return String(col + 1);
  let n = col;
  let label = '';
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}
