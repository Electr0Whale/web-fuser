import type { BeadColor } from '../core/colorSpace';
import { computeBomStats } from '../core/editingTools';

export interface HtmlChecklistOptions {
  projectName: string;
  brandLabel: string;
  grid: Int16Array;
  width: number;
  height: number;
  palette: readonly BeadColor[];
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateBomHtmlChecklist(opts: HtmlChecklistOptions): string {
  const { projectName, brandLabel, grid, width, height, palette } = opts;
  const bom = computeBomStats(grid, palette);
  const rowsHtml = bom.entries
    .map(
      (entry, i) => `
      <tr>
        <td><input type="checkbox" class="chk" data-code="${esc(entry.color.code)}" /></td>
        <td class="mono">${i + 1}</td>
        <td><span class="swatch" style="background:${entry.color.hex}"></span></td>
        <td class="mono bold">${esc(entry.color.code)}</td>
        <td>${esc(entry.color.name)}</td>
        <td class="mono">${entry.color.hex}</td>
        <td class="mono bold">${entry.count}</td>
        <td class="mono">${(entry.ratio * 100).toFixed(1)}%</td>
      </tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(projectName)} · 拼豆材料清单</title>
<style>
  :root { --bg:#F0F4F9; --card:#FFFFFF; --text:#1F1F1F; --muted:#444746; --border:#C4C7C5; --primary:#0B57D0; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--text); font-family:Inter,"Noto Sans SC",sans-serif; }
  .wrap { max-width:920px; margin:0 auto; background:var(--card); border:1px solid var(--border); border-radius:16px; padding:24px; }
  h1 { margin:0 0 6px; font-size:22px; }
  .meta { color:var(--muted); font-size:13px; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { text-align:left; padding:10px 8px; border-bottom:1px solid #E9EEF6; }
  th { color:var(--muted); font-weight:600; background:#F8FAFD; }
  .mono { font-family:"JetBrains Mono",monospace; }
  .bold { font-weight:600; }
  .swatch { display:inline-block; width:22px; height:22px; border-radius:6px; border:1px solid var(--border); vertical-align:middle; }
  tr.done { opacity:0.45; text-decoration:line-through; }
  @media print { body { background:#FFF; padding:0; } .wrap { border:none; } }
</style>
</head>
<body>
  <div class="wrap">
    <h1>${esc(projectName)} · 材料核对清单</h1>
    <div class="meta">尺寸：${width}×${height} · 色卡：${esc(brandLabel)} · 用色：${bom.entries.length} 色 · 总豆数：${bom.filledCount} 颗</div>
    <table>
      <thead>
        <tr>
          <th>备料</th><th>#</th><th>色块</th><th>色号</th><th>名称</th><th>HEX</th><th>颗数</th><th>占比</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>
  <script>
    document.querySelectorAll('.chk').forEach((el) => {
      el.addEventListener('change', () => {
        el.closest('tr').classList.toggle('done', el.checked);
      });
    });
  </script>
</body>
</html>`;
}

export function exportBomHtmlBlob(opts: HtmlChecklistOptions): Blob {
  return new Blob([generateBomHtmlChecklist(opts)], {
    type: 'text/html;charset=utf-8',
  });
}
