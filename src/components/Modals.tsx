import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import { computeBomStats } from '../core/editingTools';
import {
  exportFullZipBundle,
  exportProjectArchiveBlob,
  triggerBlobDownload,
} from '../exporters/archiveExporter';
import { exportBomHtmlBlob } from '../exporters/htmlExporter';
import { exportPatternToPdfBlob, type PdfLayoutMode } from '../exporters/pdfExporter';
import { exportPatternToPngBlob, renderPatternPngCanvas } from '../exporters/pngExporter';
import { exportPatternToSvgBlob } from '../exporters/svgExporter';
import { exportPatternToXlsxBlob } from '../exporters/xlsxExporter';
import {
  deleteProjectById,
  listSavedProjects,
  type ProjectSortField,
  type SavedProjectRecord,
} from '../storage/projectStorage';
import { useEditorStore } from '../store/editorStore';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  widthClass?: string;
  children: React.ReactNode;
}

const ModalShell: React.FC<ModalShellProps> = ({
  title,
  onClose,
  widthClass = 'max-w-2xl',
  children,
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    <div
      className={`w-full ${widthClass} max-h-[90vh] rounded-2xl gemini-modal flex flex-col overflow-hidden`}
      style={{
        color: 'var(--md-on-surface)',
      }}
    >
      <div
        className="px-5 py-3.5 border-b flex items-center justify-between shrink-0"
        style={{ borderColor: 'var(--md-outline-subtle)' }}
      >
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭弹窗"
          className="w-8 h-8 rounded-full flex items-center justify-center m3-hover"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5 overflow-y-auto flex-1">{children}</div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* 1. Export Modal                                                            */
/* -------------------------------------------------------------------------- */
export const ExportModal: React.FC<{
  onClose: () => void;
  onToast: (msg: string, tone?: 'info' | 'success' | 'warn' | 'danger') => void;
}> = ({ onClose, onToast }) => {
  const projectName = useEditorStore((s) => s.projectName);
  const brandId = useEditorStore((s) => s.brandId);
  const customPalettes = useEditorStore((s) => s.customPalettes);
  const getActivePalette = useEditorStore((s) => s.getActivePalette);
  const grid = useEditorStore((s) => s.grid);
  const width = useEditorStore((s) => s.width);
  const height = useEditorStore((s) => s.height);
  const gridStyle = useEditorStore((s) => s.gridStyle);
  const guideInterval = useEditorStore((s) => s.guideInterval);
  const guideColor = useEditorStore((s) => s.guideColor);
  const coordFormat = useEditorStore((s) => s.coordFormat);
  const sourceImage = useEditorStore((s) => s.sourceImage);

  const palette = useMemo(() => getActivePalette(), [brandId, customPalettes, getActivePalette]);

  const [includeBom, setIncludeBom] = useState(true);
  const [includeGuides, setIncludeGuides] = useState(true);
  const [includeCoordinates, setIncludeCoordinates] = useState(true);
  const [includeCodes, setIncludeCodes] = useState(true);
  const [pdfLayoutMode, setPdfLayoutMode] = useState<PdfLayoutMode>('tiled-5mm');
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [busy, setBusy] = useState(false);

  const previewDataUrl = useMemo(() => {
    const canvas = renderPatternPngCanvas({
      projectName,
      brandLabel: palette.label,
      grid,
      width,
      height,
      palette: palette.colors,
      includeBom,
      includeGuides,
      includeCoordinates,
      includeCodes,
      gridStyle,
      guideInterval,
      guideColor,
      coordFormat,
    });
    return canvas.toDataURL('image/png');
  }, [
    coordFormat,
    grid,
    gridStyle,
    guideColor,
    guideInterval,
    height,
    includeBom,
    includeCodes,
    includeCoordinates,
    includeGuides,
    palette.colors,
    palette.label,
    projectName,
    width,
  ]);

  const safeName = projectName.replace(/[\\/:*?"<>|]+/g, '_') || 'bead-pattern';

  const runAction = async (fn: () => Promise<void> | void, successMsg: string) => {
    try {
      setBusy(true);
      await fn();
      onToast(successMsg, 'success');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '导出失败', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="导出与下载拼豆图纸" onClose={onClose} widthClass="max-w-4xl">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* Left: Preview */}
        <div className="md:col-span-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">
              {compareOriginal && sourceImage ? '原始上传图片' : '1:1 导出效果预览'}
            </span>
            {sourceImage && (
              <button
                type="button"
                onClick={() => setCompareOriginal(!compareOriginal)}
                className="h-7 px-3 rounded-full text-xs font-medium border m3-hover"
                style={{
                  borderColor: 'var(--md-outline-variant)',
                  color: 'var(--md-primary)',
                }}
              >
                {compareOriginal ? '切回图纸预览' : '对比原图'}
              </button>
            )}
          </div>
          <div
            className="rounded-xl border p-3 flex items-center justify-center min-h-[280px] max-h-[420px] overflow-auto"
            style={{
              backgroundColor: 'var(--md-surface-container)',
              borderColor: 'var(--md-outline-variant)',
            }}
          >
            <img
              src={compareOriginal && sourceImage ? sourceImage.previewUrl : previewDataUrl}
              alt="图纸导出预览"
              className="max-w-full max-h-[380px] object-contain rounded-lg"
            />
          </div>
        </div>

        {/* Right: Options & Format Buttons */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <div
            className="rounded-xl border p-3 flex flex-col gap-2.5"
            style={{
              backgroundColor: 'var(--md-surface-container)',
              borderColor: 'var(--md-outline-variant)',
            }}
          >
            <div className="text-xs font-semibold">导出配置</div>
            {(
              [
                ['附加材料清单', includeBom, setIncludeBom],
                ['包含参考分区线', includeGuides, setIncludeGuides],
                ['包含四边坐标轴', includeCoordinates, setIncludeCoordinates],
                ['包含色号标注', includeCodes, setIncludeCodes],
              ] as const
            ).map(([label, val, setter]) => (
              <label key={label} className="flex items-center justify-between text-xs cursor-pointer">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={val}
                  onChange={(e) => setter(e.target.checked)}
                  className="accent-[var(--md-primary)] w-4 h-4"
                />
              </label>
            ))}

            <div className="pt-1 border-t" style={{ borderColor: 'var(--md-outline-variant)' }}>
              <span className="block text-xs mb-1.5" style={{ color: 'var(--md-on-surface-variant)' }}>
                A4 PDF 打印版式（导出 PDF 时生效）
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPdfLayoutMode('fit-page')}
                  className="h-7 rounded-full text-xs border"
                  style={{
                    backgroundColor:
                      pdfLayoutMode === 'fit-page' ? 'var(--md-primary)' : 'var(--md-surface)',
                    color:
                      pdfLayoutMode === 'fit-page' ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                    borderColor:
                      pdfLayoutMode === 'fit-page'
                        ? 'var(--md-primary)'
                        : 'var(--md-outline-variant)',
                  }}
                >
                  一页完整
                </button>
                <button
                  type="button"
                  onClick={() => setPdfLayoutMode('tiled-5mm')}
                  className="h-7 rounded-full text-xs border"
                  style={{
                    backgroundColor:
                      pdfLayoutMode === 'tiled-5mm' ? 'var(--md-primary)' : 'var(--md-surface)',
                    color:
                      pdfLayoutMode === 'tiled-5mm' ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                    borderColor:
                      pdfLayoutMode === 'tiled-5mm'
                        ? 'var(--md-primary)'
                        : 'var(--md-outline-variant)',
                  }}
                >
                  5mm 分区分页
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {/* Primary blue CTA: PNG */}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  const blob = await exportPatternToPngBlob({
                    projectName,
                    brandLabel: palette.label,
                    grid,
                    width,
                    height,
                    palette: palette.colors,
                    includeBom,
                    includeGuides,
                    includeCoordinates,
                    includeCodes,
                    gridStyle,
                    guideInterval,
                    guideColor,
                    coordFormat,
                  });
                  triggerBlobDownload(blob, `${safeName}.png`);
                }, '已导出高清 PNG 图纸')
              }
              className="w-full h-10 px-4 rounded-full text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--md-primary)',
                color: 'var(--md-on-primary)',
              }}
            >
              <ImageIcon className="w-4 h-4" />
              <span>导出 PNG 高清图</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              {/* PDF occupies PNG's original first slot */}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(() => {
                    const { blob, pageCount } = exportPatternToPdfBlob({
                      projectName,
                      brandLabel: palette.label,
                      grid,
                      width,
                      height,
                      palette: palette.colors,
                      layoutMode: pdfLayoutMode,
                      includeGuides,
                      includeCoordinates,
                      includeCodes,
                      guideInterval,
                      guideColor,
                      coordFormat,
                    });
                    triggerBlobDownload(blob, `${safeName}.pdf`);
                    onToast(`已导出 A4 PDF（共 ${pageCount} 页）`, 'success');
                  }, 'PDF 生成完毕')
                }
                className="h-9 px-3 rounded-full text-xs font-medium border flex items-center justify-center gap-1.5 m3-hover"
                style={{ borderColor: 'var(--md-outline-variant)' }}
              >
                <FileText className="w-3.5 h-3.5" /> PDF 打印版
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(() => {
                    const blob = exportPatternToSvgBlob({
                      projectName,
                      brandLabel: palette.label,
                      grid,
                      width,
                      height,
                      palette: palette.colors,
                      includeBom,
                      includeGuides,
                      includeCoordinates,
                      includeCodes,
                      guideInterval,
                      guideColor,
                      coordFormat,
                    });
                    triggerBlobDownload(blob, `${safeName}.svg`);
                  }, '已导出 SVG 矢量图')
                }
                className="h-9 px-3 rounded-full text-xs font-medium border flex items-center justify-center gap-1.5 m3-hover"
                style={{ borderColor: 'var(--md-outline-variant)' }}
              >
                <FileCode2 className="w-3.5 h-3.5" /> SVG 矢量
              </button>

              {/* ZIP demoted to small secondary button */}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    const blob = await exportFullZipBundle({
                      projectName,
                      brandId,
                      brandLabel: palette.label,
                      grid,
                      width,
                      height,
                      palette: palette.colors,
                      includeBom,
                      includeGuides,
                      includeCoordinates,
                      includeCodes,
                      gridStyle,
                      guideInterval,
                      guideColor,
                      coordFormat,
                      pdfLayoutMode,
                    });
                    triggerBlobDownload(blob, `${safeName}-全套图纸包.zip`);
                  }, '已打包生成 ZIP（含 PNG/SVG/PDF/XLSX/HTML/JSON）')
                }
                className="h-9 px-3 rounded-full text-xs font-medium border flex items-center justify-center gap-1.5 m3-hover"
                style={{ borderColor: 'var(--md-outline-variant)' }}
              >
                <Archive className="w-3.5 h-3.5" /> 打包下载 (ZIP)
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(() => {
                    const blob = exportPatternToXlsxBlob({
                      projectName,
                      brandLabel: palette.label,
                      grid,
                      width,
                      height,
                      palette: palette.colors,
                      coordFormat,
                    });
                    triggerBlobDownload(blob, `${safeName}.xlsx`);
                  }, '已导出 Excel 表格 (XLSX)')
                }
                className="h-9 px-3 rounded-full text-xs font-medium border flex items-center justify-center gap-1.5 m3-hover"
                style={{ borderColor: 'var(--md-outline-variant)' }}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> XLSX 表格
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(() => {
                    const blob = exportBomHtmlBlob({
                      projectName,
                      brandLabel: palette.label,
                      grid,
                      width,
                      height,
                      palette: palette.colors,
                    });
                    triggerBlobDownload(blob, `${safeName}-材料清单.html`);
                  }, '已导出交互式 HTML 核对清单')
                }
                className="h-9 px-3 rounded-full text-xs font-medium border flex items-center justify-center gap-1.5 m3-hover"
                style={{ borderColor: 'var(--md-outline-variant)' }}
              >
                <Download className="w-3.5 h-3.5" /> HTML 清单
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(() => {
                    const blob = exportProjectArchiveBlob({
                      name: projectName,
                      brandId,
                      brandLabel: palette.label,
                      width,
                      height,
                      grid,
                    });
                    triggerBlobDownload(blob, `${safeName}.ddp.json`);
                  }, '已导出工程存档 (.ddp.json)')
                }
                className="h-9 px-3 rounded-full text-xs font-medium border flex items-center justify-center gap-1.5 m3-hover"
                style={{ borderColor: 'var(--md-outline-variant)' }}
              >
                <FileJson className="w-3.5 h-3.5" /> JSON/DDP
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                const win = window.open('', '_blank');
                if (!win) return;
                win.document.write(
                  `<img src="${previewDataUrl}" style="max-width:100%;" onload="window.print()" />`,
                );
                win.document.close();
              }}
              className="h-8 px-3 rounded-full text-xs font-medium border flex items-center justify-center gap-1.5 m3-hover"
              style={{
                borderColor: 'var(--md-outline-variant)',
                color: 'var(--md-on-surface-variant)',
              }}
            >
              <Printer className="w-3.5 h-3.5" /> 调用浏览器直接打印
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. Full Palette Picker Modal & Replace Color Modal                         */
/* -------------------------------------------------------------------------- */
export const PalettePickerModal: React.FC<{
  mode: 'pick-brush' | { replaceFromIndex: number };
  onClose: () => void;
  onToast: (msg: string, tone?: 'info' | 'success' | 'warn' | 'danger') => void;
}> = ({ mode, onClose, onToast }) => {
  const brandId = useEditorStore((s) => s.brandId);
  const customPalettes = useEditorStore((s) => s.customPalettes);
  const getActivePalette = useEditorStore((s) => s.getActivePalette);
  const activeColorIndex = useEditorStore((s) => s.activeColorIndex);
  const setActiveColorIndex = useEditorStore((s) => s.setActiveColorIndex);
  const replaceColor = useEditorStore((s) => s.replaceColor);

  const palette = useMemo(() => getActivePalette(), [brandId, customPalettes, getActivePalette]);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('ALL');

  const groups = useMemo(() => {
    const set = new Set<string>();
    palette.colors.forEach((c) => {
      if (c.group) set.add(c.group);
    });
    return ['ALL', ...Array.from(set)];
  }, [palette.colors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return palette.colors
      .map((color, index) => ({ color, index }))
      .filter(({ color }) => {
        if (group !== 'ALL' && color.group !== group) return false;
        if (!q) return true;
        return (
          color.code.toLowerCase().includes(q) ||
          color.name.toLowerCase().includes(q) ||
          color.hex.toLowerCase().includes(q)
        );
      });
  }, [group, palette.colors, search]);

  const isReplace = typeof mode === 'object';
  const fromColor = isReplace ? palette.colors[mode.replaceFromIndex] : null;

  return (
    <ModalShell
      title={
        isReplace
          ? `全局替换色号：${fromColor?.code ?? ''} (${fromColor?.name ?? ''})`
          : `全色卡库 · ${palette.label}`
      }
      onClose={onClose}
      widthClass="max-w-3xl"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索色号、名称或 #HEX（如 A1 / 浅黄 / #FAF5CD）…"
            className="flex-1 min-w-[200px] h-9 px-4 rounded-full border text-sm"
            style={{
              backgroundColor: 'var(--md-surface-container)',
              borderColor: 'var(--md-outline-variant)',
            }}
          />
          {isReplace && (
            <button
              type="button"
              onClick={() => {
                replaceColor(mode.replaceFromIndex, -1);
                onToast(`已将 ${fromColor?.code} 全局替换为空位`, 'success');
                onClose();
              }}
              className="h-9 px-4 rounded-full text-xs font-medium border m3-hover"
              style={{
                borderColor: 'var(--md-outline-variant)',
                color: 'var(--md-danger-fg)',
              }}
            >
              全部清空为空位
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className="h-7 px-2.5 rounded-full font-mono text-xs border"
              style={{
                backgroundColor: group === g ? 'var(--md-primary)' : 'var(--md-surface-container)',
                color: group === g ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                borderColor: group === g ? 'var(--md-primary)' : 'var(--md-outline-variant)',
              }}
            >
              {g === 'ALL' ? '全部色系' : g}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2 max-h-[52vh] overflow-y-auto pr-1">
          {filtered.map(({ color, index }) => {
            const selected = !isReplace && index === activeColorIndex;
            return (
              <button
                key={color.code}
                type="button"
                onClick={() => {
                  if (isReplace) {
                    replaceColor(mode.replaceFromIndex, index);
                    onToast(`已将 ${fromColor?.code} 全局替换为 ${color.code}`, 'success');
                  } else {
                    setActiveColorIndex(index);
                  }
                  onClose();
                }}
                className="rounded-xl p-2 border flex items-center gap-2 text-left m3-hover"
                style={{
                  backgroundColor: selected ? 'var(--md-primary-container)' : 'var(--md-surface)',
                  borderColor: selected ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                }}
              >
                <span
                  className="w-6 h-6 rounded-md border shrink-0"
                  style={{
                    backgroundColor: color.hex,
                    borderColor: 'var(--md-outline-variant)',
                  }}
                />
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold truncate">{color.code}</div>
                  <div className="text-[10px] truncate" style={{ color: 'var(--md-on-surface-variant)' }}>
                    {color.name}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. Color Stats Modal                                                       */
/* -------------------------------------------------------------------------- */
export const StatsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const grid = useEditorStore((s) => s.grid);
  const width = useEditorStore((s) => s.width);
  const height = useEditorStore((s) => s.height);
  const brandId = useEditorStore((s) => s.brandId);
  const customPalettes = useEditorStore((s) => s.customPalettes);
  const getActivePalette = useEditorStore((s) => s.getActivePalette);

  const palette = useMemo(() => getActivePalette(), [brandId, customPalettes, getActivePalette]);
  const bom = useMemo(() => computeBomStats(grid, palette.colors), [grid, palette.colors]);

  const miniCmW = (width * 0.26).toFixed(1);
  const miniCmH = (height * 0.26).toFixed(1);
  const midiCmW = (width * 0.5).toFixed(1);
  const midiCmH = (height * 0.5).toFixed(1);
  const boards29 = Math.ceil(width / 29) * Math.ceil(height / 29);

  return (
    <ModalShell title="图纸规格与用色分布统计" onClose={onClose} widthClass="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div
            className="rounded-xl p-3 border"
            style={{
              backgroundColor: 'var(--md-surface-container)',
              borderColor: 'var(--md-outline-variant)',
            }}
          >
            <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
              网格规格
            </div>
            <div className="font-mono text-base font-semibold">
              {width}×{height}
            </div>
          </div>
          <div
            className="rounded-xl p-3 border"
            style={{
              backgroundColor: 'var(--md-surface-container)',
              borderColor: 'var(--md-outline-variant)',
            }}
          >
            <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
              总豆数 / 色数
            </div>
            <div className="font-mono text-base font-semibold">
              {bom.filledCount} / {bom.entries.length}
            </div>
          </div>
          <div
            className="rounded-xl p-3 border"
            style={{
              backgroundColor: 'var(--md-surface-container)',
              borderColor: 'var(--md-outline-variant)',
            }}
          >
            <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
              2.6mm 小豆成品
            </div>
            <div className="font-mono text-sm font-semibold">
              {miniCmW}×{miniCmH} cm
            </div>
          </div>
          <div
            className="rounded-xl p-3 border"
            style={{
              backgroundColor: 'var(--md-surface-container)',
              borderColor: 'var(--md-outline-variant)',
            }}
          >
            <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
              5mm 标准豆 / 29格板
            </div>
            <div className="font-mono text-sm font-semibold">
              {midiCmW}×{midiCmH} cm ({boards29}块)
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto pr-1">
          {bom.entries.map((entry) => (
            <div key={entry.color.code} className="flex items-center gap-3 text-xs">
              <span
                className="w-5 h-5 rounded-md border shrink-0"
                style={{
                  backgroundColor: entry.color.hex,
                  borderColor: 'var(--md-outline-variant)',
                }}
              />
              <span className="font-mono font-semibold w-12 shrink-0">{entry.color.code}</span>
              <span className="w-20 truncate shrink-0">{entry.color.name}</span>
              <div
                className="flex-1 h-2.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--md-surface-container-high)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, entry.ratio * 100)}%`,
                    backgroundColor: entry.color.hex,
                  }}
                />
              </div>
              <span className="font-mono w-20 text-right shrink-0">
                {entry.count} ({(entry.ratio * 100).toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. Project Storage Modal (50 local slots)                                  */
/* -------------------------------------------------------------------------- */
export const ProjectStorageModal: React.FC<{
  onClose: () => void;
  onToast: (msg: string, tone?: 'info' | 'success' | 'warn' | 'danger') => void;
}> = ({ onClose, onToast }) => {
  const [sortBy, setSortBy] = useState<ProjectSortField>('updatedAt');
  const [projects, setProjects] = useState<SavedProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const loadPatternIntoEditor = useEditorStore((s) => s.loadPatternIntoEditor);

  const refresh = async (sortField: ProjectSortField) => {
    setLoading(true);
    const list = await listSavedProjects(sortField);
    setProjects(list);
    setLoading(false);
  };

  useEffect(() => {
    void refresh(sortBy);
  }, [sortBy]);

  return (
    <ModalShell title="已保存的工程槽位（最多 50 个）" onClose={onClose} widthClass="max-w-3xl">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>
            共 {projects.length} / 50 个工程（存储于浏览器 IndexedDB）
          </span>
          <select
            aria-label="排序方式"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ProjectSortField)}
            className="h-8 px-3 rounded-full border text-xs"
            style={{
              backgroundColor: 'var(--md-surface-container)',
              borderColor: 'var(--md-outline-variant)',
            }}
          >
            <option value="updatedAt">按最近编辑</option>
            <option value="createdAt">按创建时间</option>
            <option value="name">按名称排序</option>
          </select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>
            正在读取工程…
          </div>
        ) : projects.length === 0 ? (
          <div className="m3-callout m3-callout-info">
            暂无已保存的工程。点击顶部栏的 <strong>保存</strong> 即可将当前图纸存入槽位。
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
            {projects.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border p-3 flex items-center gap-3"
                style={{
                  backgroundColor: 'var(--md-surface-container)',
                  borderColor: 'var(--md-outline-variant)',
                }}
              >
                {p.thumbnailDataUrl ? (
                  <img
                    src={p.thumbnailDataUrl}
                    alt={p.name}
                    className="w-14 h-14 rounded-lg border object-contain shrink-0"
                    style={{
                      backgroundColor: 'var(--md-surface)',
                      borderColor: 'var(--md-outline-variant)',
                      imageRendering: 'pixelated',
                    }}
                  />
                ) : (
                  <div
                    className="w-14 h-14 rounded-lg border shrink-0"
                    style={{ borderColor: 'var(--md-outline-variant)' }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                  <div className="font-mono text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
                    {p.width}×{p.height} · {p.beadCount} 颗 · {p.brandId}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
                    {new Date(p.updatedAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      loadPatternIntoEditor({
                        projectId: p.id,
                        projectName: p.name,
                        brandId: p.brandId,
                        width: p.width,
                        height: p.height,
                        grid: Int16Array.from(p.grid),
                      });
                      onToast(`已读取工程：${p.name}`, 'success');
                      onClose();
                    }}
                    className="h-7 px-3 rounded-full text-xs font-medium flex items-center gap-1"
                    style={{
                      backgroundColor: 'var(--md-primary)',
                      color: 'var(--md-on-primary)',
                    }}
                  >
                    <Check className="w-3 h-3" /> 打开
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteProjectById(p.id);
                      await refresh(sortBy);
                      onToast(`已删除工程：${p.name}`, 'info');
                    }}
                    aria-label={`删除工程 ${p.name}`}
                    className="h-7 px-3 rounded-full text-xs border flex items-center justify-center gap-1 m3-hover"
                    style={{
                      borderColor: 'var(--md-outline-variant)',
                      color: 'var(--md-danger-fg)',
                    }}
                  >
                    <Trash2 className="w-3 h-3" /> 删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
};

/* -------------------------------------------------------------------------- */
/* 5. New Canvas Confirm & Shortcuts Help                                     */
/* -------------------------------------------------------------------------- */
export const NewCanvasConfirmModal: React.FC<{
  onClose: () => void;
  onConfirm: () => void;
}> = ({ onClose, onConfirm }) => (
  <ModalShell title="确认新建空白图纸" onClose={onClose} widthClass="max-w-md">
    <div className="flex flex-col gap-4">
      <div className="m3-callout m3-callout-warn">
        <strong>注意</strong>：当前画布有尚未保存的修改。新建空白画布将清空当前工作区内容，建议先点击 <strong>保存</strong> 或 <strong>导出</strong>。
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-4 rounded-full text-xs font-medium border m3-hover"
          style={{ borderColor: 'var(--md-outline-variant)' }}
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="h-9 px-4 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: 'var(--md-danger-fg)',
            color: '#FFFFFF',
          }}
        >
          清空并新建
        </button>
      </div>
    </div>
  </ModalShell>
);

const OPEN_SOURCE_CREDITS: Array<{
  category: string;
  items: Array<{ name: string; url: string; desc: string }>;
}> = [
  {
    category: '拼豆色卡数据',
    items: [
      {
        name: 'HansBug/pindou-color-data',
        url: 'https://github.com/HansBug/pindou-color-data',
        desc: 'MARD、优肯 Artkal、COCO、漫漫、咪小窝、盼盼色卡数据',
      },
      {
        name: 'maxcleme/beadcolors',
        url: 'https://github.com/maxcleme/beadcolors',
        desc: 'Hama Midi 与 Perler 国际色卡数据',
      },
    ],
  },
  {
    category: '开源框架与依赖库',
    items: [
      { name: 'React', url: 'https://github.com/facebook/react', desc: 'UI 组件框架 (MIT)' },
      { name: 'Vite', url: 'https://github.com/vitejs/vite', desc: '前端构建与开发工具 (MIT)' },
      { name: 'Tailwind CSS', url: 'https://github.com/tailwindlabs/tailwindcss', desc: '原子化样式框架 (MIT)' },
      { name: 'Zustand', url: 'https://github.com/pmndrs/zustand', desc: '轻量状态管理 (MIT)' },
      { name: 'Lucide', url: 'https://github.com/lucide-icons/lucide', desc: '开源矢量图标库 (ISC)' },
      { name: 'jsPDF', url: 'https://github.com/parallax/jsPDF', desc: 'PDF 排版与生成 (MIT)' },
      { name: 'SheetJS (xlsx)', url: 'https://github.com/SheetJS/sheetjs', desc: 'Excel 表格读写 (Apache-2.0)' },
      { name: 'JSZip', url: 'https://github.com/Stuk/jszip', desc: 'ZIP 归档打包 (MIT / GPLv3)' },
    ],
  },
];

export const ShortcutsHelpModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [showCredits, setShowCredits] = useState(false);

  return (
    <ModalShell title="快捷键与操作指南" onClose={onClose} widthClass="max-w-lg">
      <div className="flex flex-col gap-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          {[
            ['Q', '画笔工具（支持拖动连线）'],
            ['W', '橡皮擦'],
            ['E', '取色器（吸取后自动切回画笔）'],
            ['G', '油漆桶连通填充'],
            ['L / R', '直线 / 矩形绘制'],
            ['V / 按住空格', '拖拽平移画布'],
            ['A', '显示 / 隐藏 # 色号'],
            ['滚轮 / + -', '缩放画布 (10%–400%)'],
            ['Ctrl + Z', '撤销上一步'],
            ['Ctrl + Y / Shift+Z', '重做'],
          ].map(([k, desc]) => (
            <div
              key={k}
              className="rounded-lg p-2 border flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--md-surface-container)',
                borderColor: 'var(--md-outline-variant)',
              }}
            >
              <span className="font-mono font-semibold" style={{ color: 'var(--md-primary)' }}>
                {k}
              </span>
              <span className="text-right" style={{ color: 'var(--md-on-surface-variant)' }}>
                {desc}
              </span>
            </div>
          ))}
        </div>

        {/* Default-collapsed Open Source Credits dropdown */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: 'var(--md-surface-container)',
            borderColor: 'var(--md-outline-variant)',
          }}
        >
          <button
            type="button"
            onClick={() => setShowCredits((v) => !v)}
            aria-expanded={showCredits}
            className="w-full px-3 py-2.5 flex items-center justify-between text-xs font-medium m3-hover"
            style={{ color: 'var(--md-on-surface)' }}
          >
            <span>开源项目与数据致谢</span>
            {showCredits ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          {showCredits && (
            <div
              className="px-3 pb-3 pt-2 border-t flex flex-col gap-3 max-h-56 overflow-y-auto"
              style={{ borderColor: 'var(--md-outline-subtle)' }}
            >
              {OPEN_SOURCE_CREDITS.map((group) => (
                <div key={group.category} className="flex flex-col gap-1.5">
                  <div
                    className="text-[11px] font-semibold"
                    style={{ color: 'var(--md-on-surface-variant)' }}
                  >
                    {group.category}
                  </div>
                  {group.items.map((item) => (
                    <a
                      key={item.name}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 m3-hover"
                      style={{ backgroundColor: 'var(--md-surface)' }}
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-semibold truncate" style={{ color: 'var(--md-primary)' }}>
                          {item.name}
                        </div>
                        <div className="text-[11px] truncate" style={{ color: 'var(--md-on-surface-variant)' }}>
                          {item.desc}
                        </div>
                      </div>
                      <ExternalLink
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: 'var(--md-on-surface-variant)' }}
                      />
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
};
