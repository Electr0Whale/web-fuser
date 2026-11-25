import { describe, expect, it } from 'vitest';
import {
  CRAFT_PRESETS,
  computePhysicalDimensions,
  getCraftPreset,
} from '../craftCatalog';
import {
  generateCraftHeightAndRoughness,
  heightToNormalRgba,
  sampleCraftDeformation,
} from '../craftTextures';

describe('craftCatalog & procedural craft textures', () => {
  it('defines all 16 unique craft presets with valid physical bounds', () => {
    expect(CRAFT_PRESETS).toHaveLength(16);
    const ids = new Set(CRAFT_PRESETS.map((c) => c.id));
    expect(ids.size).toBe(16);

    for (const preset of CRAFT_PRESETS) {
      expect(preset.roughness).toBeGreaterThanOrEqual(0);
      expect(preset.roughness).toBeLessThanOrEqual(1);
      expect(preset.clearcoat).toBeGreaterThanOrEqual(0);
      expect(preset.clearcoat).toBeLessThanOrEqual(1);
      expect(getCraftPreset(preset.id).name).toBe(preset.name);
    }
  });

  it('scales physical dimensions accurately between 2.6mm mini and 5.0mm midi beads', () => {
    const mini = computePhysicalDimensions(52, 52, 2.6, 'standard', 0.5);
    const midi = computePhysicalDimensions(52, 52, 5.0, 'standard', 0.5);

    expect(mini.widthMm).toBeCloseTo(135.2, 1);
    expect(mini.widthCm).toBeCloseTo(13.5, 1);
    expect(midi.widthMm).toBeCloseTo(260.0, 1);
    expect(midi.widthCm).toBeCloseTo(26.0, 1);
    expect(midi.thicknessWorld).toBeGreaterThan(mini.thicknessWorld);
  });

  it('monotonically decreases thickness and hole radius as meltLevel increases', () => {
    const lowMelt = computePhysicalDimensions(29, 29, 2.6, 'double-holed', 0.1);
    const highMelt = computePhysicalDimensions(29, 29, 2.6, 'double-holed', 0.9);
    expect(highMelt.thicknessWorld).toBeLessThan(lowMelt.thicknessWorld);
    expect(highMelt.holeRadiusRatio).toBeLessThan(lowMelt.holeRadiusRatio);

    const slabLow = computePhysicalDimensions(29, 29, 2.6, 'standard', 0.1);
    const slabHigh = computePhysicalDimensions(29, 29, 2.6, 'standard', 0.9);
    expect(slabHigh.thicknessWorld).toBeLessThan(slabLow.thicknessWorld);
    expect(slabHigh.seamStrength).toBeLessThan(slabLow.seamStrength);
  });

  it('generates valid NaN-free height, normal, roughness, and sparkle buffers for all 14 slab crafts', () => {
    const slabCrafts = CRAFT_PRESETS.filter((c) => c.geometryMode === 'slab');
    expect(slabCrafts).toHaveLength(14);

    for (const craft of slabCrafts) {
      const { height, roughness, sparkle } = generateCraftHeightAndRoughness(craft.id, 64);
      expect(height.length).toBe(64 * 64);
      expect(roughness.length).toBe(64 * 64);

      for (let i = 0; i < height.length; i++) {
        expect(Number.isFinite(height[i])).toBe(true);
        expect(height[i]).toBeGreaterThanOrEqual(0);
        expect(height[i]).toBeLessThanOrEqual(1);
      }

      const normalRgba = heightToNormalRgba(height, 64, craft.normalScale);
      expect(normalRgba.length).toBe(64 * 64 * 4);
      // Sample center pixel Z component should point forward (> 127)
      const centerZ = normalRgba[(32 * 64 + 32) * 4 + 2];
      expect(centerZ).toBeGreaterThan(127);

      if (craft.category === 'glitter') {
        expect(sparkle).not.toBeNull();
        expect(sparkle!.length).toBe(64 * 64 * 4);
      } else {
        expect(sparkle).toBeNull();
      }
    }
  });

  it('softens random-crinkle normalScale and returns bounded deformation offsets', () => {
    const crinkle = getCraftPreset('random-crinkle');
    expect(crinkle.normalScale).toBeLessThanOrEqual(0.75);

    for (const craft of CRAFT_PRESETS) {
      const val = sampleCraftDeformation(craft.id, 1.37, -2.84);
      expect(Number.isFinite(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(-1);
      expect(val).toBeLessThanOrEqual(1);
    }
  });
});
