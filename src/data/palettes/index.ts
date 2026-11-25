import mard221 from './mard-221.json';
import mard291 from './mard-291.json';
import youkenC197 from './youken-c197.json';
import youkenM221 from './youken-m221.json';
import youken418 from './youken-418.json';
import coco291 from './coco-291.json';
import manman278 from './manman-278.json';
import mixiaowo290 from './mixiaowo-290.json';
import panpan289 from './panpan-289.json';
import hamaMidi from './hama-midi.json';
import perler from './perler.json';
import {
  type BeadBrandPalette,
  type BeadColor,
  hexToRgb,
  rgbToHex,
  srgbToLab,
} from '../../core/colorSpace';

export type { BeadBrandPalette, BeadColor };

export const BUILTIN_PALETTES: BeadBrandPalette[] = [
  mard221 as BeadBrandPalette,
  mard291 as BeadBrandPalette,
  youkenC197 as BeadBrandPalette,
  youkenM221 as BeadBrandPalette,
  youken418 as BeadBrandPalette,
  coco291 as BeadBrandPalette,
  manman278 as BeadBrandPalette,
  mixiaowo290 as BeadBrandPalette,
  panpan289 as BeadBrandPalette,
  hamaMidi as BeadBrandPalette,
  perler as BeadBrandPalette,
];

export interface ThemeSwatchPreset {
  id: string;
  label: string;
  description: string;
  hexes: string[];
}

export const THEME_SWATCH_PRESETS: ThemeSwatchPreset[] = [
  {
    id: 'cream-bear',
    label: '奶油熊',
    description: '温暖米白、焦糖棕与奶咖色系',
    hexes: ['#FFFDF7', '#FAF0DC', '#F3D9B1', '#E3B27C', '#B97A49', '#7D4A28', '#3F271B', '#F5A3A3'],
  },
  {
    id: 'macaron',
    label: '马卡龙',
    description: '高明度低饱和粉彩糖果色系',
    hexes: ['#FFF6F8', '#FFD6E0', '#FFE8C2', '#FFF6B3', '#D4F5DD', '#CBE8FF', '#E2D4FF', '#4A4458'],
  },
  {
    id: 'retro-pixel',
    label: '复古像素',
    description: '经典 8-bit 掌机高对比基础色',
    hexes: ['#FFFFFF', '#1F1F1F', '#D9383A', '#F28B30', '#F5D342', '#44A85B', '#2F77D0', '#8C54B8'],
  },
  {
    id: 'morandi',
    label: '莫兰迪柔色',
    description: '低彩度高级灰调，适合人物与风景',
    hexes: ['#F2EFE9', '#D6CEC2', '#B5A899', '#99A89E', '#8EA3B5', '#B9989B', '#6E6A67', '#3B3938'],
  },
];

export function getPaletteById(
  id: string,
  customPalettes: readonly BeadBrandPalette[] = [],
): BeadBrandPalette {
  const all = [...BUILTIN_PALETTES, ...customPalettes];
  return all.find((p) => p.id === id) ?? BUILTIN_PALETTES[0];
}

function normalizeColorEntry(raw: {
  code?: unknown;
  name?: unknown;
  hex?: unknown;
  rgb?: unknown;
  group?: unknown;
}): BeadColor | null {
  const code = String(raw.code ?? '').trim();
  if (!code) return null;

  let rgb: [number, number, number] | null = null;
  if (Array.isArray(raw.rgb) && raw.rgb.length >= 3) {
    const r = Number(raw.rgb[0]);
    const g = Number(raw.rgb[1]);
    const b = Number(raw.rgb[2]);
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      rgb = [
        Math.max(0, Math.min(255, Math.round(r))),
        Math.max(0, Math.min(255, Math.round(g))),
        Math.max(0, Math.min(255, Math.round(b))),
      ];
    }
  } else if (typeof raw.hex === 'string' && raw.hex.trim()) {
    rgb = hexToRgb(raw.hex);
  }
  if (!rgb) return null;

  const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
  const name = String(raw.name ?? '').trim() || code;
  const group =
    String(raw.group ?? '').trim() ||
    (code.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? 'CUSTOM');

  return {
    code,
    name,
    hex,
    rgb,
    lab: srgbToLab(rgb[0], rgb[1], rgb[2]),
    group,
  };
}

/**
 * Parse a user-uploaded .json or .csv custom palette file into a BeadBrandPalette.
 */
export function parseCustomPaletteFile(fileName: string, content: string): BeadBrandPalette {
  const baseName = fileName.replace(/\.(json|csv)$/i, '') || '自定义色卡';
  const id = `custom-${baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
  const colors: BeadColor[] = [];
  const seen = new Set<string>();

  if (fileName.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(content) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { colors?: unknown }).colors)
        ? ((parsed as { colors: unknown[] }).colors)
        : [];
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = normalizeColorEntry(item as Record<string, unknown>);
      if (entry && !seen.has(entry.code)) {
        seen.add(entry.code);
        colors.push(entry);
      }
    }
    const labelName =
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { label?: unknown }).label === 'string'
        ? (parsed as { label: string }).label
        : baseName;
    if (colors.length === 0) {
      throw new Error('JSON 色卡中未找到有效的色号数据（需包含 code 与 hex 或 rgb）。');
    }
    return {
      id,
      label: `${labelName}（自定义）· ${colors.length} 色`,
      source: `Custom JSON (${fileName})`,
      colors,
    };
  }

  // CSV format: code,name,hex OR code,name,r,g,b
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2) continue;
    if (i === 0 && /^(code|色号)/i.test(cols[0])) continue;

    let entry: BeadColor | null = null;
    if (cols.length >= 5 && /^\d+$/.test(cols[2]) && /^\d+$/.test(cols[3]) && /^\d+$/.test(cols[4])) {
      entry = normalizeColorEntry({
        code: cols[0],
        name: cols[1],
        rgb: [Number(cols[2]), Number(cols[3]), Number(cols[4])],
        group: cols[5],
      });
    } else if (cols.length >= 3 && cols[2].startsWith('#')) {
      entry = normalizeColorEntry({ code: cols[0], name: cols[1], hex: cols[2], group: cols[3] });
    } else if (cols[1].startsWith('#')) {
      entry = normalizeColorEntry({ code: cols[0], name: cols[0], hex: cols[1] });
    }
    if (entry && !seen.has(entry.code)) {
      seen.add(entry.code);
      colors.push(entry);
    }
  }

  if (colors.length === 0) {
    throw new Error('CSV 色卡格式无法识别，支持 "code,name,#HEX" 或 "code,name,R,G,B"。');
  }

  return {
    id,
    label: `${baseName}（自定义）· ${colors.length} 色`,
    source: `Custom CSV (${fileName})`,
    colors,
  };
}
