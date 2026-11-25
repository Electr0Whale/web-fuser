import { describe, expect, it } from 'vitest';
import {
  cleanStrayPaletteColors,
  detectThinStrokes,
  downscalePixelArtToGrid,
  projectAndThinStroke,
  zhangSuenThin,
} from '../pixelDownscaler';
import { BUILTIN_PALETTES } from '../../data/palettes';

function makeRgbaImage(w: number, h: number, fill: [number, number, number, number]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = fill[0];
    buf[i * 4 + 1] = fill[1];
    buf[i * 4 + 2] = fill[2];
    buf[i * 4 + 3] = fill[3];
  }
  return buf;
}

function setPx(buf: Uint8ClampedArray, w: number, x: number, y: number, rgba: [number, number, number, number]) {
  const o = (y * w + x) * 4;
  buf[o] = rgba[0];
  buf[o + 1] = rgba[1];
  buf[o + 2] = rgba[2];
  buf[o + 3] = rgba[3];
}

describe('pixelDownscaler', () => {
  it('merges stray 1-2px noise colors into core palette', () => {
    const w = 16;
    const h = 16;
    const rgba = makeRgbaImage(w, h, [250, 245, 205, 255]);
    setPx(rgba, w, 5, 5, [249, 244, 204, 255]);

    const { cleaned, paletteRgb } = cleanStrayPaletteColors(rgba, w, h, 3);
    expect(paletteRgb).toHaveLength(1);
    const o = (5 * w + 5) * 4;
    expect([cleaned[o], cleaned[o + 1], cleaned[o + 2]]).toEqual([250, 245, 205]);
  });

  it('preserves 8-connected thin diagonal stroke without breaking during downscale', () => {
    const srcW = 60;
    const srcH = 60;
    const rgba = makeRgbaImage(srcW, srcH, [240, 220, 180, 255]);
    for (let i = 10; i < 50; i++) {
      setPx(rgba, srcW, i, i, [0, 0, 0, 255]);
    }
    const { darkStroke } = detectThinStrokes(rgba, srcW, srcH);
    const proj = projectAndThinStroke(darkStroke, srcW, srcH, 20, 20, 0.25);

    let activeCount = 0;
    for (let i = 0; i < proj.length; i++) if (proj[i]) activeCount++;
    expect(activeCount).toBeGreaterThanOrEqual(10);

    for (let y = 1; y < 19; y++) {
      for (let x = 1; x < 19; x++) {
        if (!proj[y * 20 + x]) continue;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (proj[(y + dy) * 20 + (x + dx)]) neighbors++;
          }
        }
        expect(neighbors).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('zhangSuenThin collapses 2px band to 1px skeleton', () => {
    const w = 12;
    const h = 12;
    const mask = new Uint8Array(w * h);
    for (let x = 2; x <= 9; x++) {
      mask[5 * w + x] = 1;
      mask[6 * w + x] = 1;
    }
    const thinned = zhangSuenThin(mask, w, h);
    let ones = 0;
    for (let i = 0; i < thinned.length; i++) if (thinned[i]) ones++;
    expect(ones).toBeLessThanOrEqual(8);
    expect(ones).toBeGreaterThanOrEqual(6);
  });

  it('downscalePixelArtToGrid maps cleanly to target brand palette and respects maxColors', () => {
    const srcW = 64;
    const srcH = 64;
    const rgba = makeRgbaImage(srcW, srcH, [250, 245, 205, 255]);
    for (let x = 8; x < 56; x++) {
      setPx(rgba, srcW, x, 10, [210, 120, 90, 255]);
      setPx(rgba, srcW, x, 11, [210, 120, 90, 255]);
      setPx(rgba, srcW, x, 24, [0, 0, 0, 255]);
    }

    const res = downscalePixelArtToGrid(rgba, srcW, srcH, {
      targetWidth: 32,
      targetHeight: 32,
      palette: BUILTIN_PALETTES[0].colors,
      maxColors: 4,
    });
    expect(res.width).toBe(32);
    expect(res.height).toBe(32);
    expect(res.grid).toHaveLength(32 * 32);
    const used = new Set(res.grid);
    expect(used.size).toBeLessThanOrEqual(4);
  });
});
