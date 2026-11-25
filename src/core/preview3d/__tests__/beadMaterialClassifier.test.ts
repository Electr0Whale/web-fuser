import { describe, expect, it } from 'vitest';
import type { BeadColor } from '../../colorSpace';
import { classifyBeadColor, summarizeSpecialBeads } from '../beadMaterialClassifier';

function makeColor(code: string, name: string, group: string): BeadColor {
  return {
    code,
    name,
    hex: '#FFFFFF',
    rgb: [255, 255, 255],
    lab: [100, 0, 0],
    group,
  };
}

describe('beadMaterialClassifier', () => {
  it('classifies MARD 291 special series T, Y, P/ZG/Q and standard A-H colors', () => {
    expect(classifyBeadColor('mard-291', makeColor('T1', '浅蓝', 'T'))).toBe('transparent');
    expect(classifyBeadColor('mard-291', makeColor('Y3', '浅黄绿', 'Y'))).toBe('glow');
    expect(classifyBeadColor('mard-291', makeColor('P6', '青绿', 'P'))).toBe('pearlescent');
    expect(classifyBeadColor('mard-291', makeColor('ZG2', '柔橙', 'ZG'))).toBe('pearlescent');
    expect(classifyBeadColor('mard-291', makeColor('Q3', '黄', 'Q'))).toBe('pearlescent');
    expect(classifyBeadColor('mard-291', makeColor('A1', '浅黄', 'A'))).toBe('standard');
    expect(classifyBeadColor('mard-291', makeColor('H7', '纯黑', 'H'))).toBe('standard');
  });

  it('classifies Perler / custom color names by keyword regardless of brandId', () => {
    expect(classifyBeadColor('perler', makeColor('80-19099', 'Clear', 'NUM'))).toBe('transparent');
    expect(classifyBeadColor('custom-1', makeColor('C01', '夜光蓝', 'C'))).toBe('glow');
    expect(classifyBeadColor('perler', makeColor('80-19089', 'Neon Blue', 'NUM'))).toBe('pearlescent');
    expect(classifyBeadColor('perler', makeColor('80-19001', 'White', 'NUM'))).toBe('standard');
  });

  it('summarizes special bead counts accurately across a grid', () => {
    const palette = [
      makeColor('A1', '浅黄', 'A'),
      makeColor('T1', '透明白', 'T'),
      makeColor('Y1', '夜光粉', 'Y'),
      makeColor('P1', '乳白', 'P'),
    ];
    const grid = new Int16Array([-1, 0, 0, 1, 2, 2, 3, -1]);
    const summary = summarizeSpecialBeads(grid, palette, 'mard-291');

    expect(summary).toEqual({
      totalBeads: 6,
      transparentCount: 1,
      glowCount: 2,
      pearlescentCount: 1,
    });
  });
});
