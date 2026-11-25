import { describe, expect, it } from 'vitest';
import {
  deltaE2000,
  deltaE76,
  findNearestPaletteIndex,
  remapGridToSubset,
  selectTopNPaletteIndices,
  srgbToLab,
} from '../colorSpace';
import { BUILTIN_PALETTES } from '../../data/palettes';

describe('colorSpace & palettes', () => {
  it('loads all 11 built-in brand palettes with valid Lab coordinates', () => {
    expect(BUILTIN_PALETTES).toHaveLength(11);
    for (const p of BUILTIN_PALETTES) {
      expect(p.colors.length).toBeGreaterThanOrEqual(90);
      expect(p.colors[0].lab).toHaveLength(3);
      expect(p.colors[0].hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('converts black, white, and red to expected CIELAB values', () => {
    const black = srgbToLab(0, 0, 0);
    const white = srgbToLab(255, 255, 255);
    const red = srgbToLab(255, 0, 0);

    expect(black[0]).toBeCloseTo(0, 1);
    expect(white[0]).toBeCloseTo(100, 1);
    expect(red[1]).toBeGreaterThan(70);
  });

  it('CIEDE2000 satisfies identity and perceptual monotonicity', () => {
    const base = srgbToLab(200, 100, 80);
    const near = srgbToLab(205, 102, 82);
    const far = srgbToLab(40, 180, 220);

    expect(deltaE2000(base, base)).toBe(0);
    expect(deltaE76(base, base)).toBe(0);
    expect(deltaE2000(base, near)).toBeLessThan(deltaE2000(base, far));
  });

  it('matches known MARD color accurately', () => {
    const mard = BUILTIN_PALETTES[0];
    const target = mard.colors.find((c) => c.code === 'A1') ?? mard.colors[0];
    const idx = findNearestPaletteIndex(
      target.rgb[0],
      target.rgb[1],
      target.rgb[2],
      mard.colors,
      'ciede2000',
    );
    expect(mard.colors[idx].code).toBe(target.code);
  });

  it('selectTopNPaletteIndices preserves dominant and accent hues within limit', () => {
    const mard = BUILTIN_PALETTES[0];
    const grid = new Int16Array(100);
    // 80 cells of color 0, 10 cells of color 10, 5 cells of color 30, 5 cells of color 60
    grid.fill(0, 0, 80);
    grid.fill(10, 80, 90);
    grid.fill(30, 90, 95);
    grid.fill(60, 95, 100);

    const subset = selectTopNPaletteIndices(grid, mard.colors, 2, 'ciede2000');
    expect(subset).toHaveLength(2);
    expect(subset).toContain(0);

    const remapped = remapGridToSubset(grid, mard.colors, subset, 'ciede2000');
    const unique = new Set(remapped);
    expect(unique.size).toBeLessThanOrEqual(2);
  });
});
