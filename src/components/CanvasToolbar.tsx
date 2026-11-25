import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Check,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Hash,
  History,
  Minus,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  RotateCcw,
  Slash,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { type EditorTool, useEditorStore } from '../store/editorStore';

const TOOLS: Array<{ id: EditorTool; label: string; keyHint: string; icon: React.ReactNode }> = [
  { id: 'move', label: '移动', keyHint: 'V', icon: <Hand className="w-4 h-4" /> },
  { id: 'brush', label: '画笔', keyHint: 'Q', icon: <Pencil className="w-4 h-4" /> },
  { id: 'eraser', label: '橡皮', keyHint: 'W', icon: <Eraser className="w-4 h-4" /> },
  { id: 'eyedropper', label: '取色', keyHint: 'E', icon: <Pipette className="w-4 h-4" /> },
  { id: 'bucket', label: '填充', keyHint: 'G', icon: <PaintBucket className="w-4 h-4" /> },
  { id: 'line', label: '直线', keyHint: 'L', icon: <Slash className="w-4 h-4" /> },
  { id: 'rect', label: '矩形', keyHint: 'R', icon: <Square className="w-4 h-4" /> },
];

export const CanvasToolbar: React.FC = () => {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const mirrorX = useEditorStore((s) => s.mirrorX);
  const mirrorY = useEditorStore((s) => s.mirrorY);
  const setMirrorX = useEditorStore((s) => s.setMirrorX);
  const setMirrorY = useEditorStore((s) => s.setMirrorY);
  const showCodes = useEditorStore((s) => s.showCodes);
  const setShowCodes = useEditorStore((s) => s.setShowCodes);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const history = useEditorStore((s) => s.history);
  const historyIndex = useEditorStore((s) => s.historyIndex);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const jumpToHistory = useEditorStore((s) => s.jumpToHistory);
  const resetToInitial = useEditorStore((s) => s.resetToInitial);
  const setViewMode = useEditorStore((s) => s.setViewMode);

  const [showHistory, setShowHistory] = useState(false);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showHistory) return;
    const onPointerDown = (e: PointerEvent) => {
      if (historyMenuRef.current && !historyMenuRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHistory(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showHistory]);

  return (
    <div
      className="shrink-0 w-full border-b px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-1.5"
      style={{
        backgroundColor: 'var(--md-surface)',
        borderColor: 'var(--md-outline-subtle)',
      }}
    >
      {/* Drawing tools */}
      <div className="flex items-center gap-0.5 shrink-0">
        {TOOLS.map((t) => {
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              aria-label={`${t.label} (${t.keyHint})`}
              aria-pressed={active}
              title={`${t.label} (${t.keyHint})`}
              className="h-8 px-2 rounded-full text-xs font-medium flex items-center gap-1 transition-colors"
              style={{
                backgroundColor: active ? 'var(--md-primary-container)' : 'transparent',
                color: active ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
              }}
            >
              {t.icon}
              <span className="hidden 2xl:inline">{t.label}</span>
            </button>
          );
        })}

        <div
          className="w-px h-5 mx-1"
          style={{ backgroundColor: 'var(--md-outline-variant)' }}
        />

        <button
          type="button"
          onClick={() => setMirrorX(!mirrorX)}
          aria-label="水平镜像对称"
          aria-pressed={mirrorX}
          title="水平镜像对称"
          className="h-8 px-2 rounded-full text-xs font-medium flex items-center gap-1 transition-colors"
          style={{
            backgroundColor: mirrorX ? 'var(--md-primary-container)' : 'transparent',
            color: mirrorX ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
          }}
        >
          <FlipHorizontal2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setMirrorY(!mirrorY)}
          aria-label="垂直镜像对称"
          aria-pressed={mirrorY}
          title="垂直镜像对称"
          className="h-8 px-2 rounded-full text-xs font-medium flex items-center gap-1 transition-colors"
          style={{
            backgroundColor: mirrorY ? 'var(--md-primary-container)' : 'transparent',
            color: mirrorY ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
          }}
        >
          <FlipVertical2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setShowCodes(!showCodes)}
          aria-label="切换色号显示 (A)"
          aria-pressed={showCodes}
          title="切换 # 色号显示 (快捷键 A)"
          className="h-8 px-2 rounded-full text-xs font-medium flex items-center gap-1 transition-colors"
          style={{
            backgroundColor: showCodes ? 'var(--md-primary-container)' : 'transparent',
            color: showCodes ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
          }}
        >
          <Hash className="w-3.5 h-3.5" />
          <span>色号</span>
        </button>
      </div>

      {/* History & Zoom */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={undo}
          disabled={historyIndex <= 0}
          aria-label="撤销 (Ctrl+Z)"
          title="撤销 (Ctrl+Z)"
          className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-35 m3-hover"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          aria-label="重做 (Ctrl+Y)"
          title="重做 (Ctrl+Y)"
          className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-35 m3-hover"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="relative" ref={historyMenuRef}>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-label="历史操作记录"
            aria-expanded={showHistory}
            aria-haspopup="menu"
            title="查看并回滚历史操作"
            className="h-7 px-2.5 rounded-full text-xs font-medium flex items-center gap-1 transition-colors m3-hover"
            style={{
              backgroundColor: showHistory ? 'var(--md-primary-container)' : 'transparent',
              color: showHistory ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
            }}
          >
            <History className="w-3.5 h-3.5" />
            <span>历史</span>
          </button>

          {showHistory && (
            <div
              role="menu"
              aria-label="历史操作记录列表"
              className="absolute right-0 top-full mt-1.5 w-64 max-h-72 overflow-y-auto rounded-xl p-1.5 z-40 gemini-modal flex flex-col gap-0.5"
            >
              <div
                className="px-2.5 py-1 text-[11px] font-medium flex items-center justify-between"
                style={{ color: 'var(--md-on-surface-variant)' }}
              >
                <span>历史操作记录</span>
                <span className="font-mono">{history.length} 步</span>
              </div>
              {history.map((h, idx) => {
                const active = idx === historyIndex;
                return (
                  <button
                    key={h.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      jumpToHistory(idx);
                      setShowHistory(false);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center justify-between gap-2 m3-hover"
                    style={{
                      backgroundColor: active ? 'var(--md-primary-container)' : 'transparent',
                      color: active ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)',
                    }}
                  >
                    <span className="truncate">
                      <span className="font-mono opacity-70 mr-1.5">#{idx + 1}</span>
                      {h.label}
                    </span>
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={resetToInitial}
          aria-label="复原到初始状态"
          title="复原到刚导入/转换的初始状态"
          className="h-7 px-2.5 rounded-full text-xs font-medium border flex items-center gap-1 m3-hover"
          style={{
            borderColor: 'var(--md-outline-variant)',
            color: 'var(--md-on-surface-variant)',
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>复原</span>
        </button>

        <div
          className="w-px h-5 mx-0.5"
          style={{ backgroundColor: 'var(--md-outline-variant)' }}
        />

        <button
          type="button"
          onClick={() => setZoom(zoom / 1.2)}
          aria-label="缩小画布"
          className="w-7 h-7 rounded-full flex items-center justify-center m3-hover"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="font-mono text-xs w-10 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom(zoom * 1.2)}
          aria-label="放大画布"
          className="w-7 h-7 rounded-full flex items-center justify-center m3-hover"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          aria-label="缩放重置为 100%"
          className="h-7 px-1.5 rounded-full text-[11px] font-mono m3-hover"
          style={{ color: 'var(--md-on-surface-variant)' }}
        >
          <Minus className="w-3 h-3 inline" />1:1
        </button>

        <div
          className="w-px h-5 mx-0.5"
          style={{ backgroundColor: 'var(--md-outline-variant)' }}
        />

        <button
          type="button"
          onClick={() => setViewMode('3d')}
          aria-label="打开 3D 成品预览 (P)"
          title="切换至 3D 成品预览 (快捷键 P)"
          className="h-7 px-2.5 rounded-full text-xs font-medium flex items-center gap-1 gemini-tonal-btn"
          style={{ color: 'var(--md-primary)' }}
        >
          <Box className="w-3.5 h-3.5" />
          <span>3D 预览</span>
        </button>
      </div>
    </div>
  );
};
