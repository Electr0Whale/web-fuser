import { describe, expect, it } from 'vitest';
import {
  bresenhamLine,
  floodFillGrid,
  getSymmetryPoints,
  mergeRareColorsInGrid,
  rectanglePoints,
  replaceColorInGrid,
} from '../editingTools';
import { removeBackgroundFromGrid } from '../backgroundRemoval';
import { BUILTIN_PALETTES } from '../../data/palettes';
import { useEditorStore } from '../../store/editorStore';

describe('editingTools & store rollback', () => {
  it('computes 4-way mirror coordinates without duplicates on center axis', () => {
    const pts = getSymmetryPoints(1, 2, 5, 5, true, true);
    expect(pts).toEqual(
      expect.arrayContaining([
        { x: 1, y: 2 },
        { x: 3, y: 2 },
      ]),
    );
    expect(pts).toHaveLength(2); // y=2 is center row of height=5
  });

  it('draws continuous Bresenham lines and rectangle outlines', () => {
    const line = bresenhamLine(0, 0, 4, 2);
    expect(line[0]).toEqual({ x: 0, y: 0 });
    expect(line[line.length - 1]).toEqual({ x: 4, y: 2 });
    expect(line).toHaveLength(5);

    const rect = rectanglePoints(1, 1, 3, 3, false);
    expect(rect).toHaveLength(8);
  });

  it('floodFillGrid fills connected component and stops at boundaries', () => {
    const grid = new Int16Array(25).fill(0);
    // Wall around (2,2)
    for (let x = 1; x <= 3; x++) {
      grid[1 * 5 + x] = 1;
      grid[3 * 5 + x] = 1;
    }
    grid[2 * 5 + 1] = 1;
    grid[2 * 5 + 3] = 1;

    const { nextGrid, changedCount } = floodFillGrid(grid, 5, 5, 2, 2, 5);
    expect(changedCount).toBe(1);
    expect(nextGrid[2 * 5 + 2]).toBe(5);
    expect(nextGrid[0]).toBe(0);
  });

  it('replaces and merges rare colors cleanly', () => {
    const palette = BUILTIN_PALETTES[0].colors;
    const grid = new Int16Array(20).fill(0);
    grid[0] = 5;
    grid[1] = 5; // count=2 (<5)

    const merged = mergeRareColorsInGrid(grid, palette, 5, 'ciede2000');
    expect(merged.mergedColorCount).toBe(1);
    expect(merged.changedCells).toBe(2);
    expect(merged.nextGrid[0]).toBe(0);

    const replaced = replaceColorInGrid(grid, 5, 12);
    expect(replaced.changedCount).toBe(2);
    expect(replaced.nextGrid[0]).toBe(12);
  });

  it('removes outer connected background without erasing enclosed interior', () => {
    const palette = BUILTIN_PALETTES[0].colors;
    const grid = new Int16Array(25).fill(0);
    // Enclosed 3x3 ring of color 10 around center cell (2,2) of color 0
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        if (x === 2 && y === 2) continue;
        grid[y * 5 + x] = 10;
      }
    }
    const { nextGrid, removedCount } = removeBackgroundFromGrid(grid, 5, 5, palette, 5);
    expect(removedCount).toBe(16);
    expect(nextGrid[0]).toBe(-1);
    expect(nextGrid[2 * 5 + 2]).toBe(0); // interior preserved
  });

  it('store history supports undo, redo, jumpToHistory, and resetToInitial', () => {
    const store = useEditorStore.getState();
    store.newBlankCanvas(10, 10);

    const g1 = new Int16Array(100).fill(-1);
    g1[0] = 1;
    store.commitGridChange(g1, '步1');

    const g2 = new Int16Array(100).fill(-1);
    g2[0] = 1;
    g2[1] = 2;
    store.commitGridChange(g2, '步2');

    expect(useEditorStore.getState().grid[1]).toBe(2);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().grid[1]).toBe(-1);
    expect(useEditorStore.getState().grid[0]).toBe(1);

    useEditorStore.getState().jumpToHistory(2);
    expect(useEditorStore.getState().grid[1]).toBe(2);

    useEditorStore.getState().resetToInitial();
    expect(useEditorStore.getState().grid[0]).toBe(-1);
  });
});
