import type { BeadColor } from '../core/colorSpace';
import { getContrastTextColor } from '../core/colorSpace';
import { columnIndexToLabel, computeBomStats } from '../core/editingTools';
import type { CoordFormat } from '../store/editorStore';

export interface SvgExportOptions {
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
  guideInterval: number;
  guideColor: string;
  coordFormat: CoordFormat;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generatePatternSvg(opts: SvgExportOptions): string {
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
    guideInterval,
    guideColor,
    coordFormat,
  } = opts;

  const cellSize = 24;
  const pad = 28;
  const headerH = 52;
  const ruler = includeCoordinates ? 24 : 0;
  const boardW = width * cellSize;
  const boardH = height * cellSize;

  const bom = computeBomStats(grid, palette);
  const contentMinW = Math.max(680, boardW + ruler * 2);
  const svgW = contentMinW + pad * 2;
  const originX = Math.round((svgW - boardW) / 2);
  const originY = headerH + pad + ruler;

  const bomCols = Math.max(1, Math.min(4, Math.floor(contentMinW / 180)));
  const bomRows = Math.ceil(bom.entries.length / bomCols);
  const bomRowH = 28;
  const bomH = includeBom && bom.entries.length > 0 ? 52 + bomRows * bomRowH + 20 : 0;
  const svgH = originY + boardH + ruler + pad + bomH;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
  );
  parts.push(`<rect width="${svgW}" height="${svgH}" fill="#FFFFFF"/>`);

  // Header
  parts.push(
    `<text x="${pad}" y="32" font-family="Inter, Noto Sans SC, sans-serif" font-size="18" font-weight="700" fill="#1F1F1F">${escapeXml(projectName)}</text>`,
  );
  parts.push(
    `<text x="${svgW - pad}" y="32" text-anchor="end" font-family="Inter, Noto Sans SC, sans-serif" font-size="12" fill="#444746">${width}×${height} · ${escapeXml(brandLabel)} · ${bom.filledCount} 颗 / ${bom.entries.length} 色</text>`,
  );

  // Bead cells
  parts.push(`<g id="bead-cells">`);
  for (let r = 0; r < height; r++) {
    const cy = originY + r * cellSize;
    for (let c = 0; c < width; c++) {
      const cx = originX + c * cellSize;
      const idx = grid[r * width + c];
      if (idx < 0 || idx >= palette.length) {
        parts.push(
          `<rect x="${cx}" y="${cy}" width="${cellSize}" height="${cellSize}" fill="${(r + c) % 2 === 1 ? '#F5F7FA' : '#FFFFFF'}"/>`,
        );
        continue;
      }
      const bead = palette[idx];
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${cellSize}" height="${cellSize}" fill="${bead.hex}"/>`,
      );
      if (includeCodes) {
        const fg = getContrastTextColor(bead.rgb);
        parts.push(
          `<text x="${cx + cellSize / 2}" y="${cy + cellSize / 2 + 3}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8.5" font-weight="600" fill="${fg}">${escapeXml(bead.code)}</text>`,
        );
      }
    }
  }
  parts.push(`</g>`);

  // Thin grid lines
  parts.push(`<g id="grid-lines" stroke="#9AA0A6" stroke-opacity="0.35" stroke-width="0.75">`);
  for (let c = 0; c <= width; c++) {
    const x = originX + c * cellSize;
    parts.push(`<line x1="${x}" y1="${originY}" x2="${x}" y2="${originY + boardH}"/>`);
  }
  for (let r = 0; r <= height; r++) {
    const y = originY + r * cellSize;
    parts.push(`<line x1="${originX}" y1="${y}" x2="${originX + boardW}" y2="${y}"/>`);
  }
  parts.push(`</g>`);

  // Reference guides
  if (includeGuides && guideInterval > 0) {
    parts.push(`<g id="guide-lines" stroke="${escapeXml(guideColor)}" stroke-width="1.8">`);
    for (let c = 0; c <= width; c += guideInterval) {
      const x = originX + c * cellSize;
      parts.push(`<line x1="${x}" y1="${originY}" x2="${x}" y2="${originY + boardH}"/>`);
    }
    for (let r = 0; r <= height; r += guideInterval) {
      const y = originY + r * cellSize;
      parts.push(`<line x1="${originX}" y1="${y}" x2="${originX + boardW}" y2="${y}"/>`);
    }
    parts.push(`</g>`);
  }

  parts.push(
    `<rect x="${originX}" y="${originY}" width="${boardW}" height="${boardH}" fill="none" stroke="#1F1F1F" stroke-width="1.5"/>`,
  );

  // Coordinates
  if (includeCoordinates) {
    parts.push(
      `<g id="coordinates" font-family="JetBrains Mono, monospace" font-size="9" fill="#444746" text-anchor="middle">`,
    );
    for (let c = 0; c < width; c++) {
      const lbl = escapeXml(columnIndexToLabel(c, coordFormat));
      const cx = originX + (c + 0.5) * cellSize;
      parts.push(`<text x="${cx}" y="${originY - 8}">${lbl}</text>`);
      parts.push(`<text x="${cx}" y="${originY + boardH + 15}">${lbl}</text>`);
    }
    for (let r = 0; r < height; r++) {
      const cy = originY + (r + 0.5) * cellSize + 3;
      parts.push(`<text x="${originX - 11}" y="${cy}">${r + 1}</text>`);
      parts.push(`<text x="${originX + boardW + 11}" y="${cy}">${r + 1}</text>`);
    }
    parts.push(`</g>`);
  }

  // Vector BOM
  if (includeBom && bom.entries.length > 0) {
    const bomTop = originY + boardH + ruler + 20;
    parts.push(
      `<rect x="${pad}" y="${bomTop}" width="${svgW - pad * 2}" height="${bomH - 12}" rx="10" fill="#F0F4F9"/>`,
    );
    parts.push(
      `<text x="${pad + 14}" y="${bomTop + 26}" font-family="Inter, Noto Sans SC, sans-serif" font-size="13" font-weight="700" fill="#1F1F1F">材料清单 (${bom.entries.length} 色 · 共 ${bom.filledCount} 颗)</text>`,
    );
    const colW = (svgW - pad * 2 - 28) / bomCols;
    bom.entries.forEach((entry, idx) => {
      const col = idx % bomCols;
      const row = Math.floor(idx / bomCols);
      const x = pad + 14 + col * colW;
      const y = bomTop + 42 + row * bomRowH;
      parts.push(
        `<rect x="${x}" y="${y}" width="18" height="18" rx="4" fill="${entry.color.hex}" stroke="#C4C7C5" stroke-width="0.8"/>`,
      );
      parts.push(
        `<text x="${x + 24}" y="${y + 13}" font-family="JetBrains Mono, monospace" font-size="11" font-weight="600" fill="#1F1F1F">${escapeXml(entry.color.code)}</text>`,
      );
      parts.push(
        `<text x="${x + 68}" y="${y + 13}" font-family="Inter, Noto Sans SC, sans-serif" font-size="10.5" fill="#444746">${escapeXml(entry.color.name)} × ${entry.count}</text>`,
      );
    });
  }

  parts.push(`</svg>`);
  return parts.join('\n');
}

export function exportPatternToSvgBlob(opts: SvgExportOptions): Blob {
  const xml = generatePatternSvg(opts);
  return new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
}
