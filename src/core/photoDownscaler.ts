import {
  type BeadColor,
  type ColorMetric,
  PaletteMatcher,
  clampByte,
  selectTopNPaletteIndices,
} from './colorSpace';
import { type DitherMode, quantizeWithDithering } from './dithering';

export type StandardAlgorithm = 'nearest' | 'dominant' | 'box-average' | 'lanczos';

export interface PhotoDownscaleOptions {
  targetWidth: number;
  targetHeight: number;
  palette: readonly BeadColor[];
  algorithm?: StandardAlgorithm;
  maxColors?: number; // 0 = unlimited
  metric?: ColorMetric;
  brightness?: number; // 0.50 .. 1.50, default 1.0
  contrast?: number;   // 0.50 .. 1.50, default 1.0
  saturation?: number; // 0.00 .. 2.00, default 1.0
  dither?: boolean;    // legacy fallback
  ditherMode?: DitherMode;
  ditherStrength?: number; // 0.0 .. 1.0, default 0.85
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
  let rr = r * brightness;
  let gg = g * brightness;
  let bb = b * brightness;

  rr = (rr - 128) * contrast + 128;
  gg = (gg - 128) * contrast + 128;
  bb = (bb - 128) * contrast + 128;

  if (saturation !== 1) {
    const luma = 0.299 * rr + 0.587 * gg + 0.114 * bb;
    rr = luma + (rr - luma) * saturation;
    gg = luma + (gg - luma) * saturation;
    bb = luma + (bb - luma) * saturation;
  }

  return [clampByte(rr), clampByte(gg), clampByte(bb)];
}

function lanczos3Weight(x: number): number {
  const ax = Math.abs(x);
  if (ax === 0) return 1;
  if (ax >= 3) return 0;
  const px = Math.PI * ax;
  const px3 = px / 3;
  return (Math.sin(px) / px) * (Math.sin(px3) / px3);
}

interface ResampledBuffers {
  bufR: Float64Array;
  bufG: Float64Array;
  bufB: Float64Array;
  isOpaque: Uint8Array;
}

function resampleNearest(
  srcRgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
): ResampledBuffers {
  const total = targetWidth * targetHeight;
  const bufR = new Float64Array(total);
  const bufG = new Float64Array(total);
  const bufB = new Float64Array(total);
  const isOpaque = new Uint8Array(total);

  const scaleX = srcWidth / targetWidth;
  const scaleY = srcHeight / targetHeight;

  for (let ty = 0; ty < targetHeight; ty++) {
    const sy = Math.min(srcHeight - 1, Math.floor((ty + 0.5) * scaleY));
    for (let tx = 0; tx < targetWidth; tx++) {
      const sx = Math.min(srcWidth - 1, Math.floor((tx + 0.5) * scaleX));
      const o = (sy * srcWidth + sx) * 4;
      const idx = ty * targetWidth + tx;
      if (srcRgba[o + 3] < 128) continue;
      isOpaque[idx] = 1;
      bufR[idx] = srcRgba[o];
      bufG[idx] = srcRgba[o + 1];
      bufB[idx] = srcRgba[o + 2];
    }
  }
  return { bufR, bufG, bufB, isOpaque };
}

function resampleBoxAverage(
  srcRgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
): ResampledBuffers {
  const total = targetWidth * targetHeight;
  const bufR = new Float64Array(total);
  const bufG = new Float64Array(total);
  const bufB = new Float64Array(total);
  const isOpaque = new Uint8Array(total);

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
      if (totalArea > 0 && sumAlpha / totalArea >= 0.5) {
        isOpaque[idx] = 1;
        bufR[idx] = sumR / sumAlpha;
        bufG[idx] = sumG / sumAlpha;
        bufB[idx] = sumB / sumAlpha;
      }
    }
  }
  return { bufR, bufG, bufB, isOpaque };
}

function resampleDominant(
  srcRgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
): ResampledBuffers {
  const total = targetWidth * targetHeight;
  const bufR = new Float64Array(total);
  const bufG = new Float64Array(total);
  const bufB = new Float64Array(total);
  const isOpaque = new Uint8Array(total);

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

      const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
      let opaqueArea = 0;
      let transparentArea = 0;

      for (let sy = iy0; sy < iy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = ix0; sx < ix1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const area = wx * wy;
          const o = (sy * srcWidth + sx) * 4;
          if (srcRgba[o + 3] < 128) {
            transparentArea += area;
            continue;
          }
          opaqueArea += area;
          // Quantize into 5-bit per channel histogram buckets so minor compression noise merges
          const key =
            ((srcRgba[o] >> 3) << 10) | ((srcRgba[o + 1] >> 3) << 5) | (srcRgba[o + 2] >> 3);
          const entry = buckets.get(key);
          if (entry) {
            entry.w += area;
            entry.r += area * srcRgba[o];
            entry.g += area * srcRgba[o + 1];
            entry.b += area * srcRgba[o + 2];
          } else {
            buckets.set(key, {
              w: area,
              r: area * srcRgba[o],
              g: area * srcRgba[o + 1],
              b: area * srcRgba[o + 2],
            });
          }
        }
      }

      const idx = ty * targetWidth + tx;
      if (opaqueArea === 0 || transparentArea > opaqueArea) continue;

      let best: { w: number; r: number; g: number; b: number } | null = null;
      for (const entry of buckets.values()) {
        if (!best || entry.w > best.w) best = entry;
      }
      if (best) {
        isOpaque[idx] = 1;
        bufR[idx] = best.r / best.w;
        bufG[idx] = best.g / best.w;
        bufB[idx] = best.b / best.w;
      }
    }
  }
  return { bufR, bufG, bufB, isOpaque };
}

function resampleLanczos3(
  srcRgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
): ResampledBuffers {
  const scaleX = srcWidth / targetWidth;
  const scaleY = srcHeight / targetHeight;
  const supportX = Math.max(3, 3 * scaleX);
  const supportY = Math.max(3, 3 * scaleY);
  const filterScaleX = scaleX > 1 ? 1 / scaleX : 1;
  const filterScaleY = scaleY > 1 ? 1 / scaleY : 1;

  // Horizontal pass: srcHeight x targetWidth (premultiplied by alpha)
  const tempLen = srcHeight * targetWidth;
  const tmpR = new Float64Array(tempLen);
  const tmpG = new Float64Array(tempLen);
  const tmpB = new Float64Array(tempLen);
  const tmpA = new Float64Array(tempLen);

  for (let tx = 0; tx < targetWidth; tx++) {
    const cx = (tx + 0.5) * scaleX - 0.5;
    const xStart = Math.max(0, Math.floor(cx - supportX));
    const xEnd = Math.min(srcWidth - 1, Math.ceil(cx + supportX));
    const tapCount = xEnd - xStart + 1;
    const weights = new Float64Array(tapCount);
    let wSum = 0;
    for (let k = 0; k < tapCount; k++) {
      const w = lanczos3Weight((xStart + k - cx) * filterScaleX);
      weights[k] = w;
      wSum += w;
    }
    if (wSum !== 0) {
      for (let k = 0; k < tapCount; k++) weights[k] /= wSum;
    }

    for (let sy = 0; sy < srcHeight; sy++) {
      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;
      for (let k = 0; k < tapCount; k++) {
        const sx = xStart + k;
        const w = weights[k];
        if (w === 0) continue;
        const o = (sy * srcWidth + sx) * 4;
        const a = srcRgba[o + 3] / 255;
        aAcc += w * a;
        rAcc += w * a * srcRgba[o];
        gAcc += w * a * srcRgba[o + 1];
        bAcc += w * a * srcRgba[o + 2];
      }
      const tidx = sy * targetWidth + tx;
      tmpA[tidx] = Math.max(0, Math.min(1, aAcc));
      tmpR[tidx] = rAcc;
      tmpG[tidx] = gAcc;
      tmpB[tidx] = bAcc;
    }
  }

  // Vertical pass: targetHeight x targetWidth
  const total = targetWidth * targetHeight;
  const bufR = new Float64Array(total);
  const bufG = new Float64Array(total);
  const bufB = new Float64Array(total);
  const isOpaque = new Uint8Array(total);

  for (let ty = 0; ty < targetHeight; ty++) {
    const cy = (ty + 0.5) * scaleY - 0.5;
    const yStart = Math.max(0, Math.floor(cy - supportY));
    const yEnd = Math.min(srcHeight - 1, Math.ceil(cy + supportY));
    const tapCount = yEnd - yStart + 1;
    const weights = new Float64Array(tapCount);
    let wSum = 0;
    for (let k = 0; k < tapCount; k++) {
      const w = lanczos3Weight((yStart + k - cy) * filterScaleY);
      weights[k] = w;
      wSum += w;
    }
    if (wSum !== 0) {
      for (let k = 0; k < tapCount; k++) weights[k] /= wSum;
    }

    for (let tx = 0; tx < targetWidth; tx++) {
      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;
      for (let k = 0; k < tapCount; k++) {
        const sy = yStart + k;
        const w = weights[k];
        if (w === 0) continue;
        const tidx = sy * targetWidth + tx;
        aAcc += w * tmpA[tidx];
        rAcc += w * tmpR[tidx];
        gAcc += w * tmpG[tidx];
        bAcc += w * tmpB[tidx];
      }

      const outIdx = ty * targetWidth + tx;
      if (aAcc >= 0.5) {
        isOpaque[outIdx] = 1;
        bufR[outIdx] = clampByte(rAcc / aAcc);
        bufG[outIdx] = clampByte(gAcc / aAcc);
        bufB[outIdx] = clampByte(bAcc / aAcc);
      }
    }
  }

  return { bufR, bufG, bufB, isOpaque };
}

/**
 * Standard multi-algorithm image-to-bead downsampler supporting Nearest, Dominant,
 * Box-Average, and Lanczos-3 resampling, tone adjustments, Top-N color reduction,
 * and configurable dithering (Floyd-Steinberg, Atkinson, Sierra Lite, Bayer 4x4/8x8).
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
    algorithm = 'box-average',
    maxColors = 0,
    metric = 'ciede2000',
    brightness = 1.0,
    contrast = 1.0,
    saturation = 1.0,
    dither = false,
    ditherMode,
    ditherStrength = 0.85,
  } = options;

  const resolvedDitherMode: DitherMode = ditherMode ?? (dither ? 'floyd-steinberg' : 'none');

  let resampled: ResampledBuffers;
  switch (algorithm) {
    case 'nearest':
      resampled = resampleNearest(srcRgba, srcWidth, srcHeight, targetWidth, targetHeight);
      break;
    case 'dominant':
      resampled = resampleDominant(srcRgba, srcWidth, srcHeight, targetWidth, targetHeight);
      break;
    case 'lanczos':
      resampled = resampleLanczos3(srcRgba, srcWidth, srcHeight, targetWidth, targetHeight);
      break;
    case 'box-average':
    default:
      resampled = resampleBoxAverage(srcRgba, srcWidth, srcHeight, targetWidth, targetHeight);
      break;
  }

  const { bufR, bufG, bufB, isOpaque } = resampled;
  const totalTarget = targetWidth * targetHeight;

  if (brightness !== 1 || contrast !== 1 || saturation !== 1) {
    for (let i = 0; i < totalTarget; i++) {
      if (!isOpaque[i]) continue;
      const [ar, ag, ab] = adjustPixelColor(
        bufR[i],
        bufG[i],
        bufB[i],
        brightness,
        contrast,
        saturation,
      );
      bufR[i] = ar;
      bufG[i] = ag;
      bufB[i] = ab;
    }
  }

  const fullMatcher = new PaletteMatcher(palette, metric);
  let activeIndices: number[] | undefined;

  if (maxColors > 0) {
    const initialGrid = new Int16Array(totalTarget).fill(-1);
    for (let i = 0; i < totalTarget; i++) {
      if (!isOpaque[i]) continue;
      initialGrid[i] = fullMatcher.match(clampByte(bufR[i]), clampByte(bufG[i]), clampByte(bufB[i]));
    }
    const subset = selectTopNPaletteIndices(initialGrid, palette, maxColors, metric);
    if (subset.length < palette.length) {
      activeIndices = subset;
    }
  }

  const finalMatcher = activeIndices
    ? new PaletteMatcher(palette, metric, activeIndices)
    : fullMatcher;

  const grid = quantizeWithDithering(
    bufR,
    bufG,
    bufB,
    isOpaque,
    targetWidth,
    targetHeight,
    palette,
    finalMatcher,
    resolvedDitherMode,
    ditherStrength,
  );

  return { grid, width: targetWidth, height: targetHeight };
}
