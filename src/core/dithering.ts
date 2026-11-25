import { type BeadColor, type PaletteMatcher, clampByte } from './colorSpace';

export type DitherMode =
  | 'none'
  | 'floyd-steinberg'
  | 'atkinson'
  | 'sierra-lite'
  | 'bayer-4x4'
  | 'bayer-8x8';

export interface DitherModeOption {
  value: DitherMode;
  label: string;
  description: string;
}

export const DITHER_MODE_OPTIONS: DitherModeOption[] = [
  { value: 'none', label: '无抖动（纯色块）', description: '直接匹配最接近色号，色块干净整洁' },
  { value: 'floyd-steinberg', label: 'Floyd–Steinberg', description: '经典 4 邻域误差扩散，过渡细腻自然' },
  { value: 'atkinson', label: 'Atkinson（轻柔扩散）', description: '保留 3/4 误差扩散，高光与暗部更干净' },
  { value: 'sierra-lite', label: 'Sierra Lite（轻量扩散）', description: '计算轻快、斜纹更少，适合人像与风景' },
  { value: 'bayer-4x4', label: 'Bayer 4×4（有序网点）', description: '经典复古像素矩阵网点，纹理规则有序' },
  { value: 'bayer-8x8', label: 'Bayer 8×8（细腻网点）', description: '64 级有序阈值矩阵，渐变平滑且无误差拖影' },
];

// Normalized Bayer 4x4 threshold matrix in [-0.5, +0.5)
const BAYER_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
].map((v) => v / 16 - 0.5);

// Normalized Bayer 8x8 threshold matrix in [-0.5, +0.5)
const BAYER_8X8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => v / 64 - 0.5);

type DiffusionKernel = ReadonlyArray<readonly [dx: number, dy: number, weight: number]>;

const DIFFUSION_KERNELS: Record<'floyd-steinberg' | 'atkinson' | 'sierra-lite', DiffusionKernel> = {
  'floyd-steinberg': [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16],
  ],
  atkinson: [
    [1, 0, 1 / 8],
    [2, 0, 1 / 8],
    [-1, 1, 1 / 8],
    [0, 1, 1 / 8],
    [1, 1, 1 / 8],
    [0, 2, 1 / 8],
  ],
  'sierra-lite': [
    [1, 0, 2 / 4],
    [-1, 1, 1 / 4],
    [0, 1, 1 / 4],
  ],
};

/**
 * Quantize floating-point RGB buffers onto a bead palette using the selected dithering mode.
 */
export function quantizeWithDithering(
  bufR: Float64Array,
  bufG: Float64Array,
  bufB: Float64Array,
  isOpaque: Uint8Array,
  width: number,
  height: number,
  palette: readonly BeadColor[],
  matcher: PaletteMatcher,
  ditherMode: DitherMode,
  ditherStrength = 0.85,
): Int16Array {
  const total = width * height;
  const grid = new Int16Array(total).fill(-1);
  const strength = Math.max(0, Math.min(1, ditherStrength));

  if (ditherMode === 'none' || strength === 0) {
    for (let i = 0; i < total; i++) {
      if (!isOpaque[i]) continue;
      grid[i] = matcher.match(clampByte(bufR[i]), clampByte(bufG[i]), clampByte(bufB[i]));
    }
    return grid;
  }

  if (ditherMode === 'bayer-4x4' || ditherMode === 'bayer-8x8') {
    const is8 = ditherMode === 'bayer-8x8';
    const size = is8 ? 8 : 4;
    const matrix = is8 ? BAYER_8X8 : BAYER_4X4;
    const spread = 48 * strength;

    for (let y = 0; y < height; y++) {
      const rowOffset = (y % size) * size;
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!isOpaque[idx]) continue;
        const delta = matrix[rowOffset + (x % size)] * spread;
        grid[idx] = matcher.match(
          clampByte(bufR[idx] + delta),
          clampByte(bufG[idx] + delta),
          clampByte(bufB[idx] + delta),
        );
      }
    }
    return grid;
  }

  // Error diffusion modes: clone working buffers so caller buffers are never mutated
  const workR = new Float64Array(bufR);
  const workG = new Float64Array(bufG);
  const workB = new Float64Array(bufB);
  const kernel = DIFFUSION_KERNELS[ditherMode];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!isOpaque[idx]) continue;

      const oldR = clampByte(workR[idx]);
      const oldG = clampByte(workG[idx]);
      const oldB = clampByte(workB[idx]);
      const chosenIdx = matcher.match(oldR, oldG, oldB);
      grid[idx] = chosenIdx;

      const [newR, newG, newB] = palette[chosenIdx].rgb;
      const errR = (workR[idx] - newR) * strength;
      const errG = (workG[idx] - newG) * strength;
      const errB = (workB[idx] - newB) * strength;

      for (let k = 0; k < kernel.length; k++) {
        const [dx, dy, weight] = kernel[k];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (!isOpaque[nIdx]) continue;
        workR[nIdx] += errR * weight;
        workG[nIdx] += errG * weight;
        workB[nIdx] += errB * weight;
      }
    }
  }

  return grid;
}
