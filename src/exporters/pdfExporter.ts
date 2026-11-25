import { jsPDF } from 'jspdf';
import type { BeadColor } from '../core/colorSpace';
import { getContrastTextColor } from '../core/colorSpace';
import { columnIndexToLabel, computeBomStats } from '../core/editingTools';
import type { CoordFormat } from '../store/editorStore';

export type PdfLayoutMode = 'fit-page' | 'tiled-5mm';

export interface PdfExportOptions {
  projectName: string;
  brandLabel: string;
  grid: Int16Array;
  width: number;
  height: number;
  palette: readonly BeadColor[];
  layoutMode: PdfLayoutMode;
  includeGuides: boolean;
  includeCoordinates: boolean;
  includeCodes: boolean;
  guideInterval: number;
  guideColor: string;
  coordFormat: CoordFormat;
}

function renderBannerImage(
  title: string,
  subtitle: string,
  widthPx = 1100,
  heightPx = 72,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.fillStyle = '#1F1F1F';
  ctx.font = '700 28px "Inter", "Noto Sans SC", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 4, 24);
  ctx.fillStyle = '#444746';
  ctx.font = '500 20px "Inter", "Noto Sans SC", sans-serif';
  ctx.fillText(subtitle, 4, 54);
  return canvas.toDataURL('image/png');
}

function renderBomPageImage(
  projectName: string,
  brandLabel: string,
  entries: ReturnType<typeof computeBomStats>['entries'],
  totalBeads: number,
): string {
  const w = 1240;
  const cols = 3;
  const rowH = 44;
  const rows = Math.ceil(entries.length / cols);
  const h = Math.max(300, 120 + rows * rowH + 30);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#1F1F1F';
  ctx.font = '700 26px "Inter", "Noto Sans SC", sans-serif';
  ctx.fillText(`${projectName} · 材料采购清单`, 24, 42);
  ctx.fillStyle = '#444746';
  ctx.font = '500 18px "Inter", "Noto Sans SC", sans-serif';
  ctx.fillText(`${brandLabel} · 共 ${entries.length} 色 · 总计 ${totalBeads} 颗豆子`, 24, 74);

  const colW = (w - 48) / cols;
  entries.forEach((entry, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = 24 + col * colW;
    const y = 104 + row * rowH;

    ctx.fillStyle = entry.color.hex;
    ctx.beginPath();
    ctx.roundRect(x, y, 28, 28, 6);
    ctx.fill();
    ctx.strokeStyle = '#C4C7C5';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#1F1F1F';
    ctx.font = '700 16px "JetBrains Mono", monospace';
    ctx.fillText(entry.color.code, x + 38, y + 20);

    ctx.fillStyle = '#444746';
    ctx.font = '500 15px "Inter", "Noto Sans SC", sans-serif';
    ctx.fillText(`${entry.color.name} · ${entry.count}颗`, x + 106, y + 20, colW - 118);
  });

  return canvas.toDataURL('image/png');
}

function drawGridSliceOnPdf(
  doc: jsPDF,
  opts: PdfExportOptions,
  x0Mm: number,
  y0Mm: number,
  cellMm: number,
  colStart: number,
  colEnd: number,
  rowStart: number,
  rowEnd: number,
): void {
  const subW = colEnd - colStart;
  const subH = rowEnd - rowStart;

  for (let r = rowStart; r < rowEnd; r++) {
    const cy = y0Mm + (r - rowStart) * cellMm;
    for (let c = colStart; c < colEnd; c++) {
      const cx = x0Mm + (c - colStart) * cellMm;
      const idx = opts.grid[r * opts.width + c];
      if (idx < 0 || idx >= opts.palette.length) {
        doc.setFillColor(248, 250, 252);
        doc.rect(cx, cy, cellMm, cellMm, 'F');
        continue;
      }
      const bead = opts.palette[idx];
      doc.setFillColor(bead.rgb[0], bead.rgb[1], bead.rgb[2]);
      doc.rect(cx, cy, cellMm, cellMm, 'F');

      if (opts.includeCodes && cellMm >= 3.2) {
        const fg = getContrastTextColor(bead.rgb);
        doc.setTextColor(fg === '#FFFFFF' ? 255 : 31, fg === '#FFFFFF' ? 255 : 31, fg === '#FFFFFF' ? 255 : 31);
        doc.setFont('courier', 'bold');
        doc.setFontSize(Math.max(4.5, Math.min(8, cellMm * 1.45)));
        doc.text(bead.code, cx + cellMm * 0.5, cy + cellMm * 0.56, {
          align: 'center',
          baseline: 'middle',
        });
      }
    }
  }

  // Thin grid lines
  doc.setDrawColor(160, 168, 176);
  doc.setLineWidth(0.12);
  for (let c = 0; c <= subW; c++) {
    const x = x0Mm + c * cellMm;
    doc.line(x, y0Mm, x, y0Mm + subH * cellMm);
  }
  for (let r = 0; r <= subH; r++) {
    const y = y0Mm + r * cellMm;
    doc.line(x0Mm, y, x0Mm + subW * cellMm, y);
  }

  // Major reference guides
  if (opts.includeGuides && opts.guideInterval > 0) {
    const hex = opts.guideColor.replace('#', '');
    const gr = parseInt(hex.slice(0, 2), 16) || 26;
    const gg = parseInt(hex.slice(2, 4), 16) || 115;
    const gb = parseInt(hex.slice(4, 6), 16) || 232;
    doc.setDrawColor(gr, gg, gb);
    doc.setLineWidth(0.45);

    for (let c = colStart; c <= colEnd; c++) {
      if (c % opts.guideInterval === 0) {
        const x = x0Mm + (c - colStart) * cellMm;
        doc.line(x, y0Mm, x, y0Mm + subH * cellMm);
      }
    }
    for (let r = rowStart; r <= rowEnd; r++) {
      if (r % opts.guideInterval === 0) {
        const y = y0Mm + (r - rowStart) * cellMm;
        doc.line(x0Mm, y, x0Mm + subW * cellMm, y);
      }
    }
  }

  // Outer frame
  doc.setDrawColor(31, 31, 31);
  doc.setLineWidth(0.4);
  doc.rect(x0Mm, y0Mm, subW * cellMm, subH * cellMm);

  // Coordinate headers
  if (opts.includeCoordinates) {
    doc.setTextColor(68, 71, 70);
    doc.setFont('courier', 'normal');
    doc.setFontSize(Math.max(4.5, Math.min(7.5, cellMm * 1.4)));
    const step = cellMm >= 3.2 ? 1 : cellMm >= 1.8 ? 2 : 5;
    for (let c = colStart; c < colEnd; c++) {
      if (step > 1 && (c + 1) % step !== 0 && c !== colStart) continue;
      const lbl = columnIndexToLabel(c, opts.coordFormat);
      const cx = x0Mm + (c - colStart + 0.5) * cellMm;
      doc.text(lbl, cx, y0Mm - 1.5, { align: 'center' });
      doc.text(lbl, cx, y0Mm + subH * cellMm + 3.2, { align: 'center' });
    }
    for (let r = rowStart; r < rowEnd; r++) {
      if (step > 1 && (r + 1) % step !== 0 && r !== rowStart) continue;
      const cy = y0Mm + (r - rowStart + 0.5) * cellMm;
      doc.text(String(r + 1), x0Mm - 1.5, cy + 0.6, { align: 'right' });
      doc.text(String(r + 1), x0Mm + subW * cellMm + 1.5, cy + 0.6, { align: 'left' });
    }
  }
}

export function buildPatternPdf(opts: PdfExportOptions): {
  doc: jsPDF;
  pageCount: number;
  tileSummary: string[];
} {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const margin = 12;
  const bom = computeBomStats(opts.grid, opts.palette);
  const tileSummary: string[] = [];

  // Page 1: Overview / Fit-Page Pattern
  const headerImg = renderBannerImage(
    opts.projectName,
    `${opts.width}x${opts.height} | ${opts.brandLabel} | ${bom.filledCount} beads / ${bom.entries.length} colors`,
  );
  doc.addImage(headerImg, 'PNG', margin, 8, pageW - margin * 2, 12);

  const availW = pageW - margin * 2 - 12;
  const availH = pageH - 42;
  const fitCellMm = Math.min(availW / opts.width, availH / opts.height);
  const boardW = fitCellMm * opts.width;
  const startX = (pageW - boardW) / 2;
  const startY = 26;

  drawGridSliceOnPdf(
    doc,
    { ...opts, includeCodes: opts.layoutMode === 'fit-page' ? opts.includeCodes : false },
    startX,
    startY,
    fitCellMm,
    0,
    opts.width,
    0,
    opts.height,
  );
  tileSummary.push('总览索引页');

  // Tiled 5mm/cell pages aligned to guideInterval
  if (opts.layoutMode === 'tiled-5mm') {
    const targetCellMm = 5;
    const maxColsPerPage = Math.floor((pageW - margin * 2 - 14) / targetCellMm); // ~34
    const maxRowsPerPage = Math.floor((pageH - 44) / targetCellMm); // ~50

    const interval = opts.guideInterval > 0 ? opts.guideInterval : 10;
    const colsPerPage =
      interval <= maxColsPerPage
        ? Math.max(interval, Math.floor(maxColsPerPage / interval) * interval)
        : maxColsPerPage;
    const rowsPerPage =
      interval <= maxRowsPerPage
        ? Math.max(interval, Math.floor(maxRowsPerPage / interval) * interval)
        : maxRowsPerPage;

    // Draw dashed tile grid overlay on Page 1 index map
    doc.setDrawColor(11, 87, 208);
    doc.setLineWidth(0.35);
    let pageIdx = 1;
    for (let r0 = 0; r0 < opts.height; r0 += rowsPerPage) {
      const r1 = Math.min(opts.height, r0 + rowsPerPage);
      for (let c0 = 0; c0 < opts.width; c0 += colsPerPage) {
        const c1 = Math.min(opts.width, c0 + colsPerPage);
        const rx = startX + c0 * fitCellMm;
        const ry = startY + r0 * fitCellMm;
        const rw = (c1 - c0) * fitCellMm;
        const rh = (r1 - r0) * fitCellMm;
        doc.rect(rx, ry, rw, rh);
        doc.setTextColor(11, 87, 208);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`P${pageIdx}`, rx + 2, ry + 4);
        pageIdx++;
      }
    }

    // Add each tile page
    let tileNum = 1;
    for (let r0 = 0; r0 < opts.height; r0 += rowsPerPage) {
      const r1 = Math.min(opts.height, r0 + rowsPerPage);
      for (let c0 = 0; c0 < opts.width; c0 += colsPerPage) {
        const c1 = Math.min(opts.width, c0 + colsPerPage);
        doc.addPage();
        const tag = `P${tileNum} (R${r0 + 1}-${r1}, C${c0 + 1}-${c1})`;
        tileSummary.push(tag);

        const banner = renderBannerImage(
          `${opts.projectName} · ${tag}`,
          `${opts.brandLabel} · 约 5mm/格 清晰打印版`,
        );
        doc.addImage(banner, 'PNG', margin, 8, pageW - margin * 2, 12);

        const subW = c1 - c0;
        const tileCellMm = Math.min(targetCellMm, (pageW - margin * 2 - 14) / subW);
        const tx = (pageW - subW * tileCellMm) / 2;
        drawGridSliceOnPdf(doc, opts, tx, 27, tileCellMm, c0, c1, r0, r1);
        tileNum++;
      }
    }
  }

  // Final Page: BOM checklist
  if (bom.entries.length > 0) {
    doc.addPage();
    tileSummary.push('材料采购清单页');
    const bomImg = renderBomPageImage(opts.projectName, opts.brandLabel, bom.entries, bom.filledCount);
    const props = doc.getImageProperties(bomImg);
    const maxW = pageW - margin * 2;
    const renderH = Math.min(pageH - margin * 2, (props.height / props.width) * maxW);
    doc.addImage(bomImg, 'PNG', margin, margin, maxW, renderH);
  }

  return { doc, pageCount: doc.getNumberOfPages(), tileSummary };
}

export function exportPatternToPdfBlob(opts: PdfExportOptions): {
  blob: Blob;
  pageCount: number;
  tileSummary: string[];
} {
  const { doc, pageCount, tileSummary } = buildPatternPdf(opts);
  const blob = doc.output('blob');
  return { blob, pageCount, tileSummary };
}
