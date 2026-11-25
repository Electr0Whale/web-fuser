import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Crop,
  Eraser,
  ImagePlus,
  Lock,
  RotateCcw,
  Unlock,
  Upload,
} from 'lucide-react';
import { DITHER_MODE_OPTIONS, type DitherMode } from '../core/dithering';
import { type CropTransformState } from '../core/imagePreprocess';
import { BUILTIN_PALETTES, parseCustomPaletteFile } from '../data/palettes';
import {
  CANVAS_SIZE_PRESETS,
  GUIDE_COLOR_OPTIONS,
  MAX_COLORS_PRESETS,
  type RawSourceImage,
  useEditorStore,
  type GridStyle,
} from '../store/editorStore';
import { ALGORITHM_OPTIONS, type ConvertAlgorithm } from '../workers/convert.worker';
import { ImagePreprocessModal } from './ImagePreprocessModal';

interface LeftControlPanelProps {
  onToast: (msg: string, tone?: 'info' | 'success' | 'warn' | 'danger') => void;
  fullWidth?: boolean;
}

type SectionKey = 'size' | 'convert' | 'brand' | 'prefs';

export const LeftControlPanel: React.FC<LeftControlPanelProps> = ({
  onToast,
  fullWidth = false,
}) => {
  const [openSection, setOpenSection] = useState<SectionKey>('size');
  const [isDragging, setIsDragging] = useState(false);
  const [pendingPreprocess, setPendingPreprocess] = useState<{
    raw: RawSourceImage;
    initialCrop?: CropTransformState;
    isNewUpload: boolean;
  } | null>(null);

  const imgInputRef = useRef<HTMLInputElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);

  const width = useEditorStore((s) => s.pendingWidth);
  const height = useEditorStore((s) => s.pendingHeight);
  const lockAspect = useEditorStore((s) => s.lockAspect);
  const sourceImage = useEditorStore((s) => s.sourceImage);
  const convertDurationMs = useEditorStore((s) => s.convertDurationMs);

  const algorithm = useEditorStore((s) => s.algorithm);
  const brightness = useEditorStore((s) => s.brightness);
  const contrast = useEditorStore((s) => s.contrast);
  const saturation = useEditorStore((s) => s.saturation);
  const ditherMode = useEditorStore((s) => s.ditherMode);
  const ditherStrength = useEditorStore((s) => s.ditherStrength);
  const strokeStrength = useEditorStore((s) => s.strokeStrength);
  const bgTolerance = useEditorStore((s) => s.bgTolerance);

  // Local draft strings so typing multi-digit numbers (e.g. "7" -> "72") never clamps mid-keystroke
  const [widthInput, setWidthInput] = useState(String(width));
  const [heightInput, setHeightInput] = useState(String(height));
  const editingFieldRef = useRef<'w' | 'h' | null>(null);
  const wTimerRef = useRef<number | null>(null);
  const hTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (editingFieldRef.current !== 'w') setWidthInput(String(width));
  }, [width]);

  useEffect(() => {
    if (editingFieldRef.current !== 'h') setHeightInput(String(height));
  }, [height]);

  useEffect(() => {
    return () => {
      if (wTimerRef.current !== null) window.clearTimeout(wTimerRef.current);
      if (hTimerRef.current !== null) window.clearTimeout(hTimerRef.current);
    };
  }, []);

  const commitDim = (axis: 'w' | 'h', val: number) => {
    const clamped = Math.max(8, Math.min(200, Math.round(val)));
    if (axis === 'w') {
      if (sourceImage) updateConversionParams({ width: clamped });
      else setDimensions(clamped, height);
    } else {
      if (sourceImage) updateConversionParams({ height: clamped });
      else setDimensions(width, clamped);
    }
    return clamped;
  };

  const brandId = useEditorStore((s) => s.brandId);
  const customPalettes = useEditorStore((s) => s.customPalettes);
  const maxColors = useEditorStore((s) => s.maxColors);
  const metric = useEditorStore((s) => s.metric);
  const gridStyle = useEditorStore((s) => s.gridStyle);
  const guideInterval = useEditorStore((s) => s.guideInterval);
  const guideColor = useEditorStore((s) => s.guideColor);
  const showCoordinates = useEditorStore((s) => s.showCoordinates);
  const coordFormat = useEditorStore((s) => s.coordFormat);
  const manualEditEnabled = useEditorStore((s) => s.manualEditEnabled);
  const maxHistorySteps = useEditorStore((s) => s.maxHistorySteps);
  const autoSaveEnabled = useEditorStore((s) => s.autoSaveEnabled);

  const setSourceImage = useEditorStore((s) => s.setSourceImage);
  const applyBoardPreset = useEditorStore((s) => s.applyBoardPreset);
  const updateConversionParams = useEditorStore((s) => s.updateConversionParams);
  const setDimensions = useEditorStore((s) => s.setDimensions);
  const switchBrand = useEditorStore((s) => s.switchBrand);
  const addCustomPalette = useEditorStore((s) => s.addCustomPalette);
  const setGridStyle = useEditorStore((s) => s.setGridStyle);
  const setGuideInterval = useEditorStore((s) => s.setGuideInterval);
  const setGuideColor = useEditorStore((s) => s.setGuideColor);
  const setShowCoordinates = useEditorStore((s) => s.setShowCoordinates);
  const setCoordFormat = useEditorStore((s) => s.setCoordFormat);
  const setManualEditEnabled = useEditorStore((s) => s.setManualEditEnabled);
  const setMaxHistorySteps = useEditorStore((s) => s.setMaxHistorySteps);
  const setAutoSaveEnabled = useEditorStore((s) => s.setAutoSaveEnabled);
  const setBgTolerance = useEditorStore((s) => s.setBgTolerance);
  const applyBackgroundRemoval = useEditorStore((s) => s.applyBackgroundRemoval);

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onToast('请上传 PNG、JPG 或 WebP 格式的图片。', 'warn');
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        setPendingPreprocess({
          raw: {
            url,
            width: img.naturalWidth,
            height: img.naturalHeight,
            fileName: file.name,
          },
          isNewUpload: true,
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        onToast('图片解码失败，请检查文件是否损坏。', 'danger');
      };
      img.src = url;
    } catch {
      onToast('读取图片失败。', 'danger');
    }
  };

  const handleCustomPaletteUpload = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseCustomPaletteFile(file.name, text);
      addCustomPalette(parsed);
      onToast(`已导入自定义色卡：${parsed.label}`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : '导入色卡失败', 'danger');
    }
  };

  const allPalettes = [...BUILTIN_PALETTES, ...customPalettes];

  const AccordionHeader = ({
    id,
    num,
    title,
  }: {
    id: SectionKey;
    num: string;
    title: string;
  }) => {
    const active = openSection === id;
    return (
      <button
        type="button"
        onClick={() => setOpenSection(id)}
        aria-expanded={active}
        className="w-full px-3.5 py-2.5 rounded-[24px] flex items-center justify-between text-left text-sm font-medium transition-colors"
        style={{
          backgroundColor: active ? 'var(--md-primary-container)' : 'transparent',
          color: active ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)',
        }}
      >
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs opacity-75">{num}</span>
          <span>{title}</span>
        </span>
        {active ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    );
  };

  return (
    <aside
      className={`${fullWidth ? 'w-full' : 'w-[280px]'} shrink-0 h-full overflow-y-auto border-r p-3 flex flex-col gap-3`}
      style={{
        backgroundColor: 'var(--md-surface-container)',
        borderColor: 'var(--md-outline-subtle)',
      }}
    >
      {/* Image Upload Dropzone Card */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleImageFile(f);
        }}
        className="rounded-xl p-3 flex flex-col gap-2.5 gemini-card transition-colors"
        style={{
          borderColor: isDragging ? 'var(--md-primary)' : 'var(--md-outline-subtle)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold flex items-center gap-1.5">
            <ImagePlus className="w-4 h-4" style={{ color: 'var(--md-primary)' }} />
            图片转图纸
          </span>
          {convertDurationMs !== null && (
            <span className="font-mono text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
              {convertDurationMs}ms
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => imgInputRef.current?.click()}
          aria-label="选择或拖拽图片上传"
          className="w-full py-3 px-3 rounded-xl border border-dashed flex flex-col items-center gap-1.5 text-center m3-hover transition-colors"
          style={{ borderColor: 'var(--md-outline-variant)' }}
        >
          {sourceImage ? (
            <div className="flex items-center gap-2.5 w-full text-left">
              <img
                src={sourceImage.previewUrl}
                alt={sourceImage.fileName}
                className="w-10 h-10 rounded-lg object-cover border shrink-0"
                style={{ borderColor: 'var(--md-outline-variant)' }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{sourceImage.fileName}</div>
                <div className="text-[11px] font-mono" style={{ color: 'var(--md-on-surface-variant)' }}>
                  {sourceImage.width}×{sourceImage.height} · 点击更换
                </div>
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-5 h-5" style={{ color: 'var(--md-primary)' }} />
              <div className="text-xs font-medium">点击或拖拽图片到此处</div>
              <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
                支持 PNG / JPG / WebP
              </div>
            </>
          )}
        </button>
        <input
          ref={imgInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImageFile(f);
            e.target.value = '';
          }}
        />

        {sourceImage?.raw && (
          <button
            type="button"
            onClick={() =>
              setPendingPreprocess({
                raw: sourceImage.raw!,
                initialCrop: sourceImage.cropState,
                isNewUpload: false,
              })
            }
            className="w-full h-7 px-3 rounded-full text-xs font-medium flex items-center justify-center gap-1.5 gemini-tonal-btn"
            style={{ color: 'var(--md-primary)' }}
          >
            <Crop className="w-3.5 h-3.5" />
            <span>裁剪 / 缩放预处理</span>
          </button>
        )}

        {/* One-click local background removal */}
        <div className="flex flex-col gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--md-surface-container-high)' }}>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                const removed = applyBackgroundRemoval();
                if (removed > 0) {
                  onToast(`已去除边缘背景 ${removed} 格（可随时撤销）`, 'success');
                } else {
                  onToast('未检测到可清除的边缘纯色背景，可调高容差重试。', 'info');
                }
              }}
              className="flex-1 h-8 px-3 rounded-full text-xs font-medium border flex items-center justify-center gap-1.5 m3-hover"
              style={{
                borderColor: 'var(--md-outline-variant)',
                color: 'var(--md-on-surface)',
              }}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>一键去除背景</span>
            </button>
            <span className="font-mono text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
              容差 {bgTolerance}
            </span>
          </div>
          <input
            type="range"
            min={4}
            max={45}
            value={bgTolerance}
            aria-label="背景去除容差"
            onChange={(e) => setBgTolerance(Number(e.target.value))}
            className="w-full accent-[var(--md-primary)]"
          />
        </div>
      </div>

      {/* Section 01: Canvas Specs */}
      <div className="rounded-xl p-2 flex flex-col gap-2 gemini-card">
        <AccordionHeader id="size" num="01" title="画布规格" />
        {openSection === 'size' && (
          <div className="px-2 pb-2 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-1.5">
              {CANVAS_SIZE_PRESETS.map((sz) => {
                const active =
                  sourceImage && lockAspect
                    ? Math.max(width, height) === sz
                    : width === sz && height === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => applyBoardPreset(sz)}
                    title={
                      sourceImage && lockAspect
                        ? `拼豆板规格：最长边适配 ${sz} 格`
                        : `设置画布为 ${sz}×${sz}`
                    }
                    className="h-7 rounded-full font-mono text-xs transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--md-primary)' : 'var(--md-surface-container)',
                      color: active ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                    }}
                  >
                    {sz}×{sz}
                  </button>
                );
              })}
            </div>

            {sourceImage && lockAspect && (
              <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
                按原图比例适配 · 最长边 <span className="font-mono">{Math.max(width, height)}</span> 格
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="flex-1 text-xs">
                <span className="block text-[11px] mb-1" style={{ color: 'var(--md-on-surface-variant)' }}>
                  宽 (8-200)
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="画布宽度"
                  value={widthInput}
                  onFocus={() => {
                    editingFieldRef.current = 'w';
                  }}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!/^\d{0,3}$/.test(raw)) return;
                    setWidthInput(raw);
                    if (wTimerRef.current !== null) window.clearTimeout(wTimerRef.current);
                    if (raw !== '') {
                      const num = Number(raw);
                      if (Number.isInteger(num) && num >= 8 && num <= 200) {
                        wTimerRef.current = window.setTimeout(() => {
                          commitDim('w', num);
                        }, 450);
                      }
                    }
                  }}
                  onBlur={() => {
                    if (wTimerRef.current !== null) window.clearTimeout(wTimerRef.current);
                    editingFieldRef.current = null;
                    const parsed = parseInt(widthInput, 10);
                    const finalVal = Number.isNaN(parsed) ? width : commitDim('w', parsed);
                    setWidthInput(String(finalVal));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.currentTarget as HTMLInputElement).blur();
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      const base = parseInt(widthInput, 10) || width;
                      const next = commitDim('w', base + (e.key === 'ArrowUp' ? 1 : -1));
                      setWidthInput(String(next));
                    }
                  }}
                  className="w-full h-8 px-2.5 rounded-lg border font-mono text-xs"
                  style={{
                    backgroundColor: 'var(--md-surface-container)',
                    borderColor: 'var(--md-outline-variant)',
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => updateConversionParams({ lockAspect: !lockAspect }, !lockAspect)}
                aria-label={lockAspect ? '解锁宽高比' : '锁定宽高比'}
                title={lockAspect ? '已锁定宽高比' : '自由拉伸宽高'}
                className="mt-4 w-8 h-8 rounded-full flex items-center justify-center gemini-tonal-btn"
                style={{
                  color: lockAspect ? 'var(--md-primary)' : 'var(--md-on-surface-variant)',
                }}
              >
                {lockAspect ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
              <label className="flex-1 text-xs">
                <span className="block text-[11px] mb-1" style={{ color: 'var(--md-on-surface-variant)' }}>
                  高 (8-200)
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="画布高度"
                  value={heightInput}
                  onFocus={() => {
                    editingFieldRef.current = 'h';
                  }}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!/^\d{0,3}$/.test(raw)) return;
                    setHeightInput(raw);
                    if (hTimerRef.current !== null) window.clearTimeout(hTimerRef.current);
                    if (raw !== '') {
                      const num = Number(raw);
                      if (Number.isInteger(num) && num >= 8 && num <= 200) {
                        hTimerRef.current = window.setTimeout(() => {
                          commitDim('h', num);
                        }, 450);
                      }
                    }
                  }}
                  onBlur={() => {
                    if (hTimerRef.current !== null) window.clearTimeout(hTimerRef.current);
                    editingFieldRef.current = null;
                    const parsed = parseInt(heightInput, 10);
                    const finalVal = Number.isNaN(parsed) ? height : commitDim('h', parsed);
                    setHeightInput(String(finalVal));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.currentTarget as HTMLInputElement).blur();
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      const base = parseInt(heightInput, 10) || height;
                      const next = commitDim('h', base + (e.key === 'ArrowUp' ? 1 : -1));
                      setHeightInput(String(next));
                    }
                  }}
                  className="w-full h-8 px-2.5 rounded-lg border font-mono text-xs"
                  style={{
                    backgroundColor: 'var(--md-surface-container)',
                    borderColor: 'var(--md-outline-variant)',
                  }}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Section 02: Conversion & Tuning */}
      <div className="rounded-xl p-2 flex flex-col gap-2 gemini-card">
        <AccordionHeader id="convert" num="02" title="转换与调校" />
        {openSection === 'convert' && (
          <div className="px-2 pb-2 flex flex-col gap-3">
            <div>
              <span className="block text-[11px] mb-1.5" style={{ color: 'var(--md-on-surface-variant)' }}>
                下采样转换算法
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {ALGORITHM_OPTIONS.map((opt) => {
                  const active = algorithm === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateConversionParams({ algorithm: opt.value as ConvertAlgorithm })}
                      className={`h-8 px-2.5 rounded-full text-xs font-medium transition-colors ${
                        opt.value === 'pixel-art' ? 'col-span-2' : ''
                      }`}
                      style={{
                        backgroundColor: active ? 'var(--md-primary)' : 'var(--md-surface-container)',
                        color: active ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="m3-callout m3-callout-info">
              <strong>
                {ALGORITHM_OPTIONS.find((o) => o.value === algorithm)?.label}
              </strong>
              ：{ALGORITHM_OPTIONS.find((o) => o.value === algorithm)?.description}
            </div>

            {algorithm === 'pixel-art' ? (
              <label className="text-xs">
                <div className="flex justify-between mb-1">
                  <span>边缘细线保护强度</span>
                  <span className="font-mono">{Math.round(strokeStrength * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={strokeStrength}
                  onChange={(e) =>
                    updateConversionParams({ strokeStrength: Number(e.target.value) })
                  }
                  className="w-full accent-[var(--md-primary)]"
                />
              </label>
            ) : (
              <>
                <div>
                  <span className="block text-[11px] mb-1" style={{ color: 'var(--md-on-surface-variant)' }}>
                    抖动算法 (Dithering)
                  </span>
                  <select
                    aria-label="抖动算法"
                    value={ditherMode}
                    onChange={(e) =>
                      updateConversionParams({ ditherMode: e.target.value as DitherMode })
                    }
                    className="w-full h-8 px-2.5 rounded-lg border text-xs"
                    style={{
                      backgroundColor: 'var(--md-surface-container)',
                      borderColor: 'var(--md-outline-variant)',
                    }}
                  >
                    {DITHER_MODE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
                    {DITHER_MODE_OPTIONS.find((o) => o.value === ditherMode)?.description}
                  </div>
                </div>

                {ditherMode !== 'none' && (
                  <label className="text-xs">
                    <div className="flex justify-between mb-1">
                      <span>抖动强度</span>
                      <span className="font-mono">{Math.round(ditherStrength * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={ditherStrength}
                      onChange={(e) =>
                        updateConversionParams({ ditherStrength: Number(e.target.value) })
                      }
                      className="w-full accent-[var(--md-primary)]"
                    />
                  </label>
                )}

                <label className="text-xs">
                  <div className="flex justify-between mb-1">
                    <span>亮度</span>
                    <span className="font-mono">{brightness.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    value={brightness}
                    onChange={(e) => updateConversionParams({ brightness: Number(e.target.value) })}
                    className="w-full accent-[var(--md-primary)]"
                  />
                </label>
                <label className="text-xs">
                  <div className="flex justify-between mb-1">
                    <span>对比度</span>
                    <span className="font-mono">{contrast.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    value={contrast}
                    onChange={(e) => updateConversionParams({ contrast: Number(e.target.value) })}
                    className="w-full accent-[var(--md-primary)]"
                  />
                </label>
                <label className="text-xs">
                  <div className="flex justify-between mb-1">
                    <span>饱和度</span>
                    <span className="font-mono">{saturation.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={saturation}
                    onChange={(e) => updateConversionParams({ saturation: Number(e.target.value) })}
                    className="w-full accent-[var(--md-primary)]"
                  />
                </label>

                {(brightness !== 1 || contrast !== 1 || saturation !== 1) && (
                  <button
                    type="button"
                    onClick={() =>
                      updateConversionParams({ brightness: 1, contrast: 1, saturation: 1 })
                    }
                    className="h-7 px-3 rounded-full text-xs flex items-center justify-center gap-1 gemini-tonal-btn"
                    style={{ color: 'var(--md-primary)' }}
                  >
                    <RotateCcw className="w-3 h-3" /> 重置色调参数
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Section 03: Brand & Display */}
      <div className="rounded-xl p-2 flex flex-col gap-2 gemini-card">
        <AccordionHeader id="brand" num="03" title="品牌与显示" />
        {openSection === 'brand' && (
          <div className="px-2 pb-2 flex flex-col gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>
                  拼豆品牌色卡 ({allPalettes.length} 套)
                </span>
                <button
                  type="button"
                  onClick={() => paletteInputRef.current?.click()}
                  className="text-[11px] font-medium hover:underline"
                  style={{ color: 'var(--md-primary)' }}
                >
                  + 导入色卡
                </button>
                <input
                  ref={paletteInputRef}
                  type="file"
                  accept=".json,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCustomPaletteUpload(f);
                    e.target.value = '';
                  }}
                />
              </div>
              <select
                aria-label="选择拼豆品牌色卡"
                value={brandId}
                onChange={(e) => switchBrand(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border text-xs"
                style={{
                  backgroundColor: 'var(--md-surface-container)',
                  borderColor: 'var(--md-outline-variant)',
                }}
              >
                {allPalettes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs mb-1.5" style={{ color: 'var(--md-on-surface-variant)' }}>
                颜色数量限缩（主色相筛选）
              </span>
              <div className="flex flex-wrap gap-1">
                {MAX_COLORS_PRESETS.map((n) => {
                  const active = maxColors === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateConversionParams({ maxColors: n })}
                      className="h-7 px-2.5 rounded-full font-mono text-[11px] border"
                      style={{
                        backgroundColor: active ? 'var(--md-primary)' : 'var(--md-surface-container)',
                        color: active ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                        borderColor: active ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                      }}
                    >
                      {n === 0 ? '全部' : `${n}色`}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-xs mb-1.5" style={{ color: 'var(--md-on-surface-variant)' }}>
                格间样式
              </span>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    ['gapped', '有缝'],
                    ['line', '单线'],
                    ['seamless', '无缝'],
                  ] as Array<[GridStyle, string]>
                ).map(([val, lbl]) => {
                  const active = gridStyle === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setGridStyle(val)}
                      className="h-7 rounded-full text-xs border"
                      style={{
                        backgroundColor: active ? 'var(--md-primary)' : 'var(--md-surface-container)',
                        color: active ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                        borderColor: active ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                      }}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>
                  参考分区线
                </span>
                <select
                  aria-label="参考线间隔"
                  value={guideInterval}
                  onChange={(e) => setGuideInterval(Number(e.target.value))}
                  className="h-7 px-2 rounded-lg border font-mono text-xs"
                  style={{
                    backgroundColor: 'var(--md-surface-container)',
                    borderColor: 'var(--md-outline-variant)',
                  }}
                >
                  <option value={0}>关闭</option>
                  <option value={5}>每 5 格</option>
                  <option value={10}>每 10 格</option>
                  <option value={15}>每 15 格</option>
                  <option value={20}>每 20 格</option>
                  <option value={25}>每 25 格</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {GUIDE_COLOR_OPTIONS.map((opt) => {
                  const active = guideColor === opt.value;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setGuideColor(opt.value)}
                      aria-label={`参考线颜色：${opt.label}`}
                      title={opt.label}
                      className="w-5 h-5 rounded-full border transition-transform"
                      style={{
                        backgroundColor: opt.value,
                        borderColor: active ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                        transform: active ? 'scale(1.2)' : 'scale(1)',
                        boxShadow: active ? '0 0 0 2px var(--md-primary)' : 'none',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span>显示四边坐标轴</span>
              <input
                type="checkbox"
                checked={showCoordinates}
                onChange={(e) => setShowCoordinates(e.target.checked)}
                className="accent-[var(--md-primary)] w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span>启用手动像素编辑</span>
              <input
                type="checkbox"
                checked={manualEditEnabled}
                onChange={(e) => setManualEditEnabled(e.target.checked)}
                className="accent-[var(--md-primary)] w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span>色差公式</span>
              <select
                aria-label="色差算法"
                value={metric}
                onChange={(e) =>
                  updateConversionParams({ metric: e.target.value as 'ciede2000' | 'cie76' })
                }
                className="h-7 px-2 rounded-lg border font-mono text-[11px]"
                style={{
                  backgroundColor: 'var(--md-surface-container)',
                  borderColor: 'var(--md-outline-variant)',
                }}
              >
                <option value="ciede2000">CIEDE2000 (推荐)</option>
                <option value="cie76">CIE76 (快速)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Section 04: Experience Settings */}
      <div className="rounded-xl p-2 flex flex-col gap-2 gemini-card">
        <AccordionHeader id="prefs" num="04" title="体验设置" />
        {openSection === 'prefs' && (
          <div className="px-2 pb-2 flex flex-col gap-3">
            <label className="text-xs">
              <div className="flex justify-between mb-1">
                <span>最大撤销步数</span>
                <span className="font-mono">{maxHistorySteps} 步</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={maxHistorySteps}
                onChange={(e) => setMaxHistorySteps(Number(e.target.value))}
                className="w-full accent-[var(--md-primary)]"
              />
            </label>

            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span>定时自动保存</span>
              <input
                type="checkbox"
                checked={autoSaveEnabled}
                onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                className="accent-[var(--md-primary)] w-4 h-4"
              />
            </label>

            <div className="flex items-center justify-between text-xs">
              <span>列坐标标注方式</span>
              <select
                aria-label="坐标标注方式"
                value={coordFormat}
                onChange={(e) => setCoordFormat(e.target.value as 'number' | 'alpha-col')}
                className="h-7 px-2 rounded-lg border font-mono text-[11px]"
                style={{
                  backgroundColor: 'var(--md-surface-container)',
                  borderColor: 'var(--md-outline-variant)',
                }}
              >
                <option value="number">数字 (1, 2, 3…)</option>
                <option value="alpha-col">字母列 (A, B, C…)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {pendingPreprocess && (
        <ImagePreprocessModal
          rawImage={pendingPreprocess.raw}
          initialCrop={pendingPreprocess.initialCrop}
          initialBoardSize={Math.max(width, height)}
          onCancel={() => {
            if (pendingPreprocess.isNewUpload) {
              URL.revokeObjectURL(pendingPreprocess.raw.url);
            }
            setPendingPreprocess(null);
          }}
          onConfirm={({ rgba, width: cw, height: ch, previewUrl, cropState, boardSize }) => {
            const { raw, isNewUpload } = pendingPreprocess;
            if (isNewUpload) {
              const isLikelyPixelArt =
                Math.max(cw, ch) <= 320 || raw.fileName.toLowerCase().endsWith('.png');
              if (!isLikelyPixelArt) {
                updateConversionParams({ algorithm: 'box-average' }, false);
              }
            }
            setSourceImage(
              {
                rgba,
                width: cw,
                height: ch,
                previewUrl,
                fileName: raw.fileName,
                raw,
                cropState,
              },
              true,
              boardSize,
            );
            setPendingPreprocess(null);
            onToast(`已载入 ${raw.fileName} (${cw}×${ch} px)`, 'success');
          }}
        />
      )}
    </aside>
  );
};
