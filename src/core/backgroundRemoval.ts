import { type BeadColor, deltaE76, srgbToLab } from './colorSpace';

/**
 * Pure local edge/corner flood-fill background removal on a bead grid.
 * Seeds from outer border pixels (preferring the dominant edge color or all edge cells
 * within perceptual tolerance) and clears connected background cells to -1.
 */
export function removeBackgroundFromGrid(
  grid: Int16Array,
  width: number,
  height: number,
  palette: readonly BeadColor[],
  tolerance = 14,
): { nextGrid: Int16Array; removedCount: number } {
  const total = width * height;
  if (total === 0) return { nextGrid: new Int16Array(grid), removedCount: 0 };

  // Collect all border cells that are non-empty and find the dominant border color
  const borderCounts = new Map<number, number>();
  const borderCoords: number[] = [];

  const consider = (x: number, y: number) => {
    const idx = y * width + x;
    const val = grid[idx];
    if (val >= 0 && val < palette.length) {
      borderCoords.push(idx);
      borderCounts.set(val, (borderCounts.get(val) ?? 0) + 1);
    }
  };

  for (let x = 0; x < width; x++) {
    consider(x, 0);
    if (height > 1) consider(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    consider(0, y);
    if (width > 1) consider(width - 1, y);
  }

  if (borderCounts.size === 0) {
    return { nextGrid: new Int16Array(grid), removedCount: 0 };
  }

  let dominantIdx = -1;
  let dominantCount = -1;
  for (const [colorIdx, cnt] of borderCounts.entries()) {
    if (cnt > dominantCount) {
      dominantCount = cnt;
      dominantIdx = colorIdx;
    }
  }

  const refLab = palette[dominantIdx].lab;
  const nextGrid = new Int16Array(grid);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < borderCoords.length; i++) {
    const idx = borderCoords[i];
    if (visited[idx]) continue;
    const c = nextGrid[idx];
    if (c < 0) continue;
    if (deltaE76(palette[c].lab, refLab) <= tolerance) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  }

  let removedCount = 0;
  while (head < tail) {
    const idx = queue[head++];
    if (nextGrid[idx] !== -1) {
      nextGrid[idx] = -1;
      removedCount++;
    }
    const x = idx % width;
    const y = (idx - x) / width;

    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x + 1 < width ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y + 1 < height ? idx + width : -1,
    ];
    for (let k = 0; k < 4; k++) {
      const nIdx = neighbors[k];
      if (nIdx < 0 || visited[nIdx]) continue;
      const nc = nextGrid[nIdx];
      if (nc < 0 || nc >= palette.length) continue;
      if (deltaE76(palette[nc].lab, refLab) <= tolerance) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
  }

  return { nextGrid, removedCount };
}

/**
 * Pure local edge flood-fill background removal directly on source RGBA buffer.
 * Sets matching outer connected background pixels alpha to 0.
 */
export function removeBackgroundFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 14,
): { nextRgba: Uint8ClampedArray; removedCount: number } {
  const total = width * height;
  const nextRgba = new Uint8ClampedArray(rgba);
  if (total === 0) return { nextRgba, removedCount: 0 };

  // Sample 4 corners that are opaque to determine reference background Lab
  const corners = [
    0,
    width - 1,
    (height - 1) * width,
    height * width - 1,
  ];
  const samples: Array<[number, number, number]> = [];
  for (const idx of corners) {
    const o = idx * 4;
    if (nextRgba[o + 3] >= 128) {
      samples.push(srgbToLab(nextRgba[o], nextRgba[o + 1], nextRgba[o + 2]));
    }
  }
  if (samples.length === 0) return { nextRgba, removedCount: 0 };

  const refLab: [number, number, number] = [
    samples.reduce((s, x) => s + x[0], 0) / samples.length,
    samples.reduce((s, x) => s + x[1], 0) / samples.length,
    samples.reduce((s, x) => s + x[2], 0) / samples.length,
  ];

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const trySeed = (idx: number) => {
    if (visited[idx]) return;
    const o = idx * 4;
    if (nextRgba[o + 3] < 128) return;
    const lab = srgbToLab(nextRgba[o], nextRgba[o + 1], nextRgba[o + 2]);
    if (deltaE76(lab, refLab) <= tolerance) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < width; x++) {
    trySeed(x);
    if (height > 1) trySeed((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    trySeed(y * width);
    if (width > 1) trySeed(y * width + (width - 1));
  }

  let removedCount = 0;
  while (head < tail) {
    const idx = queue[head++];
    const o = idx * 4;
    if (nextRgba[o + 3] !== 0) {
      nextRgba[o + 3] = 0;
      removedCount++;
    }
    const x = idx % width;
    const y = (idx - x) / width;

    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x + 1 < width ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y + 1 < height ? idx + width : -1,
    ];
    for (let k = 0; k < 4; k++) {
      const nIdx = neighbors[k];
      if (nIdx < 0 || visited[nIdx]) continue;
      const no = nIdx * 4;
      if (nextRgba[no + 3] < 128) continue;
      const lab = srgbToLab(nextRgba[no], nextRgba[no + 1], nextRgba[no + 2]);
      if (deltaE76(lab, refLab) <= tolerance) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
  }

  return { nextRgba, removedCount };
}
