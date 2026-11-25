import React, { useRef, useState } from 'react';
import {
  FilePlus2,
  FolderOpen,
  Grid3x3,
  HelpCircle,
  Moon,
  Save,
  Sun,
  Upload,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

interface HeaderBarProps {
  compact?: boolean;
  onRequestNew: () => void;
  onSaveProject: () => void;
  onOpenLoadModal: () => void;
  onImportArchiveFile: (file: File) => void;
  onOpenShortcuts: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  compact = false,
  onRequestNew,
  onSaveProject,
  onOpenLoadModal,
  onImportArchiveFile,
  onOpenShortcuts,
}) => {
  const projectName = useEditorStore((s) => s.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const isDirty = useEditorStore((s) => s.isDirty);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const isConverting = useEditorStore((s) => s.isConverting);
  const theme = useEditorStore((s) => s.theme);
  const setTheme = useEditorStore((s) => s.setTheme);

  const [editingName, setEditingName] = useState(false);
  const archiveInputRef = useRef<HTMLInputElement>(null);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const statusText = isConverting
    ? '正在计算图纸…'
    : isDirty
      ? '有未保存更改'
      : lastSavedAt
        ? `已自动保存 ${new Date(lastSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
        : '本地离线就绪';

  return (
    <header
      className={`shrink-0 w-full border-b flex items-center justify-between gap-2 px-3 sm:px-4 ${
        compact ? 'h-14' : 'h-16'
      }`}
      style={{
        backgroundColor: 'var(--md-surface)',
        borderColor: 'var(--md-outline-subtle)',
      }}
    >
      {/* Left: Brand + Project Name Pill */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: 'var(--md-primary-container)',
              color: 'var(--md-on-primary-container)',
            }}
          >
            <Grid3x3 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          {!compact && (
            <div className="leading-tight">
              <div className="font-display font-semibold text-sm tracking-tight">
                Bead Studio
              </div>
              <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
                纯本地拼豆图纸工坊
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {editingName ? (
            <input
              type="text"
              autoFocus
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false);
              }}
              aria-label="编辑图纸名称"
              className="h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm font-medium rounded-[24px] border w-full max-w-[200px]"
              style={{
                backgroundColor: 'var(--md-surface-container)',
                borderColor: 'var(--md-primary)',
                color: 'var(--md-on-surface)',
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              title="点击重命名图纸"
              aria-label="重命名当前图纸"
              className="h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm font-medium rounded-[24px] border truncate max-w-full sm:max-w-[240px] m3-hover transition-colors"
              style={{
                backgroundColor: 'var(--md-surface-container)',
                borderColor: 'var(--md-outline-variant)',
                color: 'var(--md-on-surface)',
              }}
            >
              {projectName}
            </button>
          )}

          {!compact && (
            <span
              className="px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0"
              style={{
                backgroundColor: isConverting
                  ? 'var(--md-info-bg)'
                  : isDirty
                    ? 'var(--md-warn-bg)'
                    : 'var(--md-success-bg)',
                color: isConverting
                  ? 'var(--md-info-fg)'
                  : isDirty
                    ? 'var(--md-warn-fg)'
                    : 'var(--md-success-fg)',
              }}
            >
              {statusText}
            </span>
          )}
        </div>
      </div>

      {/* Right: Project Pill Actions + Theme + Help */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={onRequestNew}
          aria-label="新建空白图纸"
          className="h-8 sm:h-9 w-8 sm:w-auto sm:px-3.5 rounded-full text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 gemini-tonal-btn"
          style={{ color: 'var(--md-on-surface)' }}
        >
          <FilePlus2 className="w-4 h-4" />
          <span className="hidden sm:inline">新建</span>
        </button>

        <button
          type="button"
          onClick={onSaveProject}
          aria-label="保存当前图纸到本地"
          className="h-8 sm:h-9 w-8 sm:w-auto sm:px-3.5 rounded-full text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 gemini-tonal-btn"
          style={{ color: 'var(--md-on-surface)' }}
        >
          <Save className="w-4 h-4" />
          <span className="hidden sm:inline">保存</span>
        </button>

        <button
          type="button"
          onClick={onOpenLoadModal}
          aria-label="读取本地工程"
          className="h-8 sm:h-9 w-8 sm:w-auto sm:px-3.5 rounded-full text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 gemini-tonal-btn"
          style={{ color: 'var(--md-on-surface)' }}
        >
          <FolderOpen className="w-4 h-4" />
          <span className="hidden sm:inline">读取</span>
        </button>

        <button
          type="button"
          onClick={() => archiveInputRef.current?.click()}
          aria-label="导入存档文件"
          className="h-8 sm:h-9 w-8 sm:w-auto sm:px-3.5 rounded-full text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 gemini-tonal-btn"
          style={{ color: 'var(--md-on-surface)' }}
        >
          <Upload className="w-4 h-4" />
          <span className="hidden md:inline">导入存档</span>
        </button>
        <input
          ref={archiveInputRef}
          type="file"
          accept=".json,.ddp,.csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportArchiveFile(file);
            e.target.value = '';
          }}
        />

        <div
          className="w-px h-5 mx-0.5 hidden sm:block"
          style={{ backgroundColor: 'var(--md-outline-variant)' }}
        />

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? '切换至浅色模式' : '切换至深色模式'}
          title={theme === 'dark' ? '切换至浅色模式' : '切换至深色模式'}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center m3-hover transition-colors"
          style={{ color: 'var(--md-on-surface-variant)' }}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onOpenShortcuts}
          aria-label="快捷键与使用帮助"
          title="快捷键与使用帮助"
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center m3-hover transition-colors"
          style={{ color: 'var(--md-on-surface-variant)' }}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
