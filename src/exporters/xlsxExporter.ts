import * as XLSX from 'xlsx';
import type { BeadColor } from '../core/colorSpace';
import { columnIndexToLabel, computeBomStats } from '../core/editingTools';
import type { CoordFormat } from '../store/editorStore';

export interface XlsxExportOptions {
  projectName: string;
  brandLabel: string;
  grid: Int16Array;
  width: number;
  height: number;
  palette: readonly BeadColor[];
  coordFormat: CoordFormat;
}

export function buildPatternWorkbook(opts: XlsxExportOptions): XLSX.WorkBook {
  const { grid, width, height, palette, coordFormat } = opts;
  const bom = computeBomStats(grid, palette);

  const bomRows: Array<Array<string | number>> = [
    ['序号', '色号', '颜色名称', '色系', 'HEX', 'RGB', '颗数', '占比'],
  ];
  bom.entries.forEach((entry, idx) => {
    bomRows.push([
      idx + 1,
      entry.color.code,
      entry.color.name,
      entry.color.group ?? '',
      entry.color.hex,
      entry.color.rgb.join(', '),
      entry.count,
      `${(entry.ratio * 100).toFixed(2)}%`,
    ]);
  });
  bomRows.push(['', '合计', `${bom.entries.length} 色`, '', '', '', bom.filledCount, '100%']);

  const matrixRows: Array<Array<string>> = [];
  const headerRow = ['行\\列'];
  for (let c = 0; c < width; c++) {
    headerRow.push(columnIndexToLabel(c, coordFormat));
  }
  matrixRows.push(headerRow);

  for (let r = 0; r < height; r++) {
    const row = [String(r + 1)];
    for (let c = 0; c < width; c++) {
      const idx = grid[r * width + c];
      row.push(idx >= 0 && idx < palette.length ? palette[idx].code : '');
    }
    matrixRows.push(row);
  }

  const wb = XLSX.utils.book_new();
  const wsBom = XLSX.utils.aoa_to_sheet(bomRows);
  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixRows);
  XLSX.utils.book_append_sheet(wb, wsBom, '材料清单');
  XLSX.utils.book_append_sheet(wb, wsMatrix, '像素网格矩阵');
  return wb;
}

export function exportPatternToXlsxBlob(opts: XlsxExportOptions): Blob {
  const wb = buildPatternWorkbook(opts);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
