import * as XLSX from 'xlsx';
import type { BeadBrandPalette, BeadColor } from '../core/colorSpace';
import { getPaletteById } from '../data/palettes';

export interface SavedProjectRecord {
  id: string;
  name: string;
  brandId: string;
  width: number;
  height: number;
  grid: number[];
  thumbnailDataUrl: string;
  beadCount: number;
  createdAt: number;
  updatedAt: number;
}

export type ProjectSortField = 'updatedAt' | 'createdAt' | 'name';

const DB_NAME = 'web-fuser-db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const LS_FALLBACK_KEY = 'web-fuser-projects-v1';
const MAX_SAVED_PROJECTS = 50;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readLocalFallback(): SavedProjectRecord[] {
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedProjectRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocalFallback(items: SavedProjectRecord[]): void {
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(items.slice(0, MAX_SAVED_PROJECTS)));
  } catch {
    // Ignore quota errors on fallback mirror
  }
}

export function generateGridThumbnailDataUrl(
  grid: Int16Array,
  width: number,
  height: number,
  palette: readonly BeadColor[],
): string {
  if (typeof document === 'undefined') return '';
  const maxDim = 96;
  const scale = Math.max(1, Math.floor(maxDim / Math.max(width, height)));
  const cw = width * scale;
  const ch = height * scale;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, cw, ch);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = grid[y * width + x];
      if (idx < 0 || idx >= palette.length) continue;
      ctx.fillStyle = palette[idx].hex;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return canvas.toDataURL('image/png');
}

export async function listSavedProjects(
  sortBy: ProjectSortField = 'updatedAt',
): Promise<SavedProjectRecord[]> {
  let items: SavedProjectRecord[] = [];
  if (hasIndexedDb()) {
    try {
      const db = await openDb();
      items = await new Promise<SavedProjectRecord[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as SavedProjectRecord[]) ?? []);
        req.onerror = () => reject(req.error);
      });
      db.close();
    } catch {
      items = readLocalFallback();
    }
  } else {
    items = readLocalFallback();
  }

  return [...items].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'zh-CN');
    return b[sortBy] - a[sortBy];
  });
}

export async function saveProjectToStorage(input: {
  id?: string | null;
  name: string;
  brandId: string;
  width: number;
  height: number;
  grid: Int16Array;
  palette: readonly BeadColor[];
}): Promise<SavedProjectRecord> {
  const now = Date.now();
  const existingList = await listSavedProjects('updatedAt');
  const existing = input.id ? existingList.find((p) => p.id === input.id) : undefined;
  const id = existing?.id ?? `proj-${now}-${Math.random().toString(36).slice(2, 7)}`;

  let beadCount = 0;
  for (let i = 0; i < input.grid.length; i++) {
    if (input.grid[i] >= 0) beadCount++;
  }

  const record: SavedProjectRecord = {
    id,
    name: input.name.trim() || '未命名拼豆图纸',
    brandId: input.brandId,
    width: input.width,
    height: input.height,
    grid: Array.from(input.grid),
    thumbnailDataUrl: generateGridThumbnailDataUrl(
      input.grid,
      input.width,
      input.height,
      input.palette,
    ),
    beadCount,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  // Enforce max 50 slots by evicting oldest updatedAt entries
  const filtered = existingList.filter((p) => p.id !== id);
  const toDelete = filtered.slice(MAX_SAVED_PROJECTS - 1);
  const nextList = [record, ...filtered.slice(0, MAX_SAVED_PROJECTS - 1)];

  if (hasIndexedDb()) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(record);
        for (const old of toDelete) {
          store.delete(old.id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Fall back to localStorage below
    }
  }

  // Keep lightweight metadata/backup in localStorage (strip grid if huge)
  writeLocalFallback(nextList);
  return record;
}

export async function deleteProjectById(id: string): Promise<void> {
  if (hasIndexedDb()) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // ignore
    }
  }
  const rest = readLocalFallback().filter((p) => p.id !== id);
  writeLocalFallback(rest);
}

export interface ParsedImportedPattern {
  name: string;
  brandId: string;
  width: number;
  height: number;
  grid: Int16Array;
}

function mapCodeMatrixToGrid(
  matrix: string[][],
  palette: BeadBrandPalette,
): { width: number; height: number; grid: Int16Array } {
  const height = matrix.length;
  const width = Math.max(0, ...matrix.map((r) => r.length));
  if (width < 1 || height < 1) {
    throw new Error('导入的矩阵尺寸无效。');
  }
  const codeToIdx = new Map<string, number>();
  palette.colors.forEach((c, idx) => {
    codeToIdx.set(c.code.toUpperCase(), idx);
  });

  const grid = new Int16Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const code = String(matrix[y]?.[x] ?? '').trim().toUpperCase();
      if (!code || code === '-' || code === 'NULL' || code === 'EMPTY') continue;
      const idx = codeToIdx.get(code);
      if (idx !== undefined) {
        grid[y * width + x] = idx;
      }
    }
  }
  return { width, height, grid };
}

export async function parseImportedPatternFile(
  file: File,
  fallbackBrandId: string,
  customPalettes: readonly BeadBrandPalette[] = [],
): Promise<ParsedImportedPattern> {
  const lower = file.name.toLowerCase();
  const baseName = file.name.replace(/\.(json|ddp|csv|xlsx|xls)$/i, '') || '导入图纸';

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName =
      wb.SheetNames.find((n) => n.includes('像素') || n.includes('矩阵') || n.toLowerCase().includes('grid')) ??
      wb.SheetNames[wb.SheetNames.length - 1];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    if (rows.length < 2) throw new Error('Excel 工作表中未找到有效的像素矩阵数据。');

    // Strip header row/col if they look like coordinate headers
    const firstRowIsHeader =
      String(rows[0][0]).includes('行') ||
      String(rows[0][0]).toLowerCase() === 'row' ||
      String(rows[0][1]) === '1' ||
      String(rows[0][1]) === 'A';
    const dataRows = firstRowIsHeader ? rows.slice(1).map((r) => r.slice(1)) : rows;
    const palette = getPaletteById(fallbackBrandId, customPalettes);
    const { width, height, grid } = mapCodeMatrixToGrid(
      dataRows.map((r) => r.map((v) => String(v ?? ''))),
      palette,
    );
    return { name: baseName, brandId: palette.id, width, height, grid };
  }

  const text = await file.text();

  if (lower.endsWith('.csv')) {
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
    const palette = getPaletteById(fallbackBrandId, customPalettes);
    const { width, height, grid } = mapCodeMatrixToGrid(rows, palette);
    return { name: baseName, brandId: palette.id, width, height, grid };
  }

  // .json or .ddp
  const data = JSON.parse(text) as Record<string, unknown>;
  const brandId =
    typeof data.brandId === 'string'
      ? data.brandId
      : typeof data.brand === 'string'
        ? data.brand
        : fallbackBrandId;
  const palette = getPaletteById(brandId, customPalettes);
  const name = typeof data.name === 'string' && data.name.trim() ? data.name : baseName;

  // Format 1: our native JSON archive { width, height, grid: number[] }
  if (typeof data.width === 'number' && typeof data.height === 'number' && Array.isArray(data.grid)) {
    const w = Math.max(8, Math.min(200, Math.round(data.width)));
    const h = Math.max(8, Math.min(200, Math.round(data.height)));
    const grid = new Int16Array(w * h).fill(-1);
    for (let i = 0; i < Math.min(grid.length, data.grid.length); i++) {
      const v = Number(data.grid[i]);
      grid[i] = Number.isInteger(v) && v >= 0 && v < palette.colors.length ? v : -1;
    }
    return { name, brandId: palette.id, width: w, height: h, grid };
  }

  // Format 2: DDP / matrix of color codes { matrix / cells / pattern: (string | null)[][] }
  const matrixCandidate = (data.matrix ?? data.pattern ?? data.cells) as unknown;
  if (Array.isArray(matrixCandidate) && Array.isArray(matrixCandidate[0])) {
    const matrix = (matrixCandidate as unknown[][]).map((row) =>
      row.map((cell) => {
        if (cell === null || cell === undefined) return '';
        if (typeof cell === 'object' && cell !== null && 'code' in cell) {
          return String((cell as { code: unknown }).code ?? '');
        }
        return String(cell);
      }),
    );
    const { width, height, grid } = mapCodeMatrixToGrid(matrix, palette);
    return { name, brandId: palette.id, width, height, grid };
  }

  throw new Error('存档 JSON/DDP 格式不兼容，缺少 width/height/grid 或 matrix 字段。');
}
