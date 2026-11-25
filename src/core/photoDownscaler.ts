import {
  type BeadColor,
  type ColorMetric,
  PaletteMatcher,
  clampByte,
  selectTopNPaletteIndices,
} from './colorSpace';

export interface PhotoDownscaleOptions {
  targetWidth: number;
  targetHeight: number;
  palette: readonly BeadColor[];
  maxColors?: number; // 0 = unlimited
  metric?: ColorMetric;
  brightness?: number; // 0.50 .. 1.50, default 1.0
  contrast?: number;   // 0.50 .. 1.50, default 1.0
  saturation?: number; // 0.00 .. 2.00, default 1.0
  dither?: boolean;    // Floyd-Steinberg dithering
}

export interface PhotoDownscaleResult {
  grid: Int16Array;
  width: number;
  height: number;
}

function adjustPixelColor(
  r: number,
  g: number,
  b: number,
  brightness: number,
  contrast: number,
  saturation: number,
): [number, number, number] {
  // Brightness multiplier
  let rr = r * brightness;
  let gg = g * brightness;
  let bb = b * brightness;

  // Contrast centered around 128
  rr = (rr - 128) * contrast + 128;
  gg = (gg - 128) * contrast + 128;
  bb = (bb - 128) * contrast + 128;

  // Saturation around perceptual luma
  if (saturation !== 1) {
    const luma = 0.299 * rr + 0.587 * gg + 0.114 * bb;
    rr = luma + (rr - luma) * saturation;
    gg = luma + (gg - luma) * saturation;
    bb = luma + (bb - luma) * saturation;
  }

  return [clampByte(rr), clampByte(gg), clampByte(bb)];
}

/**
 * Box/area-average downsampler with tone adjustments, CIELAB matching,
 * smart Top-N color reduction, and optional Floyd-Steinberg dithering.
 */
export function downscalePhotoToGrid(
  srcRgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  options: PhotoDownscaleOptions,
): PhotoDownscaleResult {
  const {
    targetWidth,
    targetHeight,
    palette,
    maxColors = 0,
    metric = 'ciede2000',
    brightness = 1.0,
    contrast = 1.0,
    saturation = 1.0,
    dither = false,
  } = options;

  const totalTarget = targetWidth * targetHeight;
  const bufR = new Float64Array(totalTarget);
  const bufG = new Float64Array(totalTarget);
  const bufB = new Float64Array(totalTarget);
  const isOpaque = new Uint8Array(totalTarget);

  const scaleY = srcHeight / targetHeight;
  const scaleX = srcWidth / targetWidth;

  for (let ty = 0; ty < targetHeight; ty++) {
    const sy0 = ty * scaleY;
    const sy1 = (ty + 1) * scaleY;
    const iy0 = Math.floor(sy0);
    const iy1 = Math.min(Math.ceil(sy1), srcHeight);

    for (let tx = 0; tx < targetWidth; tx++) {
      const sx0 = tx * scaleX;
      const sx1 = (tx + 1) * scaleX;
      const ix0 = Math.floor(sx0);
      const ix1 = Math.min(Math.ceil(sx1), srcWidth);

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumAlpha = 0;
      let totalArea = 0;

      for (let sy = iy0; sy < iy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = ix0; sx < ix1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const area = wx * wy;
          const o = (sy * srcWidth + sx) * 4;
          const a = srcRgba[o + 3] / 255;
          totalArea += area;
          sumAlpha += area * a;
          sumR += area * a * srcRgba[o];
          sumG += area * a * srcRgba[o + 1];
          sumB += area * a * srcRgba[o + 2];
        }
      }

      const idx = ty * targetWidth + tx;
      if (totalArea <= 0 || sumAlpha / totalArea < 0.5) {
        isOpaque[idx] = 0;
      } else {
        isOpaque[idx] = 1;
        const [ar, ag, ab] = adjustPixelColor(
          sumR / sumAlpha,
          sumG / sumAlpha,
          sumB / sumAlpha,
          brightness,
          contrast,
          saturation,
        );
        bufR[idx] = ar;
        bufG[idx] = ag;
        bufB[idx] = ab;
      }
    }
  }

  const fullMatcher = new PaletteMatcher(palette, metric);
  let activeIndices: number[] | undefined;

  // Initial pass to determine Top-N subset if maxColors is constrained
  const initialGrid = new Int16Array(totalTarget).fill(-1);
  for (let i = 0; i < totalTarget; i++) {
    if (!isOpaque[i]) continue;
    initialGrid[i] = fullMatcher.match(clampByte(bufR[i]), clampByte(bufG[i]), clampByte(bufB[i]));
  }

  if (maxColors > 0) {
    const subset = selectTopNPaletteIndices(initialGrid, palette, maxColors, metric);
    if (subset.length < palette.length) {
      activeIndices = subset;
    }
  }

  const finalMatcher = activeIndices
    ? new PaletteMatcher(palette, metric, activeIndices)
    : fullMatcher;

  if (!dither) {
    if (!activeIndices) {
      return { grid: initialGrid, width: targetWidth, height: targetHeight };
    }
    const grid = new Int16Array(totalTarget).fill(-1);
    for (let i = 0; i < totalTarget; i++) {
      if (!isOpaque[i]) continue;
      grid[i] = finalMatcher.match(clampByte(bufR[i]), clampByte(bufG[i]), clampByte(bufB[i]));
    }
    return { grid, width: targetWidth, height: targetHeight };
  }

  // Floyd-Steinberg error diffusion dithering
  const grid = new Int16Array(totalTarget).fill(-1);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const idx = y * targetWidth + x;
      if (!isOpaque[idx]) continue;

      const oldR = clampByte(bufR[idx]);
      const oldG = clampByte(bufG[idx]);
      const oldB = clampByte(bufB[idx]);
      const chosenIdx = finalMatcher.match(oldR, oldG, oldB);
      grid[idx] = chosenIdx;

      const [newR, newG, newB] = palette[chosenIdx].rgb;
      const errR = bufR[idx] - newR;
      const errG = bufG[idx] - newG;
      const errB = bufB[idx] - newB;

      const diffuse = (nx: number, ny: number, factor: number) => {
        if (nx < 0 || nx >= targetWidth || ny < 0 || ny >= targetHeight) return;
        const nIdx = ny * targetWidth + nx;
        if (!isOpaque[nIdx]) return;
        bufR[nIdx] += errR * factor;
        bufG[nIdx] += errG * factor;
        bufB[nIdx] += errB * factor;
      };

      diffuse(x + 1, y, 7 / 16);
      diffuse(x - 1, y + 1, 3 / 16);
      diffuse(x, y + 1, 5 / 16);
      diffuse(x + 1, y + 1, 1 / 16);
    }
  }

  return { grid, width: targetWidth, height: targetHeight };
}
