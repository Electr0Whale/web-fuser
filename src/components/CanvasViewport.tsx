import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getContrastTextColor } from '../core/colorSpace';
import {
  bresenhamLine,
  columnIndexToLabel,
  getSymmetryPoints,
  rectanglePoints,
  type GridPoint,
} from '../core/editingTools';
import { resolveThemeMode, useEditorStore } from '../store/editorStore';

const BASE_CELL_PX = 20;
const RULER_SIZE = 28;

export const CanvasViewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const width = useEditorStore((s) => s.width);
  const height = useEditorStore((s) => s.height);
  const grid = useEditorStore((s) => s.grid);
  const brandId = useEditorStore((s) => s.brandId);
  const customPalettes = useEditorStore((s) => s.customPalettes);
  const getActivePalette = useEditorStore((s) => s.getActivePalette);

  const tool = useEditorStore((s) => s.tool);
  const activeColorIndex = useEditorStore((s) => s.activeColorIndex);
  const mirrorX = useEditorStore((s) => s.mirrorX);
  const mirrorY = useEditorStore((s) => s.mirrorY);
  const manualEditEnabled = useEditorStore((s) => s.manualEditEnabled);
  const gridStyle = useEditorStore((s) => s.gridStyle);
  const guideInterval = useEditorStore((s) => s.guideInterval);
  const guideColor = useEditorStore((s) => s.guideColor);
  const showCoordinates = useEditorStore((s) => s.showCoordinates);
  const coordFormat = useEditorStore((s) => s.coordFormat);
  const showCodes = useEditorStore((s) => s.showCodes);
  const highlightColorIndex = useEditorStore((s) => s.highlightColorIndex);
  const zoom = useEditorStore((s) => s.zoom);
  const panX = useEditorStore((s) => s.panX);
  const panY = useEditorStore((s) => s.panY);
  const theme = useEditorStore((s) => s.theme);

  const setZoom = useEditorStore((s) => s.setZoom);
  const setPan = useEditorStore((s) => s.setPan);
  const setTool = useEditorStore((s) => s.setTool);
  const setActiveColorIndex = useEditorStore((s) => s.setActiveColorIndex);
  const commitGridChange = useEditorStore((s) => s.commitGridChange);
  const applyFloodFill = useEditorStore((s) => s.applyFloodFill);

  const palette = useMemo(() => getActivePalette(), [brandId, customPalettes, getActivePalette]);

  const [hoverCell, setHoverCell] = useState<GridPoint | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [viewportSize, setViewportSize] = useState({ w: 800, h: 600 });
  const [domTheme, setDomTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'dark' || attr === 'light') return attr;
    }
    return resolveThemeMode(theme);
  });

  useEffect(() => {
    setDomTheme(resolveThemeMode(theme));
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'dark' || attr === 'light') {
        setDomTheme(attr);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [theme]);

  // Mutable stroke refs for 60fps painting without React store thrashing mid-drag
  const draftGridRef = useRef<Int16Array | null>(null);
  const previewPointsRef = useRef<GridPoint[]>([]);
  const strokeStartRef = useRef<GridPoint | null>(null);
  const lastPointRef = useRef<GridPoint | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null);
  const strokeChangedCountRef = useRef(0);
  const isDrawingRef = useRef(false);
  const [, setRenderTick] = useState(0);

  // Measure container size and auto-fit cleanly on initial mount or major viewport change
  const hasMeasuredRef = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextW = Math.max(200, Math.floor(entry.contentRect.width));
        const nextH = Math.max(200, Math.floor(entry.contentRect.height));
        setViewportSize((prev) => {
          if (!hasMeasuredRef.current || Math.abs(prev.w - nextW) > 80) {
            hasMeasuredRef.current = true;
            const pad = showCoordinates ? RULER_SIZE * 2 + 36 : 36;
            const availW = Math.max(120, nextW - pad);
            const availH = Math.max(120, nextH - pad);
            const idealZoom = Math.min(
              availW / (width * BASE_CELL_PX),
              availH / (height * BASE_CELL_PX),
            );
            const clampedZoom = Math.max(0.1, Math.min(3.5, Math.round(idealZoom * 100) / 100));
            setZoom(clampedZoom);
            setPan(0, 0);
          }
          return { w: nextW, h: nextH };
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [height, setPan, setZoom, showCoordinates, width]);

  // Auto-fit when dimensions change
  const fitCanvasToViewport = useCallback(() => {
    const pad = showCoordinates ? RULER_SIZE * 2 + 36 : 36;
    const availW = Math.max(120, viewportSize.w - pad);
    const availH = Math.max(120, viewportSize.h - pad);
    const idealZoom = Math.min(availW / (width * BASE_CELL_PX), availH / (height * BASE_CELL_PX));
    const clampedZoom = Math.max(0.1, Math.min(3.5, Math.round(idealZoom * 100) / 100));
    setZoom(clampedZoom);
    setPan(0, 0);
  }, [height, setPan, setZoom, showCoordinates, viewportSize.h, viewportSize.w, width]);

  const prevDimsRef = useRef(`${width}x${height}`);
  useEffect(() => {
    const key = `${width}x${height}`;
    if (prevDimsRef.current !== key) {
      prevDimsRef.current = key;
      fitCanvasToViewport();
    }
  }, [fitCanvasToViewport, height, width]);

  // Spacebar panning shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setSpacePressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const cellPx = BASE_CELL_PX * zoom;
  const boardW = width * cellPx;
  const boardH = height * cellPx;
  const originX = Math.round((viewportSize.w - boardW) / 2 + panX);
  const originY = Math.round((viewportSize.h - boardH) / 2 + panY);

  const clientToGrid = useCallback(
    (clientX: number, clientY: number): GridPoint | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const gx = Math.floor((x - originX) / cellPx);
      const gy = Math.floor((y - originY) / cellPx);
      if (gx < 0 || gx >= width || gy < 0 || gy >= height) return null;
      return { x: gx, y: gy };
    },
    [cellPx, height, originX, originY, width],
  );

  // Main Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewportSize.w * dpr);
    canvas.height = Math.floor(viewportSize.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear viewport background using live resolved theme tokens
    const isDark = domTheme === 'dark';
    const styles = getComputedStyle(document.documentElement);
    const bgSurface =
      styles.getPropertyValue('--md-surface-container').trim() || (isDark ? '#1E1F20' : '#F0F4F9');
    const surfaceBg =
      styles.getPropertyValue('--md-surface').trim() || (isDark ? '#131314' : '#FFFFFF');
    const textMuted =
      styles.getPropertyValue('--md-on-surface-variant').trim() || (isDark ? '#C4C7C5' : '#444746');
    const outlineCol =
      styles.getPropertyValue('--md-outline-variant').trim() ||
      (isDark ? 'rgba(227,227,227,0.10)' : 'rgba(31,31,31,0.09)');
    const outlineSubtle =
      styles.getPropertyValue('--md-outline-subtle').trim() ||
      (isDark ? 'rgba(227,227,227,0.06)' : 'rgba(31,31,31,0.06)');
    const primaryCol =
      styles.getPropertyValue('--md-primary').trim() || (isDark ? '#A8C7FA' : '#0B57D0');

    ctx.fillStyle = bgSurface;
    ctx.fillRect(0, 0, viewportSize.w, viewportSize.h);

    const activeGrid = draftGridRef.current ?? grid;
    const rulerInset = showCoordinates ? RULER_SIZE : 0;

    // Visible cell bounds culling for 200x200 60fps rendering
    const minCol = Math.max(0, Math.floor((rulerInset - originX) / cellPx));
    const maxCol = Math.min(width - 1, Math.floor((viewportSize.w - rulerInset - originX) / cellPx));
    const minRow = Math.max(0, Math.floor((rulerInset - originY) / cellPx));
    const maxRow = Math.min(height - 1, Math.floor((viewportSize.h - rulerInset - originY) / cellPx));

    // Board backing with subtle Gemini-style ambient shadow (reset immediately so cells stay crisp/fast)
    ctx.save();
    ctx.shadowColor = isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = surfaceBg;
    ctx.fillRect(originX, originY, boardW, boardH);
    ctx.restore();

    // Preview points map for line/rect ghost overlay
    const previewMap = new Set<number>();
    for (const pt of previewPointsRef.current) {
      previewMap.add(pt.y * width + pt.x);
    }

    const canDrawCodes = showCodes && cellPx >= 17;
    if (canDrawCodes) {
      const fontSize = Math.max(8, Math.min(13, Math.floor(cellPx * 0.36)));
      ctx.font = `600 ${fontSize}px "JetBrains Mono", "Roboto Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }

    for (let r = minRow; r <= maxRow; r++) {
      const cy = originY + r * cellPx;
      for (let c = minCol; c <= maxCol; c++) {
        const cx = originX + c * cellPx;
        const idx = r * width + c;
        let colorIdx = idx < activeGrid.length ? activeGrid[idx] : -1;
        const isPreview = previewMap.has(idx);
        if (isPreview) {
          colorIdx = tool === 'eraser' ? -1 : activeColorIndex;
        }

        const bead =
          typeof colorIdx === 'number' && colorIdx >= 0 && colorIdx < palette.colors.length
            ? palette.colors[colorIdx]
            : null;

        if (!bead) {
          // Subtle theme-aware checkerboard for empty cell
          const isDarkCheck = (r + c) % 2 === 1;
          ctx.fillStyle = isDark
            ? isDarkCheck
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(255,255,255,0.02)'
            : isDarkCheck
              ? 'rgba(0,0,0,0.055)'
              : 'rgba(0,0,0,0.015)';
          ctx.fillRect(cx, cy, cellPx + 0.3, cellPx + 0.3);
        } else {
          const isDimmed =
            highlightColorIndex !== null && highlightColorIndex !== colorIdx;

          ctx.save();
          if (isDimmed) ctx.globalAlpha = 0.16;

          ctx.fillStyle = bead.hex;
          if (gridStyle === 'gapped' && cellPx >= 5) {
            const gap = Math.max(0.8, cellPx * 0.08);
            const radius = Math.max(1.5, cellPx * 0.22);
            ctx.beginPath();
            ctx.roundRect(cx + gap * 0.5, cy + gap * 0.5, cellPx - gap, cellPx - gap, radius);
            ctx.fill();
            if (cellPx >= 14) {
              ctx.strokeStyle = 'rgba(0,0,0,0.12)';
              ctx.lineWidth = 0.8;
              ctx.stroke();
            }
          } else {
            ctx.fillRect(cx, cy, cellPx + 0.4, cellPx + 0.4);
          }

          if (canDrawCodes && (!isDimmed || highlightColorIndex === colorIdx)) {
            ctx.fillStyle = getContrastTextColor(bead.rgb);
            ctx.fillText(bead.code, cx + cellPx * 0.5, cy + cellPx * 0.54, cellPx - 2);
          }
          ctx.restore();
        }
      }
    }

    // Thin single-line grid
    if (gridStyle === 'line' && cellPx >= 4) {
      ctx.strokeStyle = 'rgba(120, 128, 138, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = minCol; c <= maxCol + 1; c++) {
        const x = Math.round(originX + c * cellPx) + 0.5;
        ctx.moveTo(x, originY + minRow * cellPx);
        ctx.lineTo(x, originY + (maxRow + 1) * cellPx);
      }
      for (let r = minRow; r <= maxRow + 1; r++) {
        const y = Math.round(originY + r * cellPx) + 0.5;
        ctx.moveTo(originX + minCol * cellPx, y);
        ctx.lineTo(originX + (maxCol + 1) * cellPx, y);
      }
      ctx.stroke();
    }

    // Reference major guide lines (5/10/15/20/25)
    if (guideInterval > 0) {
      ctx.strokeStyle = guideColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let c = 0; c <= width; c += guideInterval) {
        if (c < minCol || c > maxCol + 1) continue;
        const x = Math.round(originX + c * cellPx) + 0.5;
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + boardH);
      }
      for (let r = 0; r <= height; r += guideInterval) {
        if (r < minRow || r > maxRow + 1) continue;
        const y = Math.round(originY + r * cellPx) + 0.5;
        ctx.moveTo(originX, y);
        ctx.lineTo(originX + boardW, y);
      }
      ctx.stroke();
    }

    // Board outer border
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 1;
    ctx.strokeRect(originX, originY, boardW, boardH);

    // Mirror symmetry axis indicators
    if (mirrorX) {
      const mx = Math.round(originX + boardW * 0.5) + 0.5;
      ctx.save();
      ctx.strokeStyle = primaryCol;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx, originY - 6);
      ctx.lineTo(mx, originY + boardH + 6);
      ctx.stroke();
      ctx.restore();
    }
    if (mirrorY) {
      const my = Math.round(originY + boardH * 0.5) + 0.5;
      ctx.save();
      ctx.strokeStyle = primaryCol;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(originX - 6, my);
      ctx.lineTo(originX + boardW + 6, my);
      ctx.stroke();
      ctx.restore();
    }

    // Hover cell cursor & mirrored ghosts
    if (hoverCell && manualEditEnabled && tool !== 'move' && !spacePressed) {
      const pts = getSymmetryPoints(hoverCell.x, hoverCell.y, width, height, mirrorX, mirrorY);
      ctx.strokeStyle = primaryCol;
      ctx.lineWidth = 2;
      for (const pt of pts) {
        ctx.strokeRect(
          originX + pt.x * cellPx + 1,
          originY + pt.y * cellPx + 1,
          Math.max(2, cellPx - 2),
          Math.max(2, cellPx - 2),
        );
      }
    }

    // Four-sided coordinate rulers
    if (showCoordinates) {
      ctx.fillStyle = surfaceBg;
      // Top & bottom bars
      ctx.fillRect(0, 0, viewportSize.w, RULER_SIZE);
      ctx.fillRect(0, viewportSize.h - RULER_SIZE, viewportSize.w, RULER_SIZE);
      // Left & right bars
      ctx.fillRect(0, 0, RULER_SIZE, viewportSize.h);
      ctx.fillRect(viewportSize.w - RULER_SIZE, 0, RULER_SIZE, viewportSize.h);

      ctx.strokeStyle = outlineSubtle;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(RULER_SIZE, RULER_SIZE);
      ctx.lineTo(viewportSize.w - RULER_SIZE, RULER_SIZE);
      ctx.moveTo(RULER_SIZE, viewportSize.h - RULER_SIZE);
      ctx.lineTo(viewportSize.w - RULER_SIZE, viewportSize.h - RULER_SIZE);
      ctx.moveTo(RULER_SIZE, RULER_SIZE);
      ctx.lineTo(RULER_SIZE, viewportSize.h - RULER_SIZE);
      ctx.moveTo(viewportSize.w - RULER_SIZE, RULER_SIZE);
      ctx.lineTo(viewportSize.w - RULER_SIZE, viewportSize.h - RULER_SIZE);
      ctx.stroke();

      const step = cellPx >= 14 ? 1 : cellPx >= 7 ? 2 : cellPx >= 3.5 ? 5 : 10;
      ctx.fillStyle = textMuted;
      ctx.font = '500 10px "JetBrains Mono", "Roboto Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let c = minCol; c <= maxCol; c++) {
        if (step > 1 && (c + 1) % step !== 0 && c !== 0) continue;
        const cx = originX + (c + 0.5) * cellPx;
        if (cx < RULER_SIZE + 8 || cx > viewportSize.w - RULER_SIZE - 8) continue;
        const label = columnIndexToLabel(c, coordFormat);
        const isHover = hoverCell?.x === c;
        if (isHover) ctx.fillStyle = primaryCol;
        ctx.fillText(label, cx, RULER_SIZE * 0.5);
        ctx.fillText(label, cx, viewportSize.h - RULER_SIZE * 0.5);
        if (isHover) ctx.fillStyle = textMuted;
      }

      for (let r = minRow; r <= maxRow; r++) {
        if (step > 1 && (r + 1) % step !== 0 && r !== 0) continue;
        const cy = originY + (r + 0.5) * cellPx;
        if (cy < RULER_SIZE + 8 || cy > viewportSize.h - RULER_SIZE - 8) continue;
        const label = String(r + 1);
        const isHover = hoverCell?.y === r;
        if (isHover) ctx.fillStyle = primaryCol;
        ctx.fillText(label, RULER_SIZE * 0.5, cy);
        ctx.fillText(label, viewportSize.w - RULER_SIZE * 0.5, cy);
        if (isHover) ctx.fillStyle = textMuted;
      }

      // Corner caps
      ctx.fillStyle = bgSurface;
      ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
      ctx.fillRect(viewportSize.w - RULER_SIZE, 0, RULER_SIZE, RULER_SIZE);
      ctx.fillRect(0, viewportSize.h - RULER_SIZE, RULER_SIZE, RULER_SIZE);
      ctx.fillRect(viewportSize.w - RULER_SIZE, viewportSize.h - RULER_SIZE, RULER_SIZE, RULER_SIZE);
    }

    ctx.restore();
  });

  const paintPointsOnDraft = useCallback(
    (points: GridPoint[], value: number) => {
      const draft = draftGridRef.current;
      if (!draft) return;
      for (const pt of points) {
        const symPts = getSymmetryPoints(pt.x, pt.y, width, height, mirrorX, mirrorY);
        for (const sp of symPts) {
          const idx = sp.y * width + sp.x;
          if (draft[idx] !== value) {
            draft[idx] = value;
            strokeChangedCountRef.current++;
          }
        }
      }
    },
    [height, mirrorX, mirrorY, width],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const isPanGesture = tool === 'move' || spacePressed || e.button === 1 || e.button === 2;
    if (isPanGesture) {
      panDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origPanX: panX,
        origPanY: panY,
      };
      return;
    }

    const cell = clientToGrid(e.clientX, e.clientY);
    if (!cell) return;

    if (tool === 'eyedropper') {
      const picked = grid[cell.y * width + cell.x];
      if (picked >= 0) {
        setActiveColorIndex(picked);
      } else {
        setTool('eraser');
      }
      return;
    }

    if (!manualEditEnabled) return;

    if (tool === 'bucket') {
      applyFloodFill(cell.x, cell.y);
      return;
    }

    if (tool === 'line' || tool === 'rect') {
      isDrawingRef.current = true;
      strokeStartRef.current = cell;
      previewPointsRef.current = getSymmetryPoints(cell.x, cell.y, width, height, mirrorX, mirrorY);
      setRenderTick((t) => t + 1);
      return;
    }

    // Brush or Eraser stroke
    isDrawingRef.current = true;
    strokeChangedCountRef.current = 0;
    draftGridRef.current = new Int16Array(grid);
    lastPointRef.current = cell;
    const val = tool === 'eraser' ? -1 : activeColorIndex;
    paintPointsOnDraft([cell], val);
    setRenderTick((t) => t + 1);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panDragRef.current) {
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      setPan(panDragRef.current.origPanX + dx, panDragRef.current.origPanY + dy);
      return;
    }

    const cell = clientToGrid(e.clientX, e.clientY);
    setHoverCell(cell);

    if (!isDrawingRef.current || !cell) return;

    if ((tool === 'line' || tool === 'rect') && strokeStartRef.current) {
      const basePts =
        tool === 'line'
          ? bresenhamLine(strokeStartRef.current.x, strokeStartRef.current.y, cell.x, cell.y)
          : rectanglePoints(strokeStartRef.current.x, strokeStartRef.current.y, cell.x, cell.y, false);
      const symAll: GridPoint[] = [];
      for (const p of basePts) {
        symAll.push(...getSymmetryPoints(p.x, p.y, width, height, mirrorX, mirrorY));
      }
      previewPointsRef.current = symAll;
      setRenderTick((t) => t + 1);
      return;
    }

    if ((tool === 'brush' || tool === 'eraser') && draftGridRef.current) {
      const prev = lastPointRef.current ?? cell;
      const linePts = bresenhamLine(prev.x, prev.y, cell.x, cell.y);
      lastPointRef.current = cell;
      const val = tool === 'eraser' ? -1 : activeColorIndex;
      paintPointsOnDraft(linePts, val);
      setRenderTick((t) => t + 1);
    }
  };

  const finishStroke = () => {
    if (panDragRef.current) {
      panDragRef.current = null;
      return;
    }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if ((tool === 'line' || tool === 'rect') && strokeStartRef.current) {
      const pts = previewPointsRef.current;
      previewPointsRef.current = [];
      strokeStartRef.current = null;
      if (pts.length > 0) {
        const next = new Int16Array(grid);
        let changed = 0;
        for (const pt of pts) {
          const idx = pt.y * width + pt.x;
          if (next[idx] !== activeColorIndex) {
            next[idx] = activeColorIndex;
            changed++;
          }
        }
        if (changed > 0) {
          const bead = palette.colors[activeColorIndex];
          const shapeName = tool === 'line' ? '直线绘制' : '矩形绘制';
          commitGridChange(
            next,
            `${shapeName} · ${bead ? `${bead.code} ${bead.name}` : ''} · ${changed} 格`,
          );
        }
      }
      setRenderTick((t) => t + 1);
      return;
    }

    const draft = draftGridRef.current;
    draftGridRef.current = null;
    lastPointRef.current = null;
    if (draft && strokeChangedCountRef.current > 0) {
      const count = strokeChangedCountRef.current;
      strokeChangedCountRef.current = 0;
      if (tool === 'eraser') {
        commitGridChange(draft, `橡皮擦除 · ${count} 格`);
      } else {
        const bead = palette.colors[activeColorIndex];
        commitGridChange(
          draft,
          bead
            ? `笔刷绘制 · ${bead.hex} · ${bead.name} · ${bead.code} · ${count} 格`
            : `笔刷绘制 · ${count} 格`,
        );
      }
    }
    setRenderTick((t) => t + 1);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextZoom = Math.max(0.1, Math.min(4.0, zoom * factor));
    if (nextZoom === zoom) return;

    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ratio = nextZoom / zoom;
      const nextPanX = panX - (mx - viewportSize.w / 2 - panX) * (ratio - 1);
      const nextPanY = panY - (my - viewportSize.h / 2 - panY) * (ratio - 1);
      setZoom(nextZoom);
      setPan(nextPanX, nextPanY);
    } else {
      setZoom(nextZoom);
    }
  };

  const hoverColor =
    hoverCell && grid[hoverCell.y * width + hoverCell.x] >= 0
      ? palette.colors[grid[hoverCell.y * width + hoverCell.x]]
      : null;

  const cursorClass =
    tool === 'move' || spacePressed
      ? 'cursor-grab active:cursor-grabbing'
      : tool === 'eyedropper'
        ? 'cursor-crosshair'
        : !manualEditEnabled
          ? 'cursor-not-allowed'
          : 'cursor-crosshair';

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-full w-full overflow-hidden select-none"
      style={{ backgroundColor: 'var(--md-surface-container)' }}
    >
      <canvas
        ref={canvasRef}
        className={`block w-full h-full touch-none ${cursorClass}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={() => {
          setHoverCell(null);
          if (isDrawingRef.current) finishStroke();
        }}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
      />

      {/* Bottom floating status pill (hover coords + color + zoom) */}
      <div
        className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 rounded-full text-xs gemini-pill whitespace-nowrap max-w-[94%]"
        style={{
          color: 'var(--md-on-surface)',
        }}
      >
        <span className="font-mono">
          {width}×{height}
        </span>
        <span style={{ color: 'var(--md-outline-variant)' }}>|</span>
        {hoverCell ? (
          <span className="flex items-center gap-1.5 font-mono truncate">
            <span>
              R{hoverCell.y + 1}, C{columnIndexToLabel(hoverCell.x, coordFormat)}
            </span>
            {hoverColor ? (
              <>
                <span
                  className="inline-block w-3 h-3 rounded-full border shrink-0"
                  style={{
                    backgroundColor: hoverColor.hex,
                    borderColor: 'var(--md-outline-variant)',
                  }}
                />
                <span className="truncate">
                  {hoverColor.code} {hoverColor.name}
                </span>
              </>
            ) : (
              <span style={{ color: 'var(--md-on-surface-variant)' }}>空位</span>
            )}
          </span>
        ) : (
          <span className="hidden sm:inline" style={{ color: 'var(--md-on-surface-variant)' }}>
            滚轮缩放 · 空格拖拽平移
          </span>
        )}
        <span className="hidden sm:inline" style={{ color: 'var(--md-outline-variant)' }}>
          |
        </span>
        <button
          type="button"
          onClick={fitCanvasToViewport}
          className="pointer-events-auto font-mono font-medium hover:underline focus-visible:outline-2"
          style={{ color: 'var(--md-primary)' }}
          aria-label="重置视图并适应屏幕"
          title="点击适应窗口"
        >
          {Math.round(zoom * 100)}% 适配
        </button>
      </div>
    </div>
  );
};
