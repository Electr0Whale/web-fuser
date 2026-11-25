import { describe, expect, it } from 'vitest';
import type { BeadColor } from '../../colorSpace';
import {
  buildFusedSlabGeometries,
  buildGreedyRects,
  buildInteriorGreedyRects,
  computeBoundaryCellLoop,
  extractBoundaryCells,
} from '../geometryBuilder';

const TEST_PALETTE: BeadColor[] = [
  {
    code: 'A1',
    name: 'Test',
    hex: '#54A7E9',
    rgb: [84, 167, 233],
    lab: [66, -5, -40],
    group: 'A',
  },
];

describe('geometryBuilder pure mesh algorithms', () => {
  it('returns empty rects for an empty grid and 1 rect for a full 200x200 grid', () => {
    const empty = new Int16Array(10 * 10).fill(-1);
    expect(buildGreedyRects(empty, 10, 10)).toEqual([]);

    const full = new Int16Array(200 * 200).fill(3);
    const rects = buildGreedyRects(full, 200, 200);
    expect(rects).toEqual([{ x: 0, y: 0, w: 200, h: 200 }]);
  });

  it('collapses 5x5 solid interior into a single 3x3 square-packed greedy rect', () => {
    const grid = new Int16Array(5 * 5).fill(0);
    const interior = buildInteriorGreedyRects(grid, 5, 5);
    expect(interior).toEqual([{ x: 1, y: 1, w: 3, h: 3 }]);
  });

  it('covers donut shapes with exact non-overlapping rectangles and zero empty cells', () => {
    const w = 5;
    const h = 5;
    const grid = new Int16Array(w * h).fill(1);
    grid[0] = -1;
    grid[4] = -1;
    grid[2 * w + 2] = -1;

    const rects = buildGreedyRects(grid, w, h);
    const covered = new Int16Array(w * h).fill(0);

    for (const r of rects) {
      for (let dy = 0; dy < r.h; dy++) {
        for (let dx = 0; dx < r.w; dx++) {
          const idx = (r.y + dy) * w + (r.x + dx);
          expect(grid[idx]).toBeGreaterThanOrEqual(0);
          expect(covered[idx]).toBe(0);
          covered[idx] = 1;
        }
      }
    }

    for (let i = 0; i < grid.length; i++) {
      expect(covered[i]).toBe(grid[i] >= 0 ? 1 : 0);
    }
  });

  it('extracts exact exposed boundary cells for isolated and solid shapes', () => {
    const solid = new Int16Array(3 * 3).fill(2);
    const cells = extractBoundaryCells(solid, 3, 3);
    expect(cells).toHaveLength(8);
    expect(cells.some((c) => c.x === 1 && c.y === 1)).toBe(false);

    const single = new Int16Array(3 * 3).fill(-1);
    single[1 * 3 + 1] = 5;
    const singleCells = extractBoundaryCells(single, 3, 3);
    expect(singleCells).toEqual([
      {
        x: 1,
        y: 1,
        colorIndex: 5,
        north: true,
        south: true,
        east: true,
        west: true,
      },
    ]);
  });

  it('renders isolated melted beads as true circles and deforms textured boundaries', () => {
    const grid = new Int16Array(3 * 3).fill(-1);
    grid[1 * 3 + 1] = 0;
    const [cell] = extractBoundaryCells(grid, 3, 3);

    // Glossy film has zero deformation -> exact radius 0.5 circle
    const glossyLoop = computeBoundaryCellLoop(cell, grid, 3, 3, 'glossy-film', 0.65, 5);
    expect(glossyLoop.length).toBeGreaterThanOrEqual(16);
    for (const v of glossyLoop) {
      const r = Math.hypot(v.px, v.pz);
      expect(r).toBeCloseTo(0.5, 4);
    }

    // Towel craft introduces organic radial edge irregularity
    const towelLoop = computeBoundaryCellLoop(cell, grid, 3, 3, 'towel', 0.65, 5);
    const radii = towelLoop.map((v) => Math.hypot(v.px, v.pz));
    const spread = Math.max(...radii) - Math.min(...radii);
    expect(spread).toBeGreaterThan(0.01);

    // Full slab build succeeds with matching top/bottom/perimeter buffers
    const slab = buildFusedSlabGeometries(grid, 3, 3, TEST_PALETTE, 0.55, 4, 'towel', 0.65);
    expect(slab.topGeometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(slab.bottomGeometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(slab.perimeterGeometry.getAttribute('position').count).toBeGreaterThan(0);
  });
});
