import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Download,
  Eye,
  EyeOff,
  Merge,
  Plus,
  Replace,
  Sparkles,
} from 'lucide-react';
import { findNearestPaletteIndex, hexToRgb } from '../core/colorSpace';
import { computeBomStats } from '../core/editingTools';
import { THEME_SWATCH_PRESETS } from '../data/palettes';
import { useEditorStore } from '../store/editorStore';

interface RightBomPanelProps {
  onOpenPalettePicker: () => void;
  onOpenReplaceColor: (fromColorIndex: number) => void;
  onOpenStats: () => void;
  onOpenExport: () => void;
  onToast: (msg: string, tone?: 'info' | 'success' | 'warn' | 'danger') => void;
  fullWidth?: boolean;
}

export const RightBomPanel: React.FC<RightBomPanelProps> = ({
  onOpenPalettePicker,
  onOpenReplaceColor,
  onOpenStats,
  onOpenExport,
  onToast,
  fullWidth = false,
}) => {
  const grid = useEditorStore((s) => s.grid);
  const brandId = useEditorStore((s) => s.brandId);
  const customPalettes = useEditorStore((s) => s.customPalettes);
  const getActivePalette = useEditorStore((s) => s.getActivePalette);
  const activeColorIndex = useEditorStore((s) => s.activeColorIndex);
  const highlightColorIndex = useEditorStore((s) => s.highlightColorIndex);
  const metric = useEditorStore((s) => s.metric);

  const setActiveColorIndex = useEditorStore((s) => s.setActiveColorIndex);
  const setHighlightColorIndex = useEditorStore((s) => s.setHighlightColorIndex);
  const mergeRareColors = useEditorStore((s) => s.mergeRareColors);

  const [selectedPresetId, setSelectedPresetId] = useState(THEME_SWATCH_PRESETS[0].id);
  const [mergeThreshold, setMergeThreshold] = useState(5);

  const palette = useMemo(() => getActivePalette(), [brandId, customPalettes, getActivePalette]);
  const bom = useMemo(() => computeBomStats(grid, palette.colors), [grid, palette.colors]);
  const activeBead = palette.colors[activeColorIndex] ?? palette.colors[0];

  const activePreset =
    THEME_SWATCH_PRESETS.find((t) => t.id === selectedPresetId) ?? THEME_SWATCH_PRESETS[0];

  const fillPct = bom.totalCells > 0 ? Math.round((bom.filledCount / bom.totalCells) * 100) : 0;

  return (
    <aside
      className={`${fullWidth ? 'w-full' : 'w-[296px]'} shrink-0 h-full overflow-hidden border-l flex flex-col`}
      style={{
        backgroundColor: 'var(--md-surface-container)',
        borderColor: 'var(--md-outline-variant)',
      }}
    >
      {/* Top summary card */}
      <div className="p-3 pb-2 shrink-0 flex flex-col gap-2.5">
        <div
          className="rounded-xl border p-3 flex flex-col gap-2"
          style={{
            backgroundColor: 'var(--md-surface-container-high)',
            borderColor: 'var(--md-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">图纸统计</span>
            <button
              type="button"
              onClick={onOpenStats}
              aria-label="查看详细颜色统计"
              className="text-[11px] font-medium flex items-center gap-1 hover:underline"
              style={{ color: 'var(--md-primary)' }}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              详细统计
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div
              className="rounded-lg px-2.5 py-1.5 border"
              style={{
                backgroundColor: 'var(--md-surface)',
                borderColor: 'var(--md-outline-variant)',
              }}
            >
              <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
                使用色号
              </div>
              <div className="font-mono text-base font-semibold">
                {bom.entries.length} <span className="text-xs font-normal">色</span>
              </div>
            </div>
            <div
              className="rounded-lg px-2.5 py-1.5 border"
              style={{
                backgroundColor: 'var(--md-surface)',
                borderColor: 'var(--md-outline-variant)',
              }}
            >
              <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
                总豆子颗数
              </div>
              <div className="font-mono text-base font-semibold">
                {bom.filledCount} <span className="text-xs font-normal">颗</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span style={{ color: 'var(--md-on-surface-variant)' }}>
                已填充 {bom.filledCount} / {bom.totalCells} 格
              </span>
              <span className="font-mono font-medium">{fillPct}%</span>
            </div>
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--md-surface)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${fillPct}%`,
                  backgroundColor: 'var(--md-primary)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Active Brush Color & Quick Theme Swatches */}
        <div
          className="rounded-xl border p-2.5 flex flex-col gap-2"
          style={{
            backgroundColor: 'var(--md-surface)',
            borderColor: 'var(--md-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-6 h-6 rounded-lg border shrink-0"
                style={{
                  backgroundColor: activeBead?.hex ?? '#FFFFFF',
                  borderColor: 'var(--md-outline-variant)',
                }}
              />
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">
                  当前画笔：<span className="font-mono font-semibold">{activeBead?.code}</span>
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--md-on-surface-variant)' }}>
                  {activeBead?.name} · {activeBead?.hex}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenPalettePicker}
              className="h-7 px-2.5 rounded-full text-xs font-medium border flex items-center gap-1 shrink-0 m3-hover"
              style={{
                borderColor: 'var(--md-outline-variant)',
                color: 'var(--md-primary)',
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              全色卡
            </button>
          </div>

          <div className="pt-1 border-t" style={{ borderColor: 'var(--md-surface-container-high)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--md-on-surface-variant)' }}>
                <Sparkles className="w-3 h-3" /> 精选主题色板
              </span>
              <select
                aria-label="选择主题快捷色板"
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className="h-6 px-2 rounded-full border text-[11px]"
                style={{
                  backgroundColor: 'var(--md-surface-container)',
                  borderColor: 'var(--md-outline-variant)',
                }}
              >
                {THEME_SWATCH_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-1">
              {activePreset.hexes.map((hex) => {
                const [r, g, b] = hexToRgb(hex);
                const matchedIdx = findNearestPaletteIndex(r, g, b, palette.colors, metric);
                const matched = palette.colors[matchedIdx];
                const isActive = matchedIdx === activeColorIndex;
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setActiveColorIndex(matchedIdx)}
                    aria-label={`选择主题色 ${matched?.code ?? hex}`}
                    title={`${matched?.code} ${matched?.name} (${matched?.hex})`}
                    className="w-6 h-6 rounded-full border transition-transform"
                    style={{
                      backgroundColor: matched?.hex ?? hex,
                      borderColor: isActive ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                      transform: isActive ? 'scale(1.18)' : 'scale(1)',
                      boxShadow: isActive ? '0 0 0 2px var(--md-primary)' : 'none',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Descending BOM List */}
      <div className="flex-1 min-h-0 px-3 flex flex-col">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-xs font-semibold">材料清单 (降序)</span>
          {highlightColorIndex !== null && (
            <button
              type="button"
              onClick={() => setHighlightColorIndex(null)}
              className="text-[11px] font-medium hover:underline"
              style={{ color: 'var(--md-primary)' }}
            >
              取消单色高亮
            </button>
          )}
        </div>

        <div
          className="flex-1 overflow-y-auto rounded-xl border p-1.5 flex flex-col gap-1"
          style={{
            backgroundColor: 'var(--md-surface)',
            borderColor: 'var(--md-outline-variant)',
          }}
        >
          {bom.entries.length === 0 ? (
            <div
              className="h-full flex flex-col items-center justify-center text-center p-4 text-xs"
              style={{ color: 'var(--md-on-surface-variant)' }}
            >
              <p className="font-medium mb-1">画布暂未放置豆子</p>
              <p>在左侧上传本地图片，或使用画笔在画布中直接绘制。</p>
            </div>
          ) : (
            bom.entries.map((entry) => {
              const isSelected = activeColorIndex === entry.paletteIndex;
              const isHighlighted = highlightColorIndex === entry.paletteIndex;
              return (
                <div
                  key={entry.color.code}
                  className="group rounded-lg px-2 py-1.5 flex items-center justify-between gap-2 border transition-colors"
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--md-primary-container)'
                      : 'transparent',
                    borderColor: isSelected ? 'var(--md-primary)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveColorIndex(entry.paletteIndex)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    title={`选中 ${entry.color.code} ${entry.color.name} 为画笔`}
                  >
                    <span
                      className="w-5 h-5 rounded-md border shrink-0"
                      style={{
                        backgroundColor: entry.color.hex,
                        borderColor: 'var(--md-outline-variant)',
                      }}
                    />
                    <span className="font-mono text-xs font-semibold shrink-0 w-11">
                      {entry.color.code}
                    </span>
                    <span
                      className="text-xs truncate"
                      style={{
                        color: isSelected
                          ? 'var(--md-on-primary-container)'
                          : 'var(--md-on-surface-variant)',
                      }}
                    >
                      {entry.color.name}
                    </span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-mono text-xs font-medium mr-1">{entry.count}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setHighlightColorIndex(isHighlighted ? null : entry.paletteIndex)
                      }
                      aria-label={
                        isHighlighted
                          ? `取消高亮色号 ${entry.color.code}`
                          : `单色高亮色号 ${entry.color.code}`
                      }
                      title="单色高亮/隔离"
                      className="w-6 h-6 rounded-full flex items-center justify-center m3-hover"
                      style={{
                        color: isHighlighted ? 'var(--md-primary)' : 'var(--md-on-surface-variant)',
                        backgroundColor: isHighlighted ? 'var(--md-info-bg)' : 'transparent',
                      }}
                    >
                      {isHighlighted ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 opacity-60" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenReplaceColor(entry.paletteIndex)}
                      aria-label={`全局替换色号 ${entry.color.code}`}
                      title="全局替换此颜色"
                      className="w-6 h-6 rounded-full flex items-center justify-center m3-hover"
                      style={{ color: 'var(--md-on-surface-variant)' }}
                    >
                      <Replace className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="p-3 pt-2 shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={bom.entries.length < 2}
            onClick={() => {
              const res = mergeRareColors(mergeThreshold);
              if (res.mergedColorCount > 0) {
                onToast(
                  `已将 ${res.mergedColorCount} 种少于 ${mergeThreshold} 颗的杂色合并（共调整 ${res.changedCells} 格）`,
                  'success',
                );
              } else {
                onToast(`当前没有少于 ${mergeThreshold} 颗的杂色需要合并。`, 'info');
              }
            }}
            className="flex-1 h-8 px-3 rounded-full text-xs font-medium border flex items-center justify-center gap-1.5 disabled:opacity-40 m3-hover"
            style={{
              backgroundColor: 'var(--md-surface)',
              borderColor: 'var(--md-outline-variant)',
              color: 'var(--md-on-surface)',
            }}
          >
            <Merge className="w-3.5 h-3.5" />
            <span>合并少量杂色</span>
          </button>
          <select
            aria-label="杂色合并阈值"
            value={mergeThreshold}
            onChange={(e) => setMergeThreshold(Number(e.target.value))}
            className="h-8 px-2 rounded-full border font-mono text-xs"
            style={{
              backgroundColor: 'var(--md-surface)',
              borderColor: 'var(--md-outline-variant)',
            }}
          >
            <option value={3}>&lt;3颗</option>
            <option value={5}>&lt;5颗</option>
            <option value={10}>&lt;10颗</option>
          </select>
        </div>

        <button
          type="button"
          onClick={onOpenExport}
          className="w-full h-10 px-4 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-95"
          style={{
            backgroundColor: 'var(--md-primary)',
            color: 'var(--md-on-primary)',
          }}
        >
          <Download className="w-4 h-4" />
          <span>导出并下载图纸</span>
        </button>
      </div>
    </aside>
  );
};
