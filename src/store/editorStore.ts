import { create } from 'zustand';
import {
  type BeadBrandPalette,
  type ColorMetric,
  PaletteMatcher,
} from '../core/colorSpace';
import {
  floodFillGrid,
  mergeRareColorsInGrid,
  replaceColorInGrid,
  resizeGridPreserveContent,
} from '../core/editingTools';
import { removeBackgroundFromGrid } from '../core/backgroundRemoval';
import { downscalePhotoToGrid } from '../core/photoDownscaler';
import { downscalePixelArtToGrid } from '../core/pixelDownscaler';
import { BUILTIN_PALETTES, getPaletteById } from '../data/palettes';
import type { DitherMode } from '../core/dithering';
import {
  type CropTransformState,
  fitDimensionsByAxis,
  fitDimensionsToMaxSide,
} from '../core/imagePreprocess';
import {
  DEFAULT_PREVIEW3D_SETTINGS,
  type Preview3DSettings,
} from '../core/preview3d/craftCatalog';
import { ALGORITHM_OPTIONS, type ConvertAlgorithm } from '../workers/convert.worker';

export type EditorTool = 'move' | 'brush' | 'eraser' | 'eyedropper' | 'bucket' | 'line' | 'rect';
export type ViewMode = '2d' | '3d';
export type GridStyle = 'gapped' | 'line' | 'seamless';
export type CoordFormat = 'number' | 'alpha-col';
export type ThemeMode = 'light' | 'dark' | 'system';

export function resolveThemeMode(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
}

export function applyThemeToDom(theme: ThemeMode): 'light' | 'dark' {
  const resolved = resolveThemeMode(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
  }
  return resolved;
}

export interface HistoryEntry {
  id: number;
  label: string;
  grid: Int16Array;
  width: number;
  height: number;
  timestamp: number;
}

export interface RawSourceImage {
  url: string;
  width: number;
  height: number;
  fileName: string;
}

export interface SourceImageData {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  previewUrl: string;
  fileName: string;
  raw?: RawSourceImage;
  cropState?: CropTransformState;
}

export interface GuideColorOption {
  id: string;
  label: string;
  value: string;
}

export const GUIDE_COLOR_OPTIONS: GuideColorOption[] = [
  { id: 'black', label: '炭黑', value: '#1F1F1F' },
  { id: 'gray', label: '中性灰', value: '#747775' },
  { id: 'white', label: '纯白', value: '#FFFFFF' },
  { id: 'orange', label: '琥珀橙', value: '#EA8600' },
  { id: 'yellow', label: '明黄', value: '#F9AB00' },
  { id: 'sage', label: '鼠尾草绿', value: '#1E8E3E' },
  { id: 'sky', label: '天蓝', value: '#1A73E8' },
  { id: 'lilac', label: '丁香紫', value: '#9334E6' },
  { id: 'rose', label: '玫瑰红', value: '#D93025' },
  { id: 'terracotta', label: '陶土棕', value: '#B06000' },
];

export const CANVAS_SIZE_PRESETS = [29, 52, 78, 104, 128, 156] as const;
export const MAX_COLORS_PRESETS = [0, 24, 48, 72, 96, 120, 144] as const;

let historySeq = 1;
let convertSeq = 1;
let activeWorker: Worker | null = null;

function getOrCreateWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!activeWorker) {
    activeWorker = new Worker(new URL('../workers/convert.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return activeWorker;
}

function createInitialGrid(w: number, h: number): Int16Array {
  return new Int16Array(w * h).fill(-1);
}

export interface EditorState {
  // Project metadata
  projectId: string | null;
  projectName: string;
  isDirty: boolean;
  lastSavedAt: number | null;

  // Grid state
  width: number;
  height: number;
  pendingWidth: number;
  pendingHeight: number;
  grid: Int16Array;
  initialGrid: Int16Array | null;
  initialWidth: number;
  initialHeight: number;

  // Source image
  sourceImage: SourceImageData | null;
  isConverting: boolean;
  convertDurationMs: number | null;

  // Palette & conversion settings
  brandId: string;
  customPalettes: BeadBrandPalette[];
  maxColors: number;
  metric: ColorMetric;
  algorithm: ConvertAlgorithm;
  lockAspect: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  ditherMode: DitherMode;
  ditherStrength: number;
  strokeStrength: number;
  bgTolerance: number;

  // Tool & viewport settings
  tool: EditorTool;
  activeColorIndex: number;
  mirrorX: boolean;
  mirrorY: boolean;
  manualEditEnabled: boolean;
  gridStyle: GridStyle;
  guideInterval: number;
  guideColor: string;
  showCoordinates: boolean;
  coordFormat: CoordFormat;
  showCodes: boolean;
  highlightColorIndex: number | null;
  zoom: number;
  panX: number;
  panY: number;

  // App experience settings
  theme: ThemeMode;
  maxHistorySteps: number;
  autoSaveEnabled: boolean;
  viewMode: ViewMode;
  preview3d: Preview3DSettings;

  // History
  history: HistoryEntry[];
  historyIndex: number;

  // Helpers / actions
  getActivePalette: () => BeadBrandPalette;
  setProjectName: (name: string) => void;
  setProjectMeta: (id: string | null, name: string, savedAt?: number | null) => void;
  markSaved: (id: string, savedAt: number) => void;

  setTheme: (theme: ThemeMode) => void;
  setTool: (tool: EditorTool) => void;
  setActiveColorIndex: (idx: number) => void;
  setMirrorX: (v: boolean) => void;
  setMirrorY: (v: boolean) => void;
  setManualEditEnabled: (v: boolean) => void;
  setGridStyle: (style: GridStyle) => void;
  setGuideInterval: (interval: number) => void;
  setGuideColor: (color: string) => void;
  setShowCoordinates: (v: boolean) => void;
  setCoordFormat: (fmt: CoordFormat) => void;
  setShowCodes: (v: boolean) => void;
  setHighlightColorIndex: (idx: number | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  setMaxHistorySteps: (steps: number) => void;
  setAutoSaveEnabled: (v: boolean) => void;
  setBgTolerance: (v: number) => void;
  setViewMode: (mode: ViewMode) => void;
  updatePreview3d: (patch: Partial<Preview3DSettings>) => void;
  resetPreview3d: () => void;

  // Conversion & image actions
  setSourceImage: (src: SourceImageData | null, autoConvert?: boolean, targetMaxSide?: number) => void;
  applyBoardPreset: (presetSize: number) => void;
  updateConversionParams: (
    patch: Partial<{
      width: number;
      height: number;
      lockAspect: boolean;
      algorithm: ConvertAlgorithm;
      maxColors: number;
      metric: ColorMetric;
      brightness: number;
      contrast: number;
      saturation: number;
      ditherMode: DitherMode;
      ditherStrength: number;
      strokeStrength: number;
    }>,
    reconvert?: boolean,
  ) => void;
  setDimensions: (newW: number, newH: number) => void;
  switchBrand: (brandId: string) => void;
  addCustomPalette: (palette: BeadBrandPalette) => void;
  runConversion: () => void;

  // Grid mutations with undo history
  commitGridChange: (nextGrid: Int16Array, label: string, nextW?: number, nextH?: number) => void;
  applyFloodFill: (x: number, y: number) => void;
  applyBackgroundRemoval: () => number;
  replaceColor: (fromIdx: number, toIdx: number) => void;
  mergeRareColors: (threshold?: number) => { changedCells: number; mergedColorCount: number };
  newBlankCanvas: (w?: number, h?: number) => void;
  loadPatternIntoEditor: (opts: {
    projectId?: string | null;
    projectName: string;
    brandId: string;
    width: number;
    height: number;
    grid: Int16Array;
    customPalette?: BeadBrandPalette;
  }) => void;

  // History actions
  undo: () => void;
  redo: () => void;
  jumpToHistory: (index: number) => void;
  resetToInitial: () => void;
}

const DEFAULT_W = 52;
const DEFAULT_H = 52;
const initBlank = createInitialGrid(DEFAULT_W, DEFAULT_H);

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: null,
  projectName: '未命名拼豆图纸',
  isDirty: false,
  lastSavedAt: null,

  width: DEFAULT_W,
  height: DEFAULT_H,
  pendingWidth: DEFAULT_W,
  pendingHeight: DEFAULT_H,
  grid: new Int16Array(initBlank),
  initialGrid: new Int16Array(initBlank),
  initialWidth: DEFAULT_W,
  initialHeight: DEFAULT_H,

  sourceImage: null,
  isConverting: false,
  convertDurationMs: null,

  brandId: BUILTIN_PALETTES[0].id,
  customPalettes: [],
  maxColors: 0,
  metric: 'ciede2000',
  algorithm: 'pixel-art',
  lockAspect: true,
  brightness: 1.0,
  contrast: 1.0,
  saturation: 1.0,
  ditherMode: 'none',
  ditherStrength: 0.85,
  strokeStrength: 0.75,
  bgTolerance: 14,

  tool: 'brush',
  activeColorIndex: 0,
  mirrorX: false,
  mirrorY: false,
  manualEditEnabled: true,
  gridStyle: 'line',
  guideInterval: 10,
  guideColor: '#1A73E8',
  showCoordinates: true,
  coordFormat: 'number',
  showCodes: true,
  highlightColorIndex: null,
  zoom: 1.0,
  panX: 0,
  panY: 0,

  theme: 'light',
  maxHistorySteps: 100,
  autoSaveEnabled: true,
  viewMode: '2d',
  preview3d: { ...DEFAULT_PREVIEW3D_SETTINGS },

  history: [
    {
      id: historySeq++,
      label: '初始空白画布',
      grid: new Int16Array(initBlank),
      width: DEFAULT_W,
      height: DEFAULT_H,
      timestamp: Date.now(),
    },
  ],
  historyIndex: 0,

  getActivePalette: () => {
    const state = get();
    return getPaletteById(state.brandId, state.customPalettes);
  },

  setProjectName: (projectName) => set({ projectName, isDirty: true }),
  setProjectMeta: (projectId, projectName, lastSavedAt = null) =>
    set({ projectId, projectName, lastSavedAt }),
  markSaved: (projectId, savedAt) =>
    set({ projectId, lastSavedAt: savedAt, isDirty: false }),

  setTheme: (theme) => {
    applyThemeToDom(theme);
    set({ theme });
  },
  setTool: (tool) => set({ tool }),
  setActiveColorIndex: (activeColorIndex) =>
    set((s) => ({
      activeColorIndex,
      tool: s.tool === 'eraser' || s.tool === 'eyedropper' || s.tool === 'move' ? 'brush' : s.tool,
    })),
  setMirrorX: (mirrorX) => set({ mirrorX }),
  setMirrorY: (mirrorY) => set({ mirrorY }),
  setManualEditEnabled: (manualEditEnabled) => set({ manualEditEnabled }),
  setGridStyle: (gridStyle) => set({ gridStyle }),
  setGuideInterval: (guideInterval) => set({ guideInterval }),
  setGuideColor: (guideColor) => set({ guideColor }),
  setShowCoordinates: (showCoordinates) => set({ showCoordinates }),
  setCoordFormat: (coordFormat) => set({ coordFormat }),
  setShowCodes: (showCodes) => set({ showCodes }),
  setHighlightColorIndex: (highlightColorIndex) => set({ highlightColorIndex }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(4.0, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  setMaxHistorySteps: (steps) =>
    set((s) => {
      const clamped = Math.max(10, Math.min(100, steps));
      if (s.history.length <= clamped) return { maxHistorySteps: clamped };
      const overflow = s.history.length - clamped;
      const sliced = s.history.slice(overflow);
      return {
        maxHistorySteps: clamped,
        history: sliced,
        historyIndex: Math.max(0, s.historyIndex - overflow),
      };
    }),
  setAutoSaveEnabled: (autoSaveEnabled) => set({ autoSaveEnabled }),
  setBgTolerance: (bgTolerance) => set({ bgTolerance }),
  setViewMode: (viewMode) => set({ viewMode }),
  updatePreview3d: (patch) =>
    set((s) => ({
      preview3d: { ...s.preview3d, ...patch },
    })),
  resetPreview3d: () => set({ preview3d: { ...DEFAULT_PREVIEW3D_SETTINGS } }),

  setSourceImage: (sourceImage, autoConvert = true, targetMaxSide) => {
    set({ sourceImage });
    if (sourceImage && autoConvert) {
      const s = get();
      const boardSize = targetMaxSide ?? Math.max(s.pendingWidth, s.pendingHeight);
      const fitted = fitDimensionsToMaxSide(sourceImage.width, sourceImage.height, boardSize);
      set({
        pendingWidth: fitted.width,
        pendingHeight: fitted.height,
        lockAspect: true,
      });
      get().runConversion();
    }
  },

  applyBoardPreset: (presetSize) => {
    const s = get();
    const clamped = Math.max(8, Math.min(200, Math.round(presetSize)));
    if (s.sourceImage) {
      const nextDims = s.lockAspect
        ? fitDimensionsToMaxSide(s.sourceImage.width, s.sourceImage.height, clamped)
        : { width: clamped, height: clamped };
      set({
        pendingWidth: nextDims.width,
        pendingHeight: nextDims.height,
      });
      get().runConversion();
      return;
    }
    s.setDimensions(clamped, clamped);
  },

  updateConversionParams: (patch, reconvert = true) => {
    set((s) => {
      const next = { ...s };
      const prevLock = s.lockAspect;
      if (patch.lockAspect !== undefined) next.lockAspect = patch.lockAspect;
      if (patch.algorithm !== undefined) next.algorithm = patch.algorithm;
      if (patch.maxColors !== undefined) next.maxColors = patch.maxColors;
      if (patch.metric !== undefined) next.metric = patch.metric;
      if (patch.brightness !== undefined) next.brightness = patch.brightness;
      if (patch.contrast !== undefined) next.contrast = patch.contrast;
      if (patch.saturation !== undefined) next.saturation = patch.saturation;
      if (patch.ditherMode !== undefined) next.ditherMode = patch.ditherMode;
      if (patch.ditherStrength !== undefined) next.ditherStrength = patch.ditherStrength;
      if (patch.strokeStrength !== undefined) next.strokeStrength = patch.strokeStrength;

      if (patch.width !== undefined && patch.height !== undefined) {
        next.pendingWidth = Math.max(8, Math.min(200, Math.round(patch.width)));
        next.pendingHeight = Math.max(8, Math.min(200, Math.round(patch.height)));
      } else if (patch.width !== undefined) {
        if (next.lockAspect && s.sourceImage) {
          const fitted = fitDimensionsByAxis(
            s.sourceImage.width,
            s.sourceImage.height,
            'w',
            patch.width,
          );
          next.pendingWidth = fitted.width;
          next.pendingHeight = fitted.height;
        } else {
          next.pendingWidth = Math.max(8, Math.min(200, Math.round(patch.width)));
        }
      } else if (patch.height !== undefined) {
        if (next.lockAspect && s.sourceImage) {
          const fitted = fitDimensionsByAxis(
            s.sourceImage.width,
            s.sourceImage.height,
            'h',
            patch.height,
          );
          next.pendingWidth = fitted.width;
          next.pendingHeight = fitted.height;
        } else {
          next.pendingHeight = Math.max(8, Math.min(200, Math.round(patch.height)));
        }
      } else if (patch.lockAspect === true && !prevLock && s.sourceImage) {
        const fitted = fitDimensionsToMaxSide(
          s.sourceImage.width,
          s.sourceImage.height,
          Math.max(next.pendingWidth, next.pendingHeight),
        );
        next.pendingWidth = fitted.width;
        next.pendingHeight = fitted.height;
      }
      return next;
    });
    if (reconvert && get().sourceImage) {
      get().runConversion();
    }
  },

  setDimensions: (rawW, rawH) => {
    const newW = Math.max(8, Math.min(200, Math.round(rawW)));
    const newH = Math.max(8, Math.min(200, Math.round(rawH)));
    const s = get();
    if (s.sourceImage) {
      set({ pendingWidth: newW, pendingHeight: newH });
      get().runConversion();
      return;
    }
    if (newW === s.width && newH === s.height) return;
    const resized = resizeGridPreserveContent(s.grid, s.width, s.height, newW, newH);
    set({ pendingWidth: newW, pendingHeight: newH });
    s.commitGridChange(resized, `调整尺寸 · ${newW}×${newH}`, newW, newH);
  },

  switchBrand: (brandId) => {
    const s = get();
    if (brandId === s.brandId) return;
    const oldPalette = s.getActivePalette();
    const newPalette = getPaletteById(brandId, s.customPalettes);
    set({ brandId, highlightColorIndex: null });

    if (s.sourceImage) {
      get().runConversion();
      return;
    }

    // Remap current grid colors cleanly to the new brand palette
    const matcher = new PaletteMatcher(newPalette.colors, s.metric);
    const cache = new Map<number, number>();
    const nextGrid = new Int16Array(s.grid.length).fill(-1);
    for (let i = 0; i < s.grid.length; i++) {
      const oldIdx = s.grid[i];
      if (oldIdx < 0 || oldIdx >= oldPalette.colors.length) continue;
      let mapped = cache.get(oldIdx);
      if (mapped === undefined) {
        const [r, g, b] = oldPalette.colors[oldIdx].rgb;
        mapped = matcher.match(r, g, b);
        cache.set(oldIdx, mapped);
      }
      nextGrid[i] = mapped;
    }
    get().commitGridChange(nextGrid, `切换色卡 · ${newPalette.label.split('·')[0].trim()}`);
  },

  addCustomPalette: (palette) => {
    set((s) => ({ customPalettes: [...s.customPalettes, palette] }));
    get().switchBrand(palette.id);
  },

  runConversion: () => {
    const s = get();
    if (!s.sourceImage) return;
    const palette = s.getActivePalette();
    const reqId = ++convertSeq;
    set({ isConverting: true });

    const applyResult = (
      grid: Int16Array,
      width: number,
      height: number,
      durationMs: number,
    ) => {
      const cur = get();
      if (reqId !== convertSeq) return; // stale request
      const algoLabel =
        ALGORITHM_OPTIONS.find((opt) => opt.value === cur.algorithm)?.label ?? cur.algorithm;
      const entry: HistoryEntry = {
        id: historySeq++,
        label: `图片转换 · ${width}×${height} (${algoLabel})`,
        grid: new Int16Array(grid),
        width,
        height,
        timestamp: Date.now(),
      };
      set({
        width,
        height,
        pendingWidth: width,
        pendingHeight: height,
        grid: new Int16Array(grid),
        initialGrid: new Int16Array(grid),
        initialWidth: width,
        initialHeight: height,
        isConverting: false,
        convertDurationMs: durationMs,
        highlightColorIndex: null,
        isDirty: true,
        history: [entry],
        historyIndex: 0,
      });
    };

    const targetW = s.pendingWidth;
    const targetH = s.pendingHeight;
    const worker = getOrCreateWorker();
    if (worker) {
      const bufferCopy = s.sourceImage.rgba.slice().buffer;
      worker.onmessage = (ev: MessageEvent) => {
        const data = ev.data as {
          requestId: number;
          gridBuffer: ArrayBuffer;
          width: number;
          height: number;
          durationMs: number;
        };
        if (data.requestId !== reqId) return;
        applyResult(
          new Int16Array(data.gridBuffer),
          data.width,
          data.height,
          data.durationMs,
        );
      };
      worker.onerror = () => {
        set({ isConverting: false });
      };
      worker.postMessage(
        {
          requestId: reqId,
          rgbaBuffer: bufferCopy,
          srcWidth: s.sourceImage.width,
          srcHeight: s.sourceImage.height,
          targetWidth: targetW,
          targetHeight: targetH,
          algorithm: s.algorithm,
          palette: palette.colors,
          maxColors: s.maxColors,
          metric: s.metric,
          brightness: s.brightness,
          contrast: s.contrast,
          saturation: s.saturation,
          ditherMode: s.ditherMode,
          ditherStrength: s.ditherStrength,
          strokeStrength: s.strokeStrength,
        },
        [bufferCopy],
      );
      return;
    }

    // Fallback synchronous path (e.g. unit tests / environments without Worker)
    const start = performance.now();
    let resGrid: Int16Array;
    if (s.algorithm === 'pixel-art') {
      const r = downscalePixelArtToGrid(
        s.sourceImage.rgba,
        s.sourceImage.width,
        s.sourceImage.height,
        {
          targetWidth: targetW,
          targetHeight: targetH,
          palette: palette.colors,
          maxColors: s.maxColors,
          metric: s.metric,
          strokeStrength: s.strokeStrength,
        },
      );
      resGrid = r.grid;
    } else {
      const r = downscalePhotoToGrid(
        s.sourceImage.rgba,
        s.sourceImage.width,
        s.sourceImage.height,
        {
          targetWidth: targetW,
          targetHeight: targetH,
          palette: palette.colors,
          algorithm: s.algorithm,
          maxColors: s.maxColors,
          metric: s.metric,
          brightness: s.brightness,
          contrast: s.contrast,
          saturation: s.saturation,
          ditherMode: s.ditherMode,
          ditherStrength: s.ditherStrength,
        },
      );
      resGrid = r.grid;
    }
    applyResult(resGrid, targetW, targetH, Math.round(performance.now() - start));
  },

  commitGridChange: (nextGrid, label, nextW, nextH) =>
    set((s) => {
      const w = nextW ?? s.width;
      const h = nextH ?? s.height;
      const head = s.history.slice(0, s.historyIndex + 1);
      const entry: HistoryEntry = {
        id: historySeq++,
        label,
        grid: new Int16Array(nextGrid),
        width: w,
        height: h,
        timestamp: Date.now(),
      };
      head.push(entry);
      const overflow = Math.max(0, head.length - s.maxHistorySteps);
      const trimmed = overflow > 0 ? head.slice(overflow) : head;
      return {
        width: w,
        height: h,
        grid: new Int16Array(nextGrid),
        history: trimmed,
        historyIndex: trimmed.length - 1,
        isDirty: true,
      };
    }),

  applyFloodFill: (x, y) => {
    const s = get();
    const palette = s.getActivePalette();
    const replacement = s.activeColorIndex;
    const { nextGrid, changedCount } = floodFillGrid(
      s.grid,
      s.width,
      s.height,
      x,
      y,
      replacement,
      s.mirrorX,
      s.mirrorY,
    );
    if (changedCount === 0) return;
    const c = replacement >= 0 ? palette.colors[replacement] : null;
    const label = c
      ? `油漆桶填充 · ${c.code} ${c.name} · ${changedCount} 格`
      : `油漆桶清空 · ${changedCount} 格`;
    s.commitGridChange(nextGrid, label);
  },

  applyBackgroundRemoval: () => {
    const s = get();
    const palette = s.getActivePalette();
    const { nextGrid, removedCount } = removeBackgroundFromGrid(
      s.grid,
      s.width,
      s.height,
      palette.colors,
      s.bgTolerance,
    );
    if (removedCount > 0) {
      s.commitGridChange(nextGrid, `一键去背景 · 清除 ${removedCount} 格`);
    }
    return removedCount;
  },

  replaceColor: (fromIdx, toIdx) => {
    const s = get();
    const palette = s.getActivePalette();
    const { nextGrid, changedCount } = replaceColorInGrid(s.grid, fromIdx, toIdx);
    if (changedCount === 0) return;
    const fromCode = palette.colors[fromIdx]?.code ?? '';
    const toCode = toIdx >= 0 ? palette.colors[toIdx]?.code ?? '' : '空位';
    s.commitGridChange(nextGrid, `全局换色 · ${fromCode} → ${toCode} (${changedCount} 格)`);
    if (s.highlightColorIndex === fromIdx) {
      set({ highlightColorIndex: toIdx >= 0 ? toIdx : null });
    }
  },

  mergeRareColors: (threshold = 5) => {
    const s = get();
    const palette = s.getActivePalette();
    const res = mergeRareColorsInGrid(s.grid, palette.colors, threshold, s.metric);
    if (res.changedCells > 0) {
      s.commitGridChange(
        res.nextGrid,
        `合并杂色 (<${threshold}颗) · 归并 ${res.mergedColorCount} 色`,
      );
    }
    return { changedCells: res.changedCells, mergedColorCount: res.mergedColorCount };
  },

  newBlankCanvas: (w, h) => {
    const targetW = Math.max(8, Math.min(200, w ?? get().width));
    const targetH = Math.max(8, Math.min(200, h ?? get().height));
    const blank = createInitialGrid(targetW, targetH);
    const entry: HistoryEntry = {
      id: historySeq++,
      label: `新建空白画布 · ${targetW}×${targetH}`,
      grid: new Int16Array(blank),
      width: targetW,
      height: targetH,
      timestamp: Date.now(),
    };
    set({
      projectId: null,
      projectName: '未命名拼豆图纸',
      lastSavedAt: null,
      isDirty: false,
      sourceImage: null,
      width: targetW,
      height: targetH,
      pendingWidth: targetW,
      pendingHeight: targetH,
      grid: new Int16Array(blank),
      initialGrid: new Int16Array(blank),
      initialWidth: targetW,
      initialHeight: targetH,
      highlightColorIndex: null,
      convertDurationMs: null,
      history: [entry],
      historyIndex: 0,
    });
  },

  loadPatternIntoEditor: ({
    projectId = null,
    projectName,
    brandId,
    width,
    height,
    grid,
    customPalette,
  }) => {
    const state = get();
    const customPalettes =
      customPalette && !state.customPalettes.some((p) => p.id === customPalette.id)
        ? [...state.customPalettes, customPalette]
        : state.customPalettes;

    const entry: HistoryEntry = {
      id: historySeq++,
      label: `读取工程 · ${projectName}`,
      grid: new Int16Array(grid),
      width,
      height,
      timestamp: Date.now(),
    };

    set({
      projectId,
      projectName,
      brandId,
      customPalettes,
      sourceImage: null,
      width,
      height,
      pendingWidth: width,
      pendingHeight: height,
      grid: new Int16Array(grid),
      initialGrid: new Int16Array(grid),
      initialWidth: width,
      initialHeight: height,
      highlightColorIndex: null,
      isDirty: false,
      history: [entry],
      historyIndex: 0,
    });
  },

  undo: () =>
    set((s) => {
      if (s.historyIndex <= 0) return s;
      const nextIdx = s.historyIndex - 1;
      const target = s.history[nextIdx];
      return {
        historyIndex: nextIdx,
        grid: new Int16Array(target.grid),
        width: target.width,
        height: target.height,
        pendingWidth: target.width,
        pendingHeight: target.height,
        isDirty: true,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.historyIndex >= s.history.length - 1) return s;
      const nextIdx = s.historyIndex + 1;
      const target = s.history[nextIdx];
      return {
        historyIndex: nextIdx,
        grid: new Int16Array(target.grid),
        width: target.width,
        height: target.height,
        pendingWidth: target.width,
        pendingHeight: target.height,
        isDirty: true,
      };
    }),

  jumpToHistory: (index) =>
    set((s) => {
      if (index < 0 || index >= s.history.length) return s;
      const target = s.history[index];
      return {
        historyIndex: index,
        grid: new Int16Array(target.grid),
        width: target.width,
        height: target.height,
        pendingWidth: target.width,
        pendingHeight: target.height,
        isDirty: true,
      };
    }),

  resetToInitial: () => {
    const s = get();
    if (!s.initialGrid) return;
    s.commitGridChange(
      new Int16Array(s.initialGrid),
      '复原至初始状态',
      s.initialWidth,
      s.initialHeight,
    );
  },
}));
