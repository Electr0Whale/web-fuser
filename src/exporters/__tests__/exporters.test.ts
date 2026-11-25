import { describe, expect, it } from 'vitest';
import { computeBomStats } from '../../core/editingTools';
import { BUILTIN_PALETTES } from '../../data/palettes';
import { generateProjectJson } from '../archiveExporter';
import { generateBomHtmlChecklist } from '../htmlExporter';
import { generatePatternSvg } from '../svgExporter';
import { buildPatternWorkbook } from '../xlsxExporter';

describe('exporters & BOM conservation', () => {
  const palette = BUILTIN_PALETTES[0];
  const width = 10;
  const height = 10;
  const grid = new Int16Array(width * height).fill(-1);
  grid.fill(0, 0, 25);
  grid.fill(4, 25, 40);
  grid.fill(12, 40, 45);

  it('conserves total bead count across BOM entries', () => {
    const bom = computeBomStats(grid, palette.colors);
    const sum = bom.entries.reduce((acc, e) => acc + e.count, 0);
    expect(sum).toBe(45);
    expect(bom.filledCount).toBe(45);
    expect(bom.emptyCount).toBe(55);
  });

  it('generates valid SVG XML containing cells, guides, and BOM', () => {
    const svg = generatePatternSvg({
      projectName: '测试图案',
      brandLabel: palette.label,
      grid,
      width,
      height,
      palette: palette.colors,
      includeBom: true,
      includeGuides: true,
      includeCoordinates: true,
      includeCodes: true,
      guideInterval: 5,
      guideColor: '#1A73E8',
      coordFormat: 'number',
    });

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('id="bead-cells"');
    expect(svg).toContain('id="guide-lines"');
    expect(svg).toContain(palette.colors[0].code);
  });

  it('generates lossless JSON archive and standalone HTML checklist', () => {
    const jsonStr = generateProjectJson({
      name: '小熊存档',
      brandId: palette.id,
      brandLabel: palette.label,
      width,
      height,
      grid,
    });
    const parsed = JSON.parse(jsonStr) as { width: number; height: number; grid: number[]; brandId: string };
    expect(parsed.width).toBe(width);
    expect(parsed.height).toBe(height);
    expect(parsed.brandId).toBe(palette.id);
    expect(Int16Array.from(parsed.grid)).toEqual(grid);

    const html = generateBomHtmlChecklist({
      projectName: '小熊存档',
      brandLabel: palette.label,
      grid,
      width,
      height,
      palette: palette.colors,
    });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain(palette.colors[0].code);
    expect(html).toContain('总豆数：45 颗');
  });

  it('builds XLSX workbook with BOM and matrix sheets', () => {
    const wb = buildPatternWorkbook({
      projectName: '测试表格',
      brandLabel: palette.label,
      grid,
      width,
      height,
      palette: palette.colors,
      coordFormat: 'alpha-col',
    });
    expect(wb.SheetNames).toEqual(['材料清单', '像素网格矩阵']);
  });
});
