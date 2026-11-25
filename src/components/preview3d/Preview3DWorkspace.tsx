import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Box, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { resolveQualityTier } from '../../core/preview3d/performanceTier';
import type { ResolvedQualityTier } from '../../core/preview3d/craftCatalog';
import { useEditorStore } from '../../store/editorStore';
import { BeadCanvas3D } from './BeadCanvas3D';
import type { PreviewSnapshotHandle } from './Fallback25DCanvas';
import { Preview3DPanel } from './Preview3DPanel';

interface Preview3DWorkspaceProps {
  compact?: boolean;
  onToast: (msg: string, tone?: 'info' | 'success' | 'warn' | 'danger') => void;
  onBackTo2D?: () => void;
}

export const Preview3DWorkspace: React.FC<Preview3DWorkspaceProps> = ({
  compact = false,
  onToast,
  onBackTo2D,
}) => {
  const grid = useEditorStore((s) => s.grid);
  const width = useEditorStore((s) => s.width);
  const height = useEditorStore((s) => s.height);
  const brandId = useEditorStore((s) => s.brandId);
  const customPalettes = useEditorStore((s) => s.customPalettes);
  const getActivePalette = useEditorStore((s) => s.getActivePalette);
  const projectName = useEditorStore((s) => s.projectName);
  const theme = useEditorStore((s) => s.theme);
  const preview3d = useEditorStore((s) => s.preview3d);
  const updatePreview3d = useEditorStore((s) => s.updatePreview3d);
  const setViewMode = useEditorStore((s) => s.setViewMode);

  const palette = useMemo(
    () => getActivePalette(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandId, customPalettes, getActivePalette],
  );

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system'
      ? typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;

  const hasAnyBead = useMemo(() => {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] >= 0) return true;
    }
    return false;
  }, [grid]);

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [resolvedTier, setResolvedTier] = useState<ResolvedQualityTier>(() =>
    resolveQualityTier(preview3d.qualityTier),
  );
  const [isExporting, setIsExporting] = useState(false);
  const snapshotRef = useRef<PreviewSnapshotHandle | null>(null);

  const handleCapturePng = async (scale: 1 | 2) => {
    if (!snapshotRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await snapshotRef.current.capturePng(scale);
      onToast('已保存透明背景高清 3D PNG', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : '导出 3D 渲染图失败', 'danger');
    } finally {
      setIsExporting(false);
    }
  };

  const handleReturn2D = () => {
    if (onBackTo2D) onBackTo2D();
    else setViewMode('2d');
  };

  if (!hasAnyBead) {
    return (
      <div
        className="flex-1 min-h-0 flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--md-surface-container)' }}
      >
        <div className="max-w-sm w-full rounded-3xl p-6 gemini-card flex flex-col items-center text-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: 'var(--md-primary-container)',
              color: 'var(--md-on-primary-container)',
            }}
          >
            <Box className="w-6 h-6" />
          </div>
          <h2 className="font-display text-base font-semibold">画布还没有拼豆</h2>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--md-on-surface-variant)' }}>
            先在 2D 编辑器中上传图片生成图纸或手绘几颗拼豆，即可实时查看 16 种熨烫工艺的 3D 光影质感！
          </p>
          <button
            type="button"
            onClick={handleReturn2D}
            className="h-9 px-4 rounded-full text-xs font-semibold flex items-center gap-1.5 mt-1"
            style={{
              backgroundColor: 'var(--md-primary)',
              color: 'var(--md-on-primary)',
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回 2D 编辑</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 min-h-0 flex ${compact ? 'flex-col' : 'flex-row'} overflow-hidden`}>
      {/* 3D Viewport Area */}
      <div
        className={`relative min-w-0 min-h-0 flex flex-col ${
          compact ? 'h-[52%] shrink-0 border-b' : 'flex-1'
        }`}
        style={{ borderColor: 'var(--md-outline-subtle)' }}
      >
        <BeadCanvas3D
          grid={grid}
          width={width}
          height={height}
          palette={palette.colors}
          brandId={brandId}
          settings={preview3d}
          theme={resolvedTheme}
          projectName={projectName}
          compact={compact}
          snapshotRef={snapshotRef}
          onUpdateSettings={updatePreview3d}
          onResolvedTierChange={setResolvedTier}
          onQuickSnapshot={() => void handleCapturePng(2)}
          onToast={onToast}
        />

        {!compact && (
          <button
            type="button"
            onClick={() => setPanelCollapsed((v) => !v)}
            aria-label={panelCollapsed ? '展开工艺参数面板' : '收起工艺参数面板'}
            title={panelCollapsed ? '展开工艺参数面板' : '收起工艺参数面板'}
            className="absolute top-3 right-3 h-8 px-2.5 rounded-full gemini-pill text-xs font-medium flex items-center gap-1 m3-hover"
            style={{ color: 'var(--md-on-surface)' }}
          >
            {panelCollapsed ? (
              <>
                <PanelRightOpen className="w-4 h-4" />
                <span>工艺面板</span>
              </>
            ) : (
              <PanelRightClose className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Controls Panel */}
      {(compact || !panelCollapsed) && (
        <Preview3DPanel
          grid={grid}
          palette={palette.colors}
          brandId={brandId}
          settings={preview3d}
          resolvedTier={resolvedTier}
          compact={compact}
          onUpdateSettings={updatePreview3d}
          onCapturePng={(sc) => void handleCapturePng(sc)}
          isExporting={isExporting}
        />
      )}
    </div>
  );
};

export default Preview3DWorkspace;
