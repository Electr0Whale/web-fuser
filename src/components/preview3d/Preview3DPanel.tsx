import React, { useMemo, useState } from 'react';
import { Camera, Cpu, Layers, Sparkles, SunMedium } from 'lucide-react';
import type { BeadColor } from '../../core/colorSpace';
import { summarizeSpecialBeads } from '../../core/preview3d/beadMaterialClassifier';
import {
  CRAFT_CATEGORIES,
  CRAFT_PRESETS,
  type CraftCategory,
  type Preview3DSettings,
  type QualityTier,
  type ResolvedQualityTier,
  getCraftPreset,
} from '../../core/preview3d/craftCatalog';
import { generateCraftSwatchDataUrl } from '../../core/preview3d/craftTextures';
import { LIGHTING_PRESETS, getLightingPreset } from '../../core/preview3d/scenePresets';

interface Preview3DPanelProps {
  grid: Int16Array;
  palette: readonly BeadColor[];
  brandId: string;
  settings: Preview3DSettings;
  resolvedTier: ResolvedQualityTier;
  compact?: boolean;
  onUpdateSettings: (patch: Partial<Preview3DSettings>) => void;
  onCapturePng: (scale: 1 | 2) => void;
  isExporting?: boolean;
}

const TIER_LABEL: Record<ResolvedQualityTier, string> = {
  ultra: '极致',
  balanced: '均衡',
  lite: '流畅',
};

export const Preview3DPanel: React.FC<Preview3DPanelProps> = ({
  grid,
  palette,
  brandId,
  settings,
  resolvedTier,
  compact = false,
  onUpdateSettings,
  onCapturePng,
  isExporting = false,
}) => {
  const activeCraft = getCraftPreset(settings.craftId);
  const [activeCategory, setActiveCategory] = useState<CraftCategory>(activeCraft.category);
  const [snapScale, setSnapScale] = useState<1 | 2>(2);

  const swatchUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of CRAFT_PRESETS) {
      map.set(c.id, generateCraftSwatchDataUrl(c.id));
    }
    return map;
  }, []);

  const specialSummary = useMemo(
    () => summarizeSpecialBeads(grid, palette, brandId),
    [brandId, grid, palette],
  );

  const visibleCrafts = useMemo(
    () => CRAFT_PRESETS.filter((c) => c.category === activeCategory),
    [activeCategory],
  );

  const specialParts: string[] = [];
  if (specialSummary.transparentCount > 0) {
    specialParts.push(`透明 ${specialSummary.transparentCount} 颗`);
  }
  if (specialSummary.glowCount > 0) {
    specialParts.push(`夜光 ${specialSummary.glowCount} 颗`);
  }
  if (specialSummary.pearlescentCount > 0) {
    specialParts.push(`珠光/果冻 ${specialSummary.pearlescentCount} 颗`);
  }

  return (
    <aside
      aria-label="3D 工艺与光影控制面板"
      className={`${
        compact ? 'w-full flex-1 min-h-0' : 'w-80 shrink-0 h-full border-l'
      } overflow-y-auto p-3 flex flex-col gap-3`}
      style={{
        backgroundColor: 'var(--md-surface-container)',
        borderColor: 'var(--md-outline-subtle)',
      }}
    >
      {/* 01 工艺选择 */}
      <section className="rounded-2xl p-3 gemini-card flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Layers className="w-3.5 h-3.5" style={{ color: 'var(--md-primary)' }} />
            <span>01 熨烫工艺（16 种）</span>
          </div>
          <span className="text-[11px] font-medium" style={{ color: 'var(--md-primary)' }}>
            {activeCraft.name}
          </span>
        </div>

        {/* Category segmented pills */}
        <div className="grid grid-cols-4 gap-1">
          {CRAFT_CATEGORIES.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className="h-7 px-1 rounded-full text-[11px] font-medium truncate transition-colors"
                style={{
                  backgroundColor: active
                    ? 'var(--md-primary-container)'
                    : 'var(--md-surface-container)',
                  color: active
                    ? 'var(--md-on-primary-container)'
                    : 'var(--md-on-surface-variant)',
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* 2-col visual swatch cards */}
        <div className="grid grid-cols-2 gap-1.5">
          {visibleCrafts.map((craft) => {
            const selected = settings.craftId === craft.id;
            const thumb = swatchUrls.get(craft.id) ?? '';
            return (
              <button
                key={craft.id}
                type="button"
                onClick={() => onUpdateSettings({ craftId: craft.id })}
                aria-pressed={selected}
                className="rounded-xl p-1.5 border text-left flex items-center gap-2 transition-colors m3-hover"
                style={{
                  backgroundColor: selected
                    ? 'var(--md-primary-container)'
                    : 'var(--md-surface)',
                  borderColor: selected ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                }}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={craft.name}
                    className="w-9 h-9 rounded-lg shrink-0 object-cover border"
                    style={{ borderColor: 'var(--md-outline-variant)' }}
                  />
                ) : (
                  <span className="w-9 h-9 rounded-lg shrink-0 bg-sky-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className="text-xs font-semibold truncate"
                    style={{
                      color: selected
                        ? 'var(--md-on-primary-container)'
                        : 'var(--md-on-surface)',
                    }}
                  >
                    {craft.name}
                  </div>
                  <div
                    className="text-[10px] leading-tight line-clamp-2"
                    style={{ color: 'var(--md-on-surface-variant)' }}
                  >
                    {craft.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 02 物理规格与烫压 */}
      <section className="rounded-2xl p-3 gemini-card flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--md-primary)' }} />
          <span>02 豆径、正反面与烫压</span>
        </div>

        {/* Bead size */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <span style={{ color: 'var(--md-on-surface-variant)' }}>豆子规格</span>
          <div className="flex items-center gap-1">
            {([2.6, 5.0] as const).map((mm) => {
              const active = settings.beadSizeMm === mm;
              return (
                <button
                  key={mm}
                  type="button"
                  onClick={() => onUpdateSettings({ beadSizeMm: mm })}
                  className="h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--md-primary-container)' : 'transparent',
                    borderColor: active ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                    color: active
                      ? 'var(--md-on-primary-container)'
                      : 'var(--md-on-surface-variant)',
                  }}
                >
                  {mm === 2.6 ? '2.6mm 迷你豆' : '5mm 标准豆'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Single / double sided */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <span style={{ color: 'var(--md-on-surface-variant)' }}>正反面工艺</span>
          <div className="flex items-center gap-1">
            {(
              [
                ['single-sided', '单面+背孔'],
                ['double-sided', '双面同工艺'],
              ] as const
            ).map(([mode, label]) => {
              const active = settings.sideMode === mode;
              const disabled = !activeCraft.supportsSideMode;
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={disabled}
                  onClick={() => onUpdateSettings({ sideMode: mode })}
                  title={disabled ? '当前立豆/双面有孔模式无需区分正反面' : label}
                  className="h-7 px-2 rounded-full text-[11px] font-medium border transition-colors disabled:opacity-40"
                  style={{
                    backgroundColor: active && !disabled ? 'var(--md-primary-container)' : 'transparent',
                    borderColor:
                      active && !disabled ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                    color:
                      active && !disabled
                        ? 'var(--md-on-primary-container)'
                        : 'var(--md-on-surface-variant)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Melt level */}
        <label className="flex flex-col gap-1 text-xs">
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--md-on-surface-variant)' }}>烫压熔合程度</span>
            <span className="font-mono font-semibold">{Math.round(settings.meltLevel * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            disabled={settings.craftId === 'unfused'}
            value={settings.meltLevel}
            onChange={(e) => onUpdateSettings({ meltLevel: Number(e.target.value) })}
            className="w-full accent-[var(--md-primary)] disabled:opacity-40"
          />
        </label>

        {/* Pegboard toggle for unfused */}
        {settings.craftId === 'unfused' && (
          <label className="flex items-center justify-between text-xs cursor-pointer">
            <span style={{ color: 'var(--md-on-surface)' }}>显示透明拼豆底板</span>
            <input
              type="checkbox"
              checked={settings.showPegboard}
              onChange={(e) => onUpdateSettings({ showPegboard: e.target.checked })}
              className="accent-[var(--md-primary)] w-4 h-4"
            />
          </label>
        )}

        {/* Special bead recognition */}
        <div
          className="rounded-xl p-2 border flex flex-col gap-1.5"
          style={{
            backgroundColor: 'var(--md-surface-container)',
            borderColor: 'var(--md-outline-subtle)',
          }}
        >
          <label className="flex items-center justify-between text-xs cursor-pointer">
            <span className="font-medium">自动识别特殊豆材质</span>
            <input
              type="checkbox"
              checked={settings.enableSpecialBeads}
              onChange={(e) => onUpdateSettings({ enableSpecialBeads: e.target.checked })}
              className="accent-[var(--md-primary)] w-4 h-4"
            />
          </label>
          <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
            {specialParts.length > 0
              ? `已识别：${specialParts.join(' · ')}`
              : '当前图纸均为常规实色豆（MARD T/Y/P 等扩展色会自动触发）'}
          </div>
        </div>
      </section>

      {/* 03 光影与布景 */}
      <section className="rounded-2xl p-3 gemini-card flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <SunMedium className="w-3.5 h-3.5" style={{ color: 'var(--md-primary)' }} />
            <span>03 光影与布景</span>
          </div>
          <span className="text-[10px]" style={{ color: 'var(--md-on-surface-variant)' }}>
            阴影随画质自动调节
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {LIGHTING_PRESETS.map((lp) => {
            const active = settings.lightingPreset === lp.id;
            return (
              <button
                key={lp.id}
                type="button"
                onClick={() => {
                  const p = getLightingPreset(lp.id);
                  onUpdateSettings({
                    lightingPreset: lp.id,
                    lightAzimuth: p.defaultAzimuth,
                    lightElevation: p.defaultElevation,
                  });
                }}
                aria-pressed={active}
                className="rounded-xl px-2.5 py-2 border text-center transition-colors m3-hover"
                style={{
                  backgroundColor: active ? 'var(--md-primary-container)' : 'var(--md-surface)',
                  borderColor: active ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                }}
              >
                <div
                  className="text-xs font-medium"
                  style={{
                    color: active ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)',
                  }}
                >
                  {lp.name}
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px]">
            <div className="flex justify-between">
              <span style={{ color: 'var(--md-on-surface-variant)' }}>主光方向</span>
              <span className="font-mono">{settings.lightAzimuth}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={2}
              value={settings.lightAzimuth}
              onChange={(e) => onUpdateSettings({ lightAzimuth: Number(e.target.value) })}
              className="w-full accent-[var(--md-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px]">
            <div className="flex justify-between">
              <span style={{ color: 'var(--md-on-surface-variant)' }}>光照高度</span>
              <span className="font-mono">{settings.lightElevation}°</span>
            </div>
            <input
              type="range"
              min={12}
              max={85}
              step={1}
              value={settings.lightElevation}
              onChange={(e) => onUpdateSettings({ lightElevation: Number(e.target.value) })}
              className="w-full accent-[var(--md-primary)]"
            />
          </label>
        </div>
      </section>

      {/* 04 拍照导出与性能 */}
      <section className="rounded-2xl p-3 gemini-card flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Camera className="w-3.5 h-3.5" style={{ color: 'var(--md-primary)' }} />
            <span>04 高清渲染拍照</span>
          </div>
          <div className="flex items-center gap-1">
            {([1, 2] as const).map((sc) => {
              const active = snapScale === sc;
              return (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setSnapScale(sc)}
                  className="h-6 px-2 rounded-full text-[11px] font-mono font-medium border transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--md-primary-container)' : 'transparent',
                    borderColor: active ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                    color: active
                      ? 'var(--md-on-primary-container)'
                      : 'var(--md-on-surface-variant)',
                  }}
                >
                  {sc}x
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          disabled={isExporting}
          onClick={() => onCapturePng(snapScale)}
          className="h-9 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-opacity disabled:opacity-50"
          style={{
            backgroundColor: 'var(--md-primary)',
            color: 'var(--md-on-primary)',
          }}
        >
          <Camera className="w-4 h-4" />
          <span>{isExporting ? '正在渲染高清图片…' : '保存透明背景 PNG'}</span>
        </button>

        {/* Hardware quality selector */}
        <div
          className="pt-2 border-t flex flex-col gap-1.5"
          style={{ borderColor: 'var(--md-outline-subtle)' }}
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1" style={{ color: 'var(--md-on-surface-variant)' }}>
              <Cpu className="w-3.5 h-3.5" />
              渲染画质档位
            </span>
            <span className="font-medium" style={{ color: 'var(--md-primary)' }}>
              当前生效：{TIER_LABEL[resolvedTier]}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                ['auto', '自动'],
                ['ultra', '极致'],
                ['balanced', '均衡'],
                ['lite', '流畅'],
              ] as ReadonlyArray<[QualityTier, string]>
            ).map(([tier, label]) => {
              const active = settings.qualityTier === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => onUpdateSettings({ qualityTier: tier })}
                  className="h-7 rounded-full text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: active
                      ? 'var(--md-primary-container)'
                      : 'var(--md-surface-container)',
                    color: active
                      ? 'var(--md-on-primary-container)'
                      : 'var(--md-on-surface-variant)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </aside>
  );
};
