import { describe, expect, it } from 'vitest';
import { PaletteMatcher } from '../colorSpace';
import { DITHER_MODE_OPTIONS, quantizeWithDithering, type DitherMode } from '../dithering';
import { downscalePhotoToGrid, type StandardAlgorithm } from '../photoDownscaler';
import { BUILTIN_PALETTES } from '../../data/palettes';

function makeGradientRgba(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      // Leave top-left 4x4 transparent to verify alpha preservation
      if (x < 4 && y < 4) {
        buf[o + 3] = 0;
        continue;
      }
      buf[o] = Math.round((x / Math.max(1, w - 1)) * 255);
      buf[o + 1] = Math.round((y / Math.max(1, h - 1)) * 255);
      buf[o + 2] = 128;
      buf[o + 3] = 255;
    }
  }
  return buf;
}

describe('dithering & multi-algorithm downscaling', () => {
  const palette = BUILTIN_PALETTES[0].colors;

  it('quantizeWithDithering supports all 6 dithering modes and preserves transparent slots', () => {
    const w = 16;
    const h = 16;
    const bufR = new Float64Array(w * h);
    const bufG = new Float64Array(w * h);
    const bufB = new Float64Array(w * h);
    const isOpaque = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x === 0 && y === 0) continue;
        isOpaque[i] = 1;
        bufR[i] = (x / 15) * 255;
        bufG[i] = (y / 15) * 255;
        bufB[i] = 140;
      }
    }

    const matcher = new PaletteMatcher(palette, 'ciede2000');
    const modes: DitherMode[] = DITHER_MODE_OPTIONS.map((o) => o.value);
    expect(modes).toEqual([
      'none',
      'floyd-steinberg',
      'atkinson',
      'sierra-lite',
      'bayer-4x4',
      'bayer-8x8',
    ]);

    for (const mode of modes) {
      const grid = quantizeWithDithering(bufR, bufG, bufB, isOpaque, w, h, palette, matcher, mode, 0.85);
      expect(grid).toHaveLength(w * h);
      expect(grid[0]).toBe(-1);
      for (let i = 1; i < grid.length; i++) {
        expect(grid[i]).toBeGreaterThanOrEqual(0);
        expect(grid[i]).toBeLessThan(palette.length);
      }
    }
  });

  it('downscalePhotoToGrid runs nearest, dominant, box-average, and lanczos cleanly', () => {
    const srcW = 64;
    const srcH = 48;
    const rgba = makeGradientRgba(srcW, srcH);
    const algos: StandardAlgorithm[] = ['nearest', 'dominant', 'box-average', 'lanczos'];

    for (const algorithm of algos) {
      const res = downscalePhotoToGrid(rgba, srcW, srcH, {
        targetWidth: 24,
        targetHeight: 18,
        palette,
        algorithm,
        maxColors: 12,
        ditherMode: 'bayer-4x4',
        ditherStrength: 0.7,
      });

      expect(res.width).toBe(24);
      expect(res.height).toBe(18);
      expect(res.grid).toHaveLength(24 * 18);
      // Top-left cell overlaps the 4x4 transparent corner
      expect(res.grid[0]).toBe(-1);

      const used = new Set<number>();
      for (const v of res.grid) {
        if (v >= 0) used.add(v);
      }
      expect(used.size).toBeGreaterThan(1);
      expect(used.size).toBeLessThanOrEqual(12);
    }
  });
});
