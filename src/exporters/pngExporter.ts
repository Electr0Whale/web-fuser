import type { BeadColor } from '../core/colorSpace';
import { getContrastTextColor } from '../core/colorSpace';
import { columnIndexToLabel, computeBomStats } from '../core/editingTools';
import type { CoordFormat, GridStyle } from '../store/editorStore';

export interface PngExportOptions {
  projectName: string;
  brandLabel: string;
  grid: Int16Array;
  width: number;
  height: number;
  palette: readonly BeadColor[];
  includeBom: boolean;
  includeGuides: boolean;
  includeCoordinates: boolean;
  includeCodes: boolean;
  gridStyle: GridStyle;
  guideInterval: number;
  guideColor: string;
  coordFormat: CoordFormat;
}

export function renderPatternPngCanvas(opts: PngExportOptions): HTMLCanvasElement {
  const {
    projectName,
    brandLabel,
    grid,
    width,
    height,
    palette,
    includeBom,
    includeGuides,
    includeCoordinates,
    includeCodes,
    gridStyle,
    guideInterval,
    guideColor,
    coordFormat,
  } = opts;

  // Plan requirement: cell >= 32px, code font >= 12px (cap huge 200x200 slightly if needed, 32*200=6400px is fine!)
  const cellPx = Math.max(32, Math.min(44, Math.floor(2400 / Math.max(width, height))));
  const pad = 36;
  const headerH = 68;
  const ruler = includeCoordinates ? 32 : 0;

  const boardW = width * cellPx;
  const boardH = height * cellPx;
  const totalBoardW = boardW + ruler * 2;
  const totalBoardH = boardH + ruler * 2;

  const bom = computeBomStats(grid, palette);
  const bomCols = Math.max(1, Math.min(4, Math.floor((Math.max(760, totalBoardW)) / 240)));
  const bomRowH = 38;
  const bomRows = Math.ceil(bom.entries.length / bomCols);
  const bomSectionH = includeBom ? 64 + Math.max(1, bomRows) * bomRowH + 28 : 0;

  const canvasW = Math.max(820, totalBoardW + pad * 2);
  const canvasH = headerH + totalBoardH + pad * 2 + bomSectionH;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;

  // White M3 paper background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Header
  ctx.fillStyle = '#1F1F1F';
  ctx.font = '700 24px "Inter", "Noto Sans SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(projectName, pad, 34);

  ctx.fillStyle = '#444746';
  ctx.font = '500 14px "Inter", "Noto Sans SC", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(
    `${width}×${height} · ${brandLabel} · 共 ${bom.filledCount} 颗 / ${bom.entries.length} 色`,
    canvasW - pad,
    34,
  );

  ctx.strokeStyle = '#C4C7C5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, headerH - 8);
  ctx.lineTo(canvasW - pad, headerH - 8);
  ctx.stroke();

  const originX = Math.round((canvasW - boardW) / 2);
  const originY = headerH + pad + ruler;

  // Cells
  const fontSize = Math.max(12, Math.floor(cellPx * 0.36));
  ctx.font = `600 ${fontSize}px "JetBrains Mono", "Roboto Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let r = 0; r < height; r++) {
    const cy = originY + r * cellPx;
    for (let c = 0; c < width; c++) {
      const cx = originX + c * cellPx;
      const idx = grid[r * width + c];
      if (idx < 0 || idx >= palette.length) {
        ctx.fillStyle = (r + c) % 2 === 1 ? '#F4F6F9' : '#FFFFFF';
        ctx.fillRect(cx, cy, cellPx, cellPx);
        continue;
      }

      const bead = palette[idx];
      ctx.fillStyle = bead.hex;
      if (gridStyle === 'gapped') {
        const gap = Math.max(2, cellPx * 0.08);
        ctx.beginPath();
        ctx.roundRect(cx + gap * 0.5, cy + gap * 0.5, cellPx - gap, cellPx - gap, cellPx * 0.2);
        ctx.fill();
      } else {
        ctx.fillRect(cx, cy, cellPx, cellPx);
      }

      if (includeCodes) {
        ctx.fillStyle = getContrastTextColor(bead.rgb);
        ctx.fillText(bead.code, cx + cellPx * 0.5, cy + cellPx * 0.52, cellPx - 4);
      }
    }
  }

  // Thin grid lines
  if (gridStyle === 'line') {
    ctx.strokeStyle = 'rgba(100, 110, 120, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= width; c++) {
      const x = originX + c * cellPx + 0.5;
      ctx.moveTo(x, originY);
      ctx.lineTo(x, originY + boardH);
    }
    for (let r = 0; r <= height; r++) {
      const y = originY + r * cellPx + 0.5;
      ctx.moveTo(originX, y);
      ctx.lineTo(originX + boardW, y);
    }
    ctx.stroke();
  }

  // Reference guides
  if (includeGuides && guideInterval > 0) {
    ctx.strokeStyle = guideColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let c = 0; c <= width; c += guideInterval) {
      const x = originX + c * cellPx;
      ctx.moveTo(x, originY);
      ctx.lineTo(x, originY + boardH);
    }
    for (let r = 0; r <= height; r += guideInterval) {
      const y = originY + r * cellPx;
      ctx.moveTo(originX, y);
      ctx.lineTo(originX + boardW, y);
    }
    ctx.stroke();
  }

  // Outer border
  ctx.strokeStyle = '#1F1F1F';
  ctx.lineWidth = 2;
  ctx.strokeRect(originX, originY, boardW, boardH);

  // Coordinate labels
  if (includeCoordinates) {
    ctx.fillStyle = '#444746';
    ctx.font = '600 12px "JetBrains Mono", "Roboto Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let c = 0; c < width; c++) {
      const label = columnIndexToLabel(c, coordFormat);
      const cx = originX + (c + 0.5) * cellPx;
      ctx.fillText(label, cx, originY - ruler * 0.5);
      ctx.fillText(label, cx, originY + boardH + ruler * 0.5);
    }
    for (let r = 0; r < height; r++) {
      const label = String(r + 1);
      const cy = originY + (r + 0.5) * cellPx;
      ctx.fillText(label, originX - ruler * 0.5, cy);
      ctx.fillText(label, originX + boardW + ruler * 0.5, cy);
    }
  }

  // BOM legend section
  if (includeBom && bom.entries.length > 0) {
    const bomTop = originY + boardH + ruler + 28;
    ctx.fillStyle = '#F0F4F9';
    ctx.beginPath();
    ctx.roundRect(pad, bomTop, canvasW - pad * 2, bomSectionH - 20, 12);
    ctx.fill();

    ctx.fillStyle = '#1F1F1F';
    ctx.font = '700 16px "Inter", "Noto Sans SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`材料清单 (${bom.entries.length} 色 · 共 ${bom.filledCount} 颗)`, pad + 18, bomTop + 28);

    const cardW = (canvasW - pad * 2 - 36) / bomCols;
    bom.entries.forEach((entry, idx) => {
      const col = idx % bomCols;
      const row = Math.floor(idx / bomCols);
      const x = pad + 18 + col * cardW;
      const y = bomTop + 52 + row * bomRowH;

      ctx.fillStyle = entry.color.hex;
      ctx.beginPath();
      ctx.roundRect(x, y + 4, 24, 24, 6);
      ctx.fill();
      ctx.strokeStyle = '#C4C7C5';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#1F1F1F';
      ctx.font = '600 13px "JetBrains Mono", "Roboto Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(entry.color.code, x + 32, y + 16);

      ctx.fillStyle = '#444746';
      ctx.font = '400 12px "Inter", "Noto Sans SC", sans-serif';
      ctx.fillText(`${entry.color.name} × ${entry.count}`, x + 82, y + 16, cardW - 92);
    });
  }

  return canvas;
}

export function exportPatternToPngBlob(opts: PngExportOptions): Promise<Blob> {
  const canvas = renderPatternPngCanvas(opts);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('生成 PNG 图片失败'));
    }, 'image/png');
  });
}
