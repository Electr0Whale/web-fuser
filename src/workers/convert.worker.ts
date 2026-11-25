import type { BeadColor, ColorMetric } from '../core/colorSpace';
import { downscalePhotoToGrid } from '../core/photoDownscaler';
import { downscalePixelArtToGrid } from '../core/pixelDownscaler';

export type ConvertAlgorithm = 'pixel-art' | 'photo';

export interface ConvertWorkerRequest {
  requestId: number;
  rgbaBuffer: ArrayBuffer;
  srcWidth: number;
  srcHeight: number;
  targetWidth: number;
  targetHeight: number;
  algorithm: ConvertAlgorithm;
  palette: BeadColor[];
  maxColors: number;
  metric: ColorMetric;
  brightness: number;
  contrast: number;
  saturation: number;
  dither: boolean;
  strokeStrength: number;
  detectBorder: boolean;
}

export interface ConvertWorkerResponse {
  requestId: number;
  gridBuffer: ArrayBuffer;
  width: number;
  height: number;
  durationMs: number;
  detectedBorderWidth: number;
}

self.onmessage = (event: MessageEvent<ConvertWorkerRequest>) => {
  const req = event.data;
  const start = performance.now();
  const srcRgba = new Uint8ClampedArray(req.rgbaBuffer);

  let grid: Int16Array;
  let detectedBorderWidth = 0;

  if (req.algorithm === 'pixel-art') {
    const res = downscalePixelArtToGrid(srcRgba, req.srcWidth, req.srcHeight, {
      targetWidth: req.targetWidth,
      targetHeight: req.targetHeight,
      palette: req.palette,
      maxColors: req.maxColors,
      metric: req.metric,
      strokeStrength: req.strokeStrength,
      detectBorder: req.detectBorder,
    });
    grid = res.grid;
    detectedBorderWidth = res.detectedBorderWidth;
  } else {
    const res = downscalePhotoToGrid(srcRgba, req.srcWidth, req.srcHeight, {
      targetWidth: req.targetWidth,
      targetHeight: req.targetHeight,
      palette: req.palette,
      maxColors: req.maxColors,
      metric: req.metric,
      brightness: req.brightness,
      contrast: req.contrast,
      saturation: req.saturation,
      dither: req.dither,
    });
    grid = res.grid;
  }

  const durationMs = Math.round(performance.now() - start);
  const copy = new Int16Array(grid);
  const response: ConvertWorkerResponse = {
    requestId: req.requestId,
    gridBuffer: copy.buffer,
    width: req.targetWidth,
    height: req.targetHeight,
    durationMs,
    detectedBorderWidth,
  };

  (self as unknown as Worker).postMessage(response, [response.gridBuffer]);
};
