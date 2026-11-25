import React, { useMemo, useState } from 'react';
import {
  Eraser,
  Hand,
  Hash,
  ListChecks,
  PaintBucket,
  Palette,
  Pencil,
  Pipette,
  Redo2,
  Settings2,
  Undo2,
  Grid,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { CanvasViewport } from './CanvasViewport';
import { LeftControlPanel } from './LeftControlPanel';
import { RightBomPanel } from './RightBomPanel';

interface MobileWorkbenchProps {
  onToast: (msg: string, tone?: 'info' | 'success' | 'warn' | 'danger') => void;
  onOpenPalettePicker: () => void;
  onOpenReplaceColor: (fromColorIndex: number) => void;
  onOpenStats: () => void;
  onOpenExport: () => void;
}

type MobileTab = 'canvas' | 'settings' | 'colors' | 'bom';

export const MobileWorkbench: React.FC<MobileWorkbenchProps> = ({
  onToast,
  onOpenPalettePicker,
  onOpenReplaceColor,
  onOpenStats,
  onOpenExport,
}) => {
  const [tab, setTab] = useState<MobileTab>('canvas');
  const [search, setSearch] = useState('');

  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const showCodes = useEditorStore((s) => s.showCodes);
  const setShowCodes = useEditorStore((s) => s.setShowCodes);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const historyIndex = useEditorStore((s) => s.historyIndex);
  const historyLength = useEditorStore((s) => s.history.length);

  const brandId = useEditorStore((s) => s.brandId);
  const customPalettes = useEditorStore((s) => s.customPalettes);
  const getActivePalette = useEditorStore((s) => s.getActivePalette);
  const activeColorIndex = useEditorStore((s) => s.activeColorIndex);
  const setActiveColorIndex = useEditorStore((s) => s.setActiveColorIndex);

  const palette = useMemo(() => getActivePalette(), [brandId, customPalettes, getActivePalette]);
  const filteredColors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return palette.colors;
    return palette.colors.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [palette.colors, search]);

  const TABS: Array<{ id: MobileTab; label: string; icon: React.ReactNode }> = [
    { id: 'canvas', label: '图纸', icon: <Grid className="w-4 h-4" /> },
    { id: 'settings', label: '设置', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'colors', label: '颜色', icon: <Palette className="w-4 h-4" /> },
    { id: 'bom', label: '清单', icon: <ListChecks className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* M3 Tab Bar */}
      <nav
        aria-label="移动端工作区标签"
        className="shrink-0 grid grid-cols-4 border-b"
        style={{
          backgroundColor: 'var(--md-surface)',
          borderColor: 'var(--md-outline-subtle)',
        }}
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-selected={active}
              className="h-11 flex items-center justify-center gap-1.5 text-xs font-medium border-b-2 transition-colors"
              style={{
                borderBottomColor: active ? 'var(--md-primary)' : 'transparent',
                color: active ? 'var(--md-primary)' : 'var(--md-on-surface-variant)',
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main tab content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {tab === 'canvas' && <CanvasViewport />}
        {tab === 'settings' && <LeftControlPanel onToast={onToast} fullWidth />}
        {tab === 'colors' && (
          <div
            className="flex-1 overflow-y-auto p-3 flex flex-col gap-3"
            style={{ backgroundColor: 'var(--md-surface-container)' }}
          >
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索色号或颜色名称（如 A1 / 浅黄）…"
              aria-label="搜索色卡颜色"
              className="w-full h-10 px-4 rounded-full border text-sm"
              style={{
                backgroundColor: 'var(--md-surface)',
                borderColor: 'var(--md-outline-variant)',
              }}
            />
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {filteredColors.map((c) => {
                const idx = palette.colors.indexOf(c);
                const selected = idx === activeColorIndex;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      setActiveColorIndex(idx);
                      setTab('canvas');
                    }}
                    className="rounded-xl p-2 border flex flex-col items-center gap-1 text-center"
                    style={{
                      backgroundColor: selected
                        ? 'var(--md-primary-container)'
                        : 'var(--md-surface)',
                      borderColor: selected ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                    }}
                  >
                    <span
                      className="w-7 h-7 rounded-lg border"
                      style={{
                        backgroundColor: c.hex,
                        borderColor: 'var(--md-outline-variant)',
                      }}
                    />
                    <span className="font-mono text-[11px] font-semibold">{c.code}</span>
                    <span
                      className="text-[10px] truncate w-full"
                      style={{ color: 'var(--md-on-surface-variant)' }}
                    >
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {tab === 'bom' && (
          <RightBomPanel
            onOpenPalettePicker={onOpenPalettePicker}
            onOpenReplaceColor={onOpenReplaceColor}
            onOpenStats={onOpenStats}
            onOpenExport={onOpenExport}
            onToast={onToast}
            fullWidth
          />
        )}
      </div>

      {/* Bottom Mobile Tool Dock */}
      <div
        className="shrink-0 h-14 px-2 border-t flex items-center justify-around gap-1"
        style={{
          backgroundColor: 'var(--md-surface)',
          borderColor: 'var(--md-outline-subtle)',
        }}
      >
        {(
          [
            ['move', '移动', <Hand className="w-4 h-4" key="m" />],
            ['brush', '画笔', <Pencil className="w-4 h-4" key="b" />],
            ['eraser', '橡皮', <Eraser className="w-4 h-4" key="e" />],
            ['eyedropper', '取色', <Pipette className="w-4 h-4" key="p" />],
            ['bucket', '填充', <PaintBucket className="w-4 h-4" key="f" />],
          ] as const
        ).map(([id, label, icon]) => {
          const active = tool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTool(id);
                setTab('canvas');
              }}
              aria-label={label}
              className="flex flex-col items-center justify-center w-11 h-11 rounded-xl text-[10px] gap-0.5"
              style={{
                backgroundColor: active ? 'var(--md-primary-container)' : 'transparent',
                color: active ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
              }}
            >
              {icon}
              <span>{label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={undo}
          disabled={historyIndex <= 0}
          aria-label="撤销"
          className="flex flex-col items-center justify-center w-10 h-11 rounded-xl text-[10px] gap-0.5 disabled:opacity-35"
        >
          <Undo2 className="w-4 h-4" />
          <span>撤销</span>
        </button>

        <button
          type="button"
          onClick={redo}
          disabled={historyIndex >= historyLength - 1}
          aria-label="重做"
          className="flex flex-col items-center justify-center w-10 h-11 rounded-xl text-[10px] gap-0.5 disabled:opacity-35"
        >
          <Redo2 className="w-4 h-4" />
          <span>重做</span>
        </button>

        <button
          type="button"
          onClick={() => setShowCodes(!showCodes)}
          aria-label="切换色号"
          className="flex flex-col items-center justify-center w-11 h-11 rounded-xl text-[10px] gap-0.5"
          style={{
            backgroundColor: showCodes ? 'var(--md-primary-container)' : 'transparent',
            color: showCodes ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
          }}
        >
          <Hash className="w-4 h-4" />
          <span>色号</span>
        </button>
      </div>
    </div>
  );
};
