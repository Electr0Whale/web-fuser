import { useCallback, useEffect, useState } from 'react';
import { CanvasToolbar } from './components/CanvasToolbar';
import { CanvasViewport } from './components/CanvasViewport';
import { HeaderBar } from './components/HeaderBar';
import { LeftControlPanel } from './components/LeftControlPanel';
import { MobileWorkbench } from './components/MobileWorkbench';
import {
  ExportModal,
  NewCanvasConfirmModal,
  PalettePickerModal,
  ProjectStorageModal,
  ShortcutsHelpModal,
  StatsModal,
} from './components/Modals';
import { RightBomPanel } from './components/RightBomPanel';
import { parseImportedPatternFile, saveProjectToStorage } from './storage/projectStorage';
import { useEditorStore } from './store/editorStore';

interface ToastState {
  message: string;
  tone: 'info' | 'success' | 'warn' | 'danger';
}

export function App() {
  const theme = useEditorStore((s) => s.theme);
  const autoSaveEnabled = useEditorStore((s) => s.autoSaveEnabled);
  const isDirty = useEditorStore((s) => s.isDirty);
  const projectId = useEditorStore((s) => s.projectId);
  const projectName = useEditorStore((s) => s.projectName);
  const brandId = useEditorStore((s) => s.brandId);
  const customPalettes = useEditorStore((s) => s.customPalettes);
  const width = useEditorStore((s) => s.width);
  const height = useEditorStore((s) => s.height);
  const grid = useEditorStore((s) => s.grid);
  const getActivePalette = useEditorStore((s) => s.getActivePalette);
  const markSaved = useEditorStore((s) => s.markSaved);
  const newBlankCanvas = useEditorStore((s) => s.newBlankCanvas);
  const loadPatternIntoEditor = useEditorStore((s) => s.loadPatternIntoEditor);

  const setTool = useEditorStore((s) => s.setTool);
  const showCodes = useEditorStore((s) => s.showCodes);
  const setShowCodes = useEditorStore((s) => s.setShowCodes);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [paletteModal, setPaletteModal] = useState<
    null | 'pick-brush' | { replaceFromIndex: number }
  >(null);
  const [showStats, setShowStats] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showNewConfirm, setShowNewConfirm] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false,
  );

  const showToast = useCallback(
    (message: string, tone: ToastState['tone'] = 'info') => {
      setToast({ message, tone });
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Sync [data-theme] attribute
  useEffect(() => {
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }, [theme]);

  // Responsive breakpoint listener
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case 'q':
          setTool('brush');
          break;
        case 'w':
          setTool('eraser');
          break;
        case 'e':
          setTool('eyedropper');
          break;
        case 'g':
          setTool('bucket');
          break;
        case 'l':
          setTool('line');
          break;
        case 'r':
          setTool('rect');
          break;
        case 'v':
          setTool('move');
          break;
        case 'a':
          setShowCodes(!showCodes);
          break;
        case '=':
        case '+':
          setZoom(zoom * 1.15);
          break;
        case '-':
          setZoom(zoom / 1.15);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, setShowCodes, setTool, setZoom, showCodes, undo, zoom]);

  const handleSaveProject = useCallback(
    async (silent = false) => {
      const palette = getActivePalette();
      const saved = await saveProjectToStorage({
        id: projectId,
        name: projectName,
        brandId,
        width,
        height,
        grid,
        palette: palette.colors,
      });
      markSaved(saved.id, saved.updatedAt);
      if (!silent) {
        showToast(`已保存到本地工程：${saved.name}`, 'success');
      }
    },
    [brandId, getActivePalette, grid, height, markSaved, projectId, projectName, showToast, width],
  );

  // Debounced auto-save when dirty
  useEffect(() => {
    if (!autoSaveEnabled || !isDirty) return;
    let hasAnyBead = false;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] >= 0) {
        hasAnyBead = true;
        break;
      }
    }
    if (!hasAnyBead && !projectId) return;
    const timer = window.setTimeout(() => {
      void handleSaveProject(true);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [autoSaveEnabled, grid, handleSaveProject, isDirty, projectId]);

  const handleRequestNew = () => {
    if (isDirty) {
      setShowNewConfirm(true);
    } else {
      newBlankCanvas();
      showToast('已新建空白画布', 'info');
    }
  };

  const handleImportArchiveFile = async (file: File) => {
    try {
      const parsed = await parseImportedPatternFile(file, brandId, customPalettes);
      loadPatternIntoEditor({
        projectName: parsed.name,
        brandId: parsed.brandId,
        width: parsed.width,
        height: parsed.height,
        grid: parsed.grid,
      });
      showToast(`已导入存档：${parsed.name} (${parsed.width}×${parsed.height})`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '导入存档失败', 'danger');
    }
  };

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{
        backgroundColor: 'var(--md-surface)',
        color: 'var(--md-on-surface)',
      }}
    >
      <HeaderBar
        compact={isMobile}
        onRequestNew={handleRequestNew}
        onSaveProject={() => void handleSaveProject(false)}
        onOpenLoadModal={() => setShowLoadModal(true)}
        onImportArchiveFile={(f) => void handleImportArchiveFile(f)}
        onOpenShortcuts={() => setShowShortcuts(true)}
      />

      {isMobile ? (
        <MobileWorkbench
          onToast={showToast}
          onOpenPalettePicker={() => setPaletteModal('pick-brush')}
          onOpenReplaceColor={(idx) => setPaletteModal({ replaceFromIndex: idx })}
          onOpenStats={() => setShowStats(true)}
          onOpenExport={() => setShowExport(true)}
        />
      ) : (
        <main className="flex-1 min-h-0 flex overflow-hidden">
          <LeftControlPanel onToast={showToast} />
          <section className="flex-1 min-w-0 min-h-0 flex flex-col">
            <CanvasToolbar />
            <CanvasViewport />
          </section>
          <RightBomPanel
            onOpenPalettePicker={() => setPaletteModal('pick-brush')}
            onOpenReplaceColor={(idx) => setPaletteModal({ replaceFromIndex: idx })}
            onOpenStats={() => setShowStats(true)}
            onOpenExport={() => setShowExport(true)}
            onToast={showToast}
          />
        </main>
      )}

      {/* Modals */}
      {showExport && (
        <ExportModal onClose={() => setShowExport(false)} onToast={showToast} />
      )}
      {paletteModal && (
        <PalettePickerModal
          mode={paletteModal}
          onClose={() => setPaletteModal(null)}
          onToast={showToast}
        />
      )}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
      {showLoadModal && (
        <ProjectStorageModal
          onClose={() => setShowLoadModal(false)}
          onToast={showToast}
        />
      )}
      {showNewConfirm && (
        <NewCanvasConfirmModal
          onClose={() => setShowNewConfirm(false)}
          onConfirm={() => {
            newBlankCanvas();
            showToast('已清空并新建空白画布', 'info');
          }}
        />
      )}
      {showShortcuts && <ShortcutsHelpModal onClose={() => setShowShortcuts(false)} />}

      {/* M3 Snackbar Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-16 lg:bottom-5 right-5 z-50 m3-callout m3-callout-${toast.tone} max-w-sm border`}
          style={{ borderColor: 'var(--md-outline-variant)' }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
