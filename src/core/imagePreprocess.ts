export type CropAspectPreset = 'original' | 'free' | '1:1' | '3:4' | '4:3';

export interface CropTransformState {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  aspectPreset: CropAspectPreset;
}

export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function createDefaultCropState(): CropTransformState {
  return {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rotation: 0,
    flipH: false,
    flipV: false,
    aspectPreset: 'original',
  };
}

export function getRotatedDimensions(
  srcW: number,
  srcH: number,
  rotation: 0 | 90 | 180 | 270,
): { width: number; height: number } {
  if (rotation === 90 || rotation === 270) {
    return { width: srcH, height: srcW };
  }
  return { width: srcW, height: srcH };
}

/**
 * Fit an image into a physical square pegboard of `maxSide` such that the longest
 * side equals `maxSide` (clamped to [8, 200]) and the shorter side preserves aspect ratio.
 */
export function fitDimensionsToMaxSide(
  imgW: number,
  imgH: number,
  maxSide: number,
): { width: number; height: number } {
  const S = Math.max(8, Math.min(200, Math.round(maxSide)));
  if (imgW <= 0 || imgH <= 0) {
    return { width: S, height: S };
  }
  if (imgW >= imgH) {
    return {
      width: S,
      height: Math.max(8, Math.min(200, Math.round((S * imgH) / imgW))),
    };
  }
  return {
    width: Math.max(8, Math.min(200, Math.round((S * imgW) / imgH))),
    height: S,
  };
}

/**
 * Given one edited axis (`w` or `h`), compute the complementary axis preserving aspect ratio
 * and ensuring neither axis exceeds 200 or drops below 8.
 */
export function fitDimensionsByAxis(
  imgW: number,
  imgH: number,
  axis: 'w' | 'h',
  value: number,
): { width: number; height: number } {
  const v = Math.max(8, Math.min(200, Math.round(value)));
  if (imgW <= 0 || imgH <= 0) {
    return { width: v, height: v };
  }
  if (axis === 'w') {
    const rawH = Math.round((v * imgH) / imgW);
    if (rawH > 200) {
      return {
        width: Math.max(8, Math.round((200 * imgW) / imgH)),
        height: 200,
      };
    }
    return { width: v, height: Math.max(8, rawH) };
  }
  const rawW = Math.round((v * imgW) / imgH);
  if (rawW > 200) {
    return {
      width: 200,
      height: Math.max(8, Math.round((200 * imgH) / imgW)),
    };
  }
  return { width: Math.max(8, rawW), height: v };
}

export function clampCropRect(rect: NormalizedRect, minFrac = 0.08): NormalizedRect {
  const w = Math.max(minFrac, Math.min(1, rect.w));
  const h = Math.max(minFrac, Math.min(1, rect.h));
  const x = Math.max(0, Math.min(1 - w, rect.x));
  const y = Math.max(0, Math.min(1 - h, rect.y));
  return { x, y, w, h };
}

export function getTargetAspectRatio(
  rotW: number,
  rotH: number,
  preset: CropAspectPreset,
): number | null {
  switch (preset) {
    case 'free':
      return null;
    case 'original':
      return rotH > 0 ? rotW / rotH : 1;
    case '1:1':
      return 1;
    case '3:4':
      return 3 / 4;
    case '4:3':
      return 4 / 3;
  }
}

/**
 * Compute the largest centered crop rectangle inside `rotW x rotH` matching `preset`.
 */
export function applyAspectPresetToCrop(
  rotW: number,
  rotH: number,
  preset: CropAspectPreset,
): NormalizedRect {
  if (preset === 'original' || preset === 'free' || rotW <= 0 || rotH <= 0) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }
  const targetRatio = getTargetAspectRatio(rotW, rotH, preset) ?? rotW / rotH;
  const imgRatio = rotW / rotH;

  let w = 1;
  let h = 1;
  if (imgRatio > targetRatio) {
    // Image is wider than target ratio: height fills 100%, width shrinks
    h = 1;
    w = (targetRatio * rotH) / rotW;
  } else {
    // Image is taller than target ratio: width fills 100%, height shrinks
    w = 1;
    h = rotW / (targetRatio * rotH);
  }
  return clampCropRect({
    x: (1 - w) / 2,
    y: (1 - h) / 2,
    w,
    h,
  });
}

/**
 * Zoom around the current crop center relative to the full-frame base dimensions (baseW, baseH).
 */
export function applyZoomToCrop(
  current: NormalizedRect,
  baseW: number,
  baseH: number,
  zoom: number,
  minFrac = 0.08,
): NormalizedRect {
  const safeZoom = Math.max(1, Math.min(4, zoom));
  const cx = current.x + current.w / 2;
  const cy = current.y + current.h / 2;

  let newW = baseW / safeZoom;
  let newH = baseH / safeZoom;
  if (newW < minFrac || newH < minFrac) {
    const scale = Math.max(minFrac / newW, minFrac / newH);
    newW = Math.min(baseW, newW * scale);
    newH = Math.min(baseH, newH * scale);
  }

  return clampCropRect(
    {
      x: cx - newW / 2,
      y: cy - newH / 2,
      w: newW,
      h: newH,
    },
    minFrac,
  );
}

/**
 * Render the rotated, flipped, and cropped region of `img` onto an offscreen canvas
 * with crisp pixel sampling (`imageSmoothingEnabled = false`) and extract RGBA + preview URL.
 */
export function renderPreprocessedImage(
  img: HTMLImageElement,
  crop: CropTransformState,
): { rgba: Uint8ClampedArray; width: number; height: number; previewUrl: string } {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const { width: rotW, height: rotH } = getRotatedDimensions(srcW, srcH, crop.rotation);

  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rotCtx = rotCanvas.getContext('2d')!;
  rotCtx.imageSmoothingEnabled = false;

  rotCtx.save();
  rotCtx.translate(rotW / 2, rotH / 2);
  rotCtx.rotate((crop.rotation * Math.PI) / 180);
  rotCtx.scale(crop.flipH ? -1 : 1, crop.flipV ? -1 : 1);
  rotCtx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);
  rotCtx.restore();

  const sx = Math.max(0, Math.min(rotW - 1, Math.round(crop.x * rotW)));
  const sy = Math.max(0, Math.min(rotH - 1, Math.round(crop.y * rotH)));
  const sw = Math.max(1, Math.min(rotW - sx, Math.round(crop.w * rotW)));
  const sh = Math.max(1, Math.min(rotH - sy, Math.round(crop.h * rotH)));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = sw;
  outCanvas.height = sh;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const imgData = outCtx.getImageData(0, 0, sw, sh);
  return {
    rgba: imgData.data,
    width: sw,
    height: sh,
    previewUrl: outCanvas.toDataURL('image/png'),
  };
}
