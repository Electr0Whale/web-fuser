import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eraser,
  ImagePlus,
  Lock,
  SlidersHorizontal,
  Sparkles,
  Unlock,
  Upload,
} from 'lucide-react';
import { BUILTIN_PALETTES, parseCustomPaletteFile } from '../data/palettes';
import {
  CANVAS_SIZE_PRESETS,
  GUIDE_COLOR_OPTIONS,
  MAX_COLORS_PRESETS,
  useEditorStore,
  type GridStyle,
} from '../store/editorStore';

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

  const imgInputRef = useRef<HTMLInputElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);

  const width = useEditorStore((s) => s.pendingWidth);
  const height = useEditorStore((s) => s.pendingHeight);
  const lockAspect = useEditorStore((s) => s.lockAspect);
  const sourceImage = useEditorStore((s) => s.sourceImage);
  const convertDurationMs = useEditorStore((s) => s.convertDurationMs);
  const detectedBorderWidth = useEditorStore((s) => s.detectedBorderWidth);

  const algorithm = useEditorStore((s) => s.algorithm);
  const brightness = useEditorStore((s) => s.brightness);
  const contrast = useEditorStore((s) => s.contrast);
  const saturation = useEditorStore((s) => s.saturation);
  const dither = useEditorStore((s) => s.dither);
  const strokeStrength = useEditorStore((s) => s.strokeStrength);
  const detectBorder = useEditorStore((s) => s.detectBorder);
  const bgTolerance = useEditorStore((s) => s.bgTolerance);

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
      onToast('请上传 PNG、JPG 或 WebP 格式的本地图片。', 'warn');
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Heuristic default algorithm: small crisp images -> pixel-art, larger photos -> photo
        const isLikelyPixelArt =
          Math.max(img.naturalWidth, img.naturalHeight) <= 320 ||
          file.name.toLowerCase().endsWith('.png');
        if (!isLikelyPixelArt) {
          updateConversionParams({ algorithm: 'photo' }, false);
        }

        setSourceImage({
          rgba: imgData.data,
          width: img.naturalWidth,
          height: img.naturalHeight,
          previewUrl: url,
          fileName: file.name,
        });
        onToast(`已载入 ${file.name} (${img.naturalWidth}×${img.naturalHeight})`, 'success');
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
        borderColor: 'var(--md-outline-variant)',
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
        className="rounded-xl border p-3 flex flex-col gap-2.5 transition-colors"
        style={{
          backgroundColor: 'var(--md-surface)',
          borderColor: isDragging ? 'var(--md-primary)' : 'var(--md-outline-variant)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold flex items-center gap-1.5">
            <ImagePlus className="w-4 h-4" style={{ color: 'var(--md-primary)' }} />
            本地图片转图纸
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
          aria-label="选择或拖拽本地图片上传"
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
                PNG / JPG / WebP · 100% 本地运算
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
      <div
        className="rounded-xl border p-2 flex flex-col gap-2"
        style={{
          backgroundColor: 'var(--md-surface)',
          borderColor: 'var(--md-outline-variant)',
        }}
      >
        <AccordionHeader id="size" num="01" title="画布规格" />
        {openSection === 'size' && (
          <div className="px-2 pb-2 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-1.5">
              {CANVAS_SIZE_PRESETS.map((sz) => {
                const active = width === sz && height === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => {
                      if (sourceImage) {
                        updateConversionParams({ lockAspect: false, width: sz, height: sz });
                      } else {
                        setDimensions(sz, sz);
                      }
                    }}
                    className="h-7 rounded-full font-mono text-xs border transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--md-primary)' : 'var(--md-surface-container)',
                      color: active ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                      borderColor: active ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                    }}
                  >
                    {sz}×{sz}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <label className="flex-1 text-xs">
                <span className="block text-[11px] mb-1" style={{ color: 'var(--md-on-surface-variant)' }}>
                  宽 (8-200)
                </span>
                <input
                  type="number"
                  min={8}
                  max={200}
                  value={width}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 8;
                    if (sourceImage) updateConversionParams({ width: v });
                    else setDimensions(v, height);
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
                onClick={() => updateConversionParams({ lockAspect: !lockAspect }, false)}
                aria-label={lockAspect ? '解锁宽高比' : '锁定宽高比'}
                title={lockAspect ? '已锁定宽高比' : '自由拉伸宽高'}
                className="mt-4 w-8 h-8 rounded-full flex items-center justify-center border m3-hover"
                style={{
                  borderColor: 'var(--md-outline-variant)',
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
                  type="number"
                  min={8}
                  max={200}
                  value={height}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 8;
                    if (sourceImage) updateConversionParams({ height: v });
                    else setDimensions(width, v);
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
      <div
        className="rounded-xl border p-2 flex flex-col gap-2"
        style={{
          backgroundColor: 'var(--md-surface)',
          borderColor: 'var(--md-outline-variant)',
        }}
      >
        <AccordionHeader id="convert" num="02" title="转换与调校" />
        {openSection === 'convert' && (
          <div className="px-2 pb-2 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => updateConversionParams({ algorithm: 'pixel-art' })}
                className="h-8 rounded-full text-xs font-medium border flex items-center justify-center gap-1"
                style={{
                  backgroundColor:
                    algorithm === 'pixel-art' ? 'var(--md-primary)' : 'var(--md-surface-container)',
                  color:
                    algorithm === 'pixel-art' ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                  borderColor:
                    algorithm === 'pixel-art' ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                智能像素画
              </button>
              <button
                type="button"
                onClick={() => updateConversionParams({ algorithm: 'photo' })}
                className="h-8 rounded-full text-xs font-medium border flex items-center justify-center gap-1"
                style={{
                  backgroundColor:
                    algorithm === 'photo' ? 'var(--md-primary)' : 'var(--md-surface-container)',
                  color: algorithm === 'photo' ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                  borderColor:
                    algorithm === 'photo' ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                照片写实
              </button>
            </div>

            {algorithm === 'pixel-art' ? (
              <>
                <div className="m3-callout m3-callout-info">
                  <strong>轮廓骨架拓扑投影</strong>：保护 1px 细线与硬边缘，不产生模糊混色。
                  {detectedBorderWidth > 0 && (
                    <div className="mt-1 font-mono">已识别原图 {detectedBorderWidth}px 嵌套外框</div>
                  )}
                </div>
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
                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>自动识别并重建像素外框</span>
                  <input
                    type="checkbox"
                    checked={detectBorder}
                    onChange={(e) => updateConversionParams({ detectBorder: e.target.checked })}
                    className="accent-[var(--md-primary)] w-4 h-4"
                  />
                </label>
              </>
            ) : (
              <>
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
                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>Floyd–Steinberg 抖动</span>
                  <input
                    type="checkbox"
                    checked={dither}
                    onChange={(e) => updateConversionParams({ dither: e.target.checked })}
                    className="accent-[var(--md-primary)] w-4 h-4"
                  />
                </label>
              </>
            )}
          </div>
        )}
      </div>

      {/* Section 03: Brand & Display */}
      <div
        className="rounded-xl border p-2 flex flex-col gap-2"
        style={{
          backgroundColor: 'var(--md-surface)',
          borderColor: 'var(--md-outline-variant)',
        }}
      >
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
      <div
        className="rounded-xl border p-2 flex flex-col gap-2"
        style={{
          backgroundColor: 'var(--md-surface)',
          borderColor: 'var(--md-outline-variant)',
        }}
      >
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
              <span>定时自动保存到本地</span>
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
    </aside>
  );
};
