import {
  type BeadColor,
  type ColorMetric,
  PaletteMatcher,
  remapGridToSubset,
  selectTopNPaletteIndices,
} from './colorSpace';

export interface PixelDownscaleOptions {
  targetWidth: number;
  targetHeight: number;
  palette: readonly BeadColor[];
  maxColors?: number; // 0 or undefined = unlimited
  metric?: ColorMetric;
  strokeStrength?: number; // 0..1, default 0.75
  detectBorder?: boolean; // default true
  strayMinCount?: number; // default 3
}

export interface PixelDownscaleResult {
  grid: Int16Array; // -1 for transparent/empty, >=0 palette index
  width: number;
  height: number;
  detectedBorderWidth: number;
}

function rgbKey(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/**
 * Merge ultra-rare stray palette colors (< minCount pixels) into the nearest
 * core palette color in perceptual RGB space.
 */
export function cleanStrayPaletteColors(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  minCount = 3,
): { cleaned: Uint8ClampedArray; paletteRgb: number[] } {
  const total = width * height;
  const counts = new Map<number, number>();

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (rgba[o + 3] < 128) continue;
    const key = rgbKey(rgba[o], rgba[o + 1], rgba[o + 2]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const coreColors: number[] = [];
  const allColors: number[] = [];
  for (const [key, cnt] of counts.entries()) {
    allColors.push(key);
    if (cnt >= minCount) coreColors.push(key);
  }

  if (coreColors.length === 0 || coreColors.length === allColors.length) {
    return { cleaned: new Uint8ClampedArray(rgba), paletteRgb: allColors };
  }

  const remap = new Map<number, number>();
  for (const key of allColors) {
    if ((counts.get(key) ?? 0) >= minCount) {
      remap.set(key, key);
      continue;
    }
    const r = (key >> 16) & 0xff;
    const g = (key >> 8) & 0xff;
    const b = key & 0xff;
    let bestCore = coreColors[0];
    let bestDist = Infinity;
    for (let j = 0; j < coreColors.length; j++) {
      const ck = coreColors[j];
      const dr = ((ck >> 16) & 0xff) - r;
      const dg = ((ck >> 8) & 0xff) - g;
      const db = (ck & 0xff) - b;
      const dist = 0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestCore = ck;
      }
    }
    remap.set(key, bestCore);
  }

  const cleaned = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (rgba[o + 3] < 128) {
      cleaned[o + 3] = 0;
      continue;
    }
    const mapped = remap.get(rgbKey(rgba[o], rgba[o + 1], rgba[o + 2]))!;
    cleaned[o] = (mapped >> 16) & 0xff;
    cleaned[o + 1] = (mapped >> 8) & 0xff;
    cleaned[o + 2] = mapped & 0xff;
    cleaned[o + 3] = 255;
  }

  return { cleaned, paletteRgb: coreColors };
}

/**
 * Detect concentric solid-color border rings from the outer edge inward.
 */
export function detectNestedBorder(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  const maxRing = Math.floor(Math.min(width, height) / 4);
  let offset = 0;

  while (offset < maxRing) {
    const topIdx = (offset * width + offset) * 4;
    if (rgba[topIdx + 3] < 128) break;
    const refKey = rgbKey(rgba[topIdx], rgba[topIdx + 1], rgba[topIdx + 2]);
    let uniform = true;

    for (let x = offset; x < width - offset; x++) {
      const t = (offset * width + x) * 4;
      const b = ((height - 1 - offset) * width + x) * 4;
      if (
        rgba[t + 3] < 128 ||
        rgba[b + 3] < 128 ||
        rgbKey(rgba[t], rgba[t + 1], rgba[t + 2]) !== refKey ||
        rgbKey(rgba[b], rgba[b + 1], rgba[b + 2]) !== refKey
      ) {
        uniform = false;
        break;
      }
    }
    if (!uniform) break;

    for (let y = offset; y < height - offset; y++) {
      const l = (y * width + offset) * 4;
      const r = (y * width + (width - 1 - offset)) * 4;
      if (
        rgba[l + 3] < 128 ||
        rgba[r + 3] < 128 ||
        rgbKey(rgba[l], rgba[l + 1], rgba[l + 2]) !== refKey ||
        rgbKey(rgba[r], rgba[r + 1], rgba[r + 2]) !== refKey
      ) {
        uniform = false;
        break;
      }
    }
    if (!uniform) break;
    offset++;
  }

  return offset;
}

function morphBox(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  mode: 'erode' | 'dilate',
): Uint8Array {
  const out = new Uint8Array(width * height);
  const defaultVal = mode === 'erode' ? 1 : 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = defaultVal;
      outer: for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const val =
            ny >= 0 && ny < height && nx >= 0 && nx < width
              ? mask[ny * width + nx]
              : 0;
          if (mode === 'erode') {
            if (val === 0) {
              acc = 0;
              break outer;
            }
          } else if (val === 1) {
            acc = 1;
            break outer;
          }
        }
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

/**
 * Detect thin high-contrast dark ink strokes (eyes, mouth, outlines)
 * and thin bright rim strokes via morphological opening.
 */
export function detectThinStrokes(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): { darkStroke: Uint8Array; brightStroke: Uint8Array } {
  const total = width * height;
  const isDark = new Uint8Array(total);
  const isBright = new Uint8Array(total);
  const lightMask = new Uint8Array(total);
  const darkRegionMask = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (rgba[o + 3] < 128) {
      lightMask[i] = 1; // Transparent acts like light background around outer ink stroke
      continue;
    }
    const lum = (0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]) / 255;
    if (lum < 0.12) isDark[i] = 1;
    if (lum > 0.85) isBright[i] = 1;
    if (lum > 0.25) lightMask[i] = 1;
    if (lum < 0.55) darkRegionMask[i] = 1;
  }

  const largeDark = morphBox(morphBox(isDark, width, height, 2, 'erode'), width, height, 2, 'dilate');
  const lightNearby = morphBox(lightMask, width, height, 2, 'dilate');

  const largeBright = morphBox(morphBox(isBright, width, height, 2, 'erode'), width, height, 2, 'dilate');
  const darkNearby = morphBox(darkRegionMask, width, height, 2, 'dilate');

  const darkStroke = new Uint8Array(total);
  const brightStroke = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (isDark[i] && !largeDark[i] && lightNearby[i]) darkStroke[i] = 1;
    if (isBright[i] && !largeBright[i] && darkNearby[i]) brightStroke[i] = 1;
  }
  return { darkStroke, brightStroke };
}

/**
 * Standard Zhang-Suen 8-connected binary skeletonization.
 */
export function zhangSuenThin(img: Uint8Array, width: number, height: number): Uint8Array {
  const paddedW = width + 2;
  const paddedH = height + 2;
  const padded = new Uint8Array(paddedW * paddedH);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      padded[(y + 1) * paddedW + (x + 1)] = img[y * width + x] ? 1 : 0;
    }
  }

  const toDelete: number[] = [];
  let changed = true;

  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      toDelete.length = 0;
      for (let y = 1; y <= height; y++) {
        for (let x = 1; x <= width; x++) {
          const idx = y * paddedW + x;
          if (!padded[idx]) continue;

          const p2 = padded[(y - 1) * paddedW + x];
          const p3 = padded[(y - 1) * paddedW + (x + 1)];
          const p4 = padded[y * paddedW + (x + 1)];
          const p5 = padded[(y + 1) * paddedW + (x + 1)];
          const p6 = padded[(y + 1) * paddedW + x];
          const p7 = padded[(y + 1) * paddedW + (x - 1)];
          const p8 = padded[y * paddedW + (x - 1)];
          const p9 = padded[(y - 1) * paddedW + (x - 1)];

          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;

          const n = [p2, p3, p4, p5, p6, p7, p8, p9];
          let A = 0;
          for (let i = 0; i < 8; i++) {
            if (n[i] === 0 && n[(i + 1) & 7] === 1) A++;
          }
          if (A !== 1) continue;

          const cond3 = step === 0 ? p2 === 0 || p4 === 0 || p6 === 0 : p2 === 0 || p4 === 0 || p8 === 0;
          const cond4 = step === 0 ? p4 === 0 || p6 === 0 || p8 === 0 : p2 === 0 || p6 === 0 || p8 === 0;
          if (cond3 && cond4) {
            toDelete.push(idx);
          }
        }
      }
      if (toDelete.length > 0) {
        for (let i = 0; i < toDelete.length; i++) {
          padded[toDelete[i]] = 0;
        }
        changed = true;
      }
    }
  }

  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[y * width + x] = padded[(y + 1) * paddedW + (x + 1)];
    }
  }
  return out;
}

function removeLDoublesMask(
  mask: Uint8Array,
  coverage: Float64Array,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (!out[idx]) continue;
      const n = out[(y - 1) * width + x];
      const s = out[(y + 1) * width + x];
      const e = out[y * width + (x + 1)];
      const w = out[y * width + (x - 1)];
      const ne = out[(y - 1) * width + (x + 1)];
      const nw = out[(y - 1) * width + (x - 1)];
      const se = out[(y + 1) * width + (x + 1)];
      const sw = out[(y + 1) * width + (x - 1)];

      const n4 = n + s + e + w;
      if (n4 !== 2) continue;

      const isL =
        (n && e && !s && !w && !sw) ||
        (e && s && !n && !w && !nw) ||
        (s && w && !n && !e && !ne) ||
        (w && n && !s && !e && !se);

      if (isL && coverage[idx] < 0.92) {
        out[idx] = 0;
      }
    }
  }
  return out;
}

export function projectAndThinStroke(
  srcMask: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
  minWeight: number,
): Uint8Array {
  const scaleY = srcHeight / targetHeight;
  const scaleX = srcWidth / targetWidth;
  const maxScale = Math.max(scaleX, scaleY);
  const coverage = new Float64Array(targetWidth * targetHeight);
  const binary = new Uint8Array(targetWidth * targetHeight);

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

      let acc = 0;
      for (let sy = iy0; sy < iy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = ix0; sx < ix1; sx++) {
          if (srcMask[sy * srcWidth + sx]) {
            const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
            if (wx > 0) acc += wx * wy;
          }
        }
      }
      const cov = acc / maxScale;
      const tidx = ty * targetWidth + tx;
      coverage[tidx] = cov;
      if (cov >= minWeight) binary[tidx] = 1;
    }
  }

  for (let sy = 0; sy < srcHeight; sy++) {
    for (let sx = 0; sx < srcWidth; sx++) {
      if (!srcMask[sy * srcWidth + sx]) continue;
      const ty = Math.min(targetHeight - 1, Math.floor((sy + 0.5) / scaleY));
      const tx = Math.min(targetWidth - 1, Math.floor((sx + 0.5) / scaleX));
      binary[ty * targetWidth + tx] = 1;
    }
  }

  const thinned = zhangSuenThin(binary, targetWidth, targetHeight);
  return removeLDoublesMask(thinned, coverage, targetWidth, targetHeight);
}

/**
 * Sequentially clean redundant L-junction doubles on thin 1px strokes
 * while strictly preserving 8-connectivity.
 */
export function applyPixelPerfectCleanup(
  rgbGrid: Int32Array, // -1 for transparent, >=0 packed 24-bit rgb
  width: number,
  height: number,
): Int32Array {
  const out = new Int32Array(rgbGrid);
  const corners: Array<[[number, number], [number, number], [number, number]]> = [
    [[-1, 0], [0, 1], [1, -1]],
    [[0, 1], [1, 0], [-1, -1]],
    [[1, 0], [0, -1], [-1, 1]],
    [[0, -1], [-1, 0], [1, 1]],
  ];
  const n4Offsets: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const col = out[y * width + x];
      if (col < 0) continue;

      let inBlock = false;
      for (let dy = -1; dy <= 0 && !inBlock; dy++) {
        for (let dx = -1; dx <= 0 && !inBlock; dx++) {
          if (
            out[(y + dy) * width + (x + dx)] === col &&
            out[(y + dy) * width + (x + dx + 1)] === col &&
            out[(y + dy + 1) * width + (x + dx)] === col &&
            out[(y + dy + 1) * width + (x + dx + 1)] === col
          ) {
            inBlock = true;
          }
        }
      }
      if (inBlock) continue;

      for (let c = 0; c < corners.length; c++) {
        const [[dy1, dx1], [dy2, dx2], [ody, odx]] = corners[c];
        if (
          out[(y + dy1) * width + (x + dx1)] === col &&
          out[(y + dy2) * width + (x + dx2)] === col
        ) {
          let n4 = 0;
          for (let k = 0; k < 4; k++) {
            const [ny, nx] = n4Offsets[k];
            if (out[(y + ny) * width + (x + nx)] === col) n4++;
          }
          if (n4 !== 2) continue;
          const oppCol = out[(y + ody) * width + (x + odx)];
          if (oppCol === col) continue;

          let bothOtherMatch = true;
          for (let k = 0; k < 4; k++) {
            const [ny, nx] = n4Offsets[k];
            if ((ny === dy1 && nx === dx1) || (ny === dy2 && nx === dx2)) continue;
            if (out[(y + ny) * width + (x + nx)] !== oppCol) {
              bothOtherMatch = false;
              break;
            }
          }
          if (bothOtherMatch) {
            out[y * width + x] = oppCol;
            break;
          }
        }
      }
    }
  }
  return out;
}

function areaOverlapDownscaleRgb(
  rgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  paletteRgb: readonly number[],
  targetWidth: number,
  targetHeight: number,
  darkStroke: Uint8Array,
  brightStroke: Uint8Array,
  mildBoost: number,
): Int32Array {
  const palMap = new Map<number, number>();
  for (let i = 0; i < paletteRgb.length; i++) {
    palMap.set(paletteRgb[i], i);
  }

  const totalSrc = srcWidth * srcHeight;
  const srcIdx = new Int32Array(totalSrc).fill(-1);
  const pxWeight = new Float64Array(totalSrc);
  for (let i = 0; i < totalSrc; i++) {
    const o = i * 4;
    if (rgba[o + 3] < 128) continue;
    srcIdx[i] = palMap.get(rgbKey(rgba[o], rgba[o + 1], rgba[o + 2])) ?? -1;
    pxWeight[i] = 1 + (darkStroke[i] || brightStroke[i] ? mildBoost : 0);
  }

  const scaleY = srcHeight / targetHeight;
  const scaleX = srcWidth / targetWidth;
  const scores = new Float64Array(paletteRgb.length);
  const out = new Int32Array(targetWidth * targetHeight).fill(-1);

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

      scores.fill(0);
      let opaqueArea = 0;
      let transparentArea = 0;

      for (let sy = iy0; sy < iy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = ix0; sx < ix1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const area = wx * wy;
          const si = sy * srcWidth + sx;
          const cIdx = srcIdx[si];
          if (cIdx < 0) {
            transparentArea += area;
          } else {
            opaqueArea += area;
            scores[cIdx] += area * pxWeight[si];
          }
        }
      }

      if (transparentArea > opaqueArea || opaqueArea === 0) {
        out[ty * targetWidth + tx] = -1;
        continue;
      }

      let bestIdx = 0;
      let bestScore = -1;
      for (let k = 0; k < scores.length; k++) {
        if (scores[k] > bestScore) {
          bestScore = scores[k];
          bestIdx = k;
        }
      }
      out[ty * targetWidth + tx] = paletteRgb[bestIdx];
    }
  }
  return out;
}

function recommendedBorderWidth(minTargetDim: number, origBorder: number): number {
  if (origBorder === 0) return 0;
  if (minTargetDim >= 96) return 6;
  if (minTargetDim >= 70) return 5;
  return 4;
}

function addPixelFrame(
  inner: Int32Array,
  innerW: number,
  innerH: number,
  targetW: number,
  targetH: number,
): Int32Array {
  const borderW = Math.floor((targetW - innerW) / 2);
  const canvas = new Int32Array(targetW * targetH).fill(-1);
  const white = rgbKey(255, 255, 255);
  const black = rgbKey(0, 0, 0);

  let rings: Array<[number, number]>;
  if (borderW >= 4) {
    rings = [[1, white], [borderW - 3, black], [1, white], [1, black]];
  } else if (borderW === 3) {
    rings = [[1, white], [1, black], [1, white]];
  } else if (borderW === 2) {
    rings = [[1, white], [1, black]];
  } else {
    rings = [[borderW, black]];
  }

  let offset = 0;
  for (const [ringWidth, col] of rings) {
    for (let r = 0; r < ringWidth; r++) {
      for (let x = offset; x < targetW - offset; x++) {
        canvas[offset * targetW + x] = col;
        canvas[(targetH - 1 - offset) * targetW + x] = col;
      }
      for (let y = offset; y < targetH - offset; y++) {
        canvas[y * targetW + offset] = col;
        canvas[y * targetW + (targetW - 1 - offset)] = col;
      }
      offset++;
    }
  }

  for (let y = 0; y < innerH; y++) {
    for (let x = 0; x < innerW; x++) {
      canvas[(y + borderW) * targetW + (x + borderW)] = inner[y * innerW + x];
    }
  }
  return canvas;
}

function cropRgba(
  rgba: Uint8ClampedArray,
  width: number,
  borderW: number,
  cropW: number,
  cropH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const srcRow = ((y + borderW) * width + borderW) * 4;
    const dstRow = y * cropW * 4;
    out.set(rgba.subarray(srcRow, srcRow + cropW * 4), dstRow);
  }
  return out;
}

/**
 * Topology- and silhouette-preserving pixel-art downscaler mapped to a bead brand palette.
 */
export function downscalePixelArtToGrid(
  srcRgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  options: PixelDownscaleOptions,
): PixelDownscaleResult {
  const {
    targetWidth,
    targetHeight,
    palette,
    maxColors = 0,
    metric = 'ciede2000',
    strokeStrength = 0.75,
    detectBorder = true,
    strayMinCount = 3,
  } = options;

  const { cleaned, paletteRgb } = cleanStrayPaletteColors(srcRgba, srcWidth, srcHeight, strayMinCount);
  const detectedBorderWidth = detectBorder ? detectNestedBorder(cleaned, srcWidth, srcHeight) : 0;

  let innerRgba = cleaned;
  let innerSrcW = srcWidth;
  let innerSrcH = srcHeight;
  let outBorder = 0;

  if (detectedBorderWidth > 0) {
    const candidateBorder = recommendedBorderWidth(
      Math.min(targetWidth, targetHeight),
      detectedBorderWidth,
    );
    if (
      targetWidth - 2 * candidateBorder >= 8 &&
      targetHeight - 2 * candidateBorder >= 8 &&
      srcWidth - 2 * detectedBorderWidth >= 8 &&
      srcHeight - 2 * detectedBorderWidth >= 8
    ) {
      outBorder = candidateBorder;
      innerSrcW = srcWidth - 2 * detectedBorderWidth;
      innerSrcH = srcHeight - 2 * detectedBorderWidth;
      innerRgba = cropRgba(cleaned, srcWidth, detectedBorderWidth, innerSrcW, innerSrcH);
    }
  }

  const innerTargetW = targetWidth - 2 * outBorder;
  const innerTargetH = targetHeight - 2 * outBorder;

  const { darkStroke, brightStroke } = detectThinStrokes(innerRgba, innerSrcW, innerSrcH);
  const mildBoost = 0.65 * Math.max(0, Math.min(1, strokeStrength));

  let innerRgbGrid = areaOverlapDownscaleRgb(
    innerRgba,
    innerSrcW,
    innerSrcH,
    paletteRgb,
    innerTargetW,
    innerTargetH,
    darkStroke,
    brightStroke,
    mildBoost,
  );

  if (strokeStrength > 0.05) {
    const darkMinW = Math.max(0.16, 0.36 - 0.14 * strokeStrength);
    const brightMinW = Math.max(0.18, 0.38 - 0.13 * strokeStrength);
    const darkProj = projectAndThinStroke(
      darkStroke,
      innerSrcW,
      innerSrcH,
      innerTargetW,
      innerTargetH,
      darkMinW,
    );
    const brightProj = projectAndThinStroke(
      brightStroke,
      innerSrcW,
      innerSrcH,
      innerTargetW,
      innerTargetH,
      brightMinW,
    );

    const blackKey = rgbKey(0, 0, 0);
    const whiteKey = rgbKey(255, 255, 255);
    for (let i = 0; i < innerRgbGrid.length; i++) {
      if (darkProj[i]) innerRgbGrid[i] = blackKey;
      else if (brightProj[i]) innerRgbGrid[i] = whiteKey;
    }
    innerRgbGrid = applyPixelPerfectCleanup(innerRgbGrid, innerTargetW, innerTargetH);
  }

  const finalRgbGrid =
    outBorder > 0
      ? addPixelFrame(innerRgbGrid, innerTargetW, innerTargetH, targetWidth, targetHeight)
      : innerRgbGrid;

  const matcher = new PaletteMatcher(palette, metric);
  let grid: Int16Array = new Int16Array(targetWidth * targetHeight).fill(-1);
  for (let i = 0; i < finalRgbGrid.length; i++) {
    const col = finalRgbGrid[i];
    if (col < 0) continue;
    grid[i] = matcher.match((col >> 16) & 0xff, (col >> 8) & 0xff, col & 0xff);
  }

  if (maxColors > 0) {
    const allowed = selectTopNPaletteIndices(grid, palette, maxColors, metric);
    if (allowed.length < palette.length) {
      grid = remapGridToSubset(grid, palette, allowed, metric);
    }
  }

  return {
    grid,
    width: targetWidth,
    height: targetHeight,
    detectedBorderWidth,
  };
}
