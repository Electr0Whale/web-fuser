import JSZip from 'jszip';
import type { BeadColor } from '../core/colorSpace';
import type { CoordFormat, GridStyle } from '../store/editorStore';
import { generateBomHtmlChecklist } from './htmlExporter';
import { exportPatternToPdfBlob, type PdfLayoutMode } from './pdfExporter';
import { exportPatternToPngBlob } from './pngExporter';
import { generatePatternSvg } from './svgExporter';
import { exportPatternToXlsxBlob } from './xlsxExporter';

export interface ProjectArchivePayload {
  format: 'web-fuser-pattern-v1';
  name: string;
  brandId: string;
  brandLabel: string;
  width: number;
  height: number;
  grid: number[];
  exportedAt: string;
}

export function generateProjectJson(opts: {
  name: string;
  brandId: string;
  brandLabel: string;
  width: number;
  height: number;
  grid: Int16Array;
}): string {
  const payload: ProjectArchivePayload = {
    format: 'web-fuser-pattern-v1',
    name: opts.name,
    brandId: opts.brandId,
    brandLabel: opts.brandLabel,
    width: opts.width,
    height: opts.height,
    grid: Array.from(opts.grid),
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload, null, 2);
}

export function exportProjectArchiveBlob(opts: {
  name: string;
  brandId: string;
  brandLabel: string;
  width: number;
  height: number;
  grid: Int16Array;
}): Blob {
  return new Blob([generateProjectJson(opts)], { type: 'application/json;charset=utf-8' });
}

export async function exportFullZipBundle(opts: {
  projectName: string;
  brandId: string;
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
  pdfLayoutMode: PdfLayoutMode;
}): Promise<Blob> {
  const zip = new JSZip();
  const safeName = opts.projectName.replace(/[\\/:*?"<>|]+/g, '_') || 'bead-pattern';

  const pngBlob = await exportPatternToPngBlob(opts);
  const svgXml = generatePatternSvg(opts);
  const { blob: pdfBlob } = exportPatternToPdfBlob({
    ...opts,
    layoutMode: opts.pdfLayoutMode,
  });
  const xlsxBlob = exportPatternToXlsxBlob(opts);
  const htmlStr = generateBomHtmlChecklist(opts);
  const jsonStr = generateProjectJson({
    name: opts.projectName,
    brandId: opts.brandId,
    brandLabel: opts.brandLabel,
    width: opts.width,
    height: opts.height,
    grid: opts.grid,
  });

  zip.file(`${safeName}.png`, pngBlob);
  zip.file(`${safeName}.svg`, svgXml);
  zip.file(`${safeName}.pdf`, pdfBlob);
  zip.file(`${safeName}.xlsx`, xlsxBlob);
  zip.file(`${safeName}-清单.html`, htmlStr);
  zip.file(`${safeName}.ddp.json`, jsonStr);

  return zip.generateAsync({ type: 'blob' });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
