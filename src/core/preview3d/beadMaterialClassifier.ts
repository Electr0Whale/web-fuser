import type { BeadColor } from '../colorSpace';

export type BeadMaterialKind = 'standard' | 'transparent' | 'glow' | 'pearlescent';

export interface SpecialBeadSummary {
  totalBeads: number;
  transparentCount: number;
  glowCount: number;
  pearlescentCount: number;
}

const MARD_FAMILY_IDS = new Set([
  'mard-221',
  'mard-291',
  'youken-c197',
  'youken-m221',
  'youken-418',
  'coco-291',
  'manman-278',
  'mixiaowo-290',
  'panpan-289',
]);

const TRANSPARENT_NAME_RE = /透明|水晶|clear|translucent|transp/i;
const GLOW_NAME_RE = /夜光|荧光绿|glow|phosphor|luminous/i;
const PEARLESCENT_NAME_RE = /珠光|果冻|pearl|metallic|neon|荧光|炫彩|flash/i;

/**
 * Classify a bead palette entry into physical optical categories:
 * - transparent: MARD/compatible T-series or clear/translucent names
 * - glow: MARD/compatible Y-series or glow-in-the-dark names
 * - pearlescent: MARD/compatible P/ZG/Q special series or pearl/jelly/neon names
 * - standard: regular opaque LDPE/EVA solid bead
 */
export function classifyBeadColor(brandId: string, color: BeadColor): BeadMaterialKind {
  const group = (color.group ?? '').trim().toUpperCase();
  const code = color.code.trim().toUpperCase();
  const name = color.name.trim();
  const isMardFamily = MARD_FAMILY_IDS.has(brandId);

  if (
    (isMardFamily && (group === 'T' || /^T\d+$/i.test(code))) ||
    TRANSPARENT_NAME_RE.test(name)
  ) {
    return 'transparent';
  }

  if (
    (isMardFamily && (group === 'Y' || /^Y\d+$/i.test(code))) ||
    GLOW_NAME_RE.test(name)
  ) {
    return 'glow';
  }

  if (
    (isMardFamily &&
      (group === 'P' ||
        group === 'ZG' ||
        group === 'Q' ||
        /^(P|ZG|Q)\d+$/i.test(code))) ||
    PEARLESCENT_NAME_RE.test(name)
  ) {
    return 'pearlescent';
  }

  return 'standard';
}

export function summarizeSpecialBeads(
  grid: Int16Array,
  palette: readonly BeadColor[],
  brandId: string,
): SpecialBeadSummary {
  const kinds = palette.map((c) => classifyBeadColor(brandId, c));
  let totalBeads = 0;
  let transparentCount = 0;
  let glowCount = 0;
  let pearlescentCount = 0;

  for (let i = 0; i < grid.length; i++) {
    const idx = grid[i];
    if (idx < 0 || idx >= kinds.length) continue;
    totalBeads++;
    const kind = kinds[idx];
    if (kind === 'transparent') transparentCount++;
    else if (kind === 'glow') glowCount++;
    else if (kind === 'pearlescent') pearlescentCount++;
  }

  return {
    totalBeads,
    transparentCount,
    glowCount,
    pearlescentCount,
  };
}
