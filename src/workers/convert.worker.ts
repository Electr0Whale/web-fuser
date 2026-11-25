import type { BeadColor, ColorMetric } from '../core/colorSpace';
import type { DitherMode } from '../core/dithering';
import { downscalePhotoToGrid } from '../core/photoDownscaler';
import { downscalePixelArtToGrid } from '../core/pixelDownscaler';

export type ConvertAlgorithm =
  | 'pixel-art'
  | 'nearest'
  | 'dominant'
  | 'box-average'
  | 'lanczos';

export interface AlgorithmOption {
  value: ConvertAlgorithm;
  label: string;
  description: string;
}

export const ALGORITHM_OPTIONS: AlgorithmOption[] = [
  {
    value: 'pixel-art',
    label: '智能像素画',
    description: '轮廓骨架拓扑投影，保护 1px 细线与硬边缘，适合动漫/像素立绘',
  },
  {
    value: 'nearest',
    label: '邻近采样',
    description: '直接点采样最近像素，保持 100% 锐利边缘与纯色',
  },
  {
    value: 'dominant',
    label: '主色投票',
    description: '格子内按主要颜色面积投票，减少边缘混色，适合扁平插画',
  },
  {
    value: 'box-average',
    label: '区域平均',
    description: '子像素面积加权平均，色调自然柔和，适合照片与渐变图',
  },
  {
    value: 'lanczos',
    label: '锐利 Lanczos',
    description: 'Lanczos-3 高阶重采样，保留照片高频细节与纹理层次',
  },
];

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
  ditherMode: DitherMode;
  ditherStrength: number;
  strokeStrength: number;
}

export interface ConvertWorkerResponse {
  requestId: number;
  gridBuffer: ArrayBuffer;
  width: number;
  height: number;
  durationMs: number;
}

self.onmessage = (event: MessageEvent<ConvertWorkerRequest>) => {
  const req = event.data;
  const start = performance.now();
  const srcRgba = new Uint8ClampedArray(req.rgbaBuffer);

  let grid: Int16Array;

  if (req.algorithm === 'pixel-art') {
    const res = downscalePixelArtToGrid(srcRgba, req.srcWidth, req.srcHeight, {
      targetWidth: req.targetWidth,
      targetHeight: req.targetHeight,
      palette: req.palette,
      maxColors: req.maxColors,
      metric: req.metric,
      strokeStrength: req.strokeStrength,
    });
    grid = res.grid;
  } else {
    const res = downscalePhotoToGrid(srcRgba, req.srcWidth, req.srcHeight, {
      targetWidth: req.targetWidth,
      targetHeight: req.targetHeight,
      palette: req.palette,
      algorithm: req.algorithm,
      maxColors: req.maxColors,
      metric: req.metric,
      brightness: req.brightness,
      contrast: req.contrast,
      saturation: req.saturation,
      ditherMode: req.ditherMode,
      ditherStrength: req.ditherStrength,
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
  };

  (self as unknown as Worker).postMessage(response, [response.gridBuffer]);
};
