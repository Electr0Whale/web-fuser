import * as THREE from 'three';
import type { BeadColor } from '../colorSpace';
import { classifyBeadColor } from './beadMaterialClassifier';
import { type CraftId, getCraftPreset } from './craftCatalog';
import { sampleCraftDeformation } from './craftTextures';
import type { HoledLodLevel } from './performanceTier';

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExposedBoundaryCell {
  x: number;
  y: number;
  colorIndex: number;
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
}

function isCellOccupied(
  grid: Int16Array,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return grid[y * width + x] >= 0;
}

/**
 * Greedy meshing over all occupied cells (`grid[y * width + x] >= 0`).
 * Used for impostor full-sheet planes or general rectangular coverage.
 */
export function buildGreedyRects(
  grid: Int16Array,
  width: number,
  height: number,
): GridRect[] {
  const visited = new Uint8Array(width * height);
  const rects: GridRect[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (visited[startIdx] || grid[startIdx] < 0) continue;

      let w = 1;
      while (
        x + w < width &&
        !visited[y * width + (x + w)] &&
        grid[y * width + (x + w)] >= 0
      ) {
        w++;
      }

      let h = 1;
      outer: while (y + h < height) {
        for (let dx = 0; dx < w; dx++) {
          const idx = (y + h) * width + (x + dx);
          if (visited[idx] || grid[idx] < 0) {
            break outer;
          }
        }
        h++;
      }

      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          visited[(y + dy) * width + (x + dx)] = 1;
        }
      }

      rects.push({ x, y, w, h });
    }
  }

  return rects;
}

/**
 * Greedy meshing strictly over INTERIOR cells (where all 4 cardinal neighbors N, S, E, W are occupied).
 * Interior beads are compressed by surrounding beads into square-packed 1x1 cells,
 * while boundary cells receive rounded/scalloped footprints so shapes are watertight and organic.
 */
export function buildInteriorGreedyRects(
  grid: Int16Array,
  width: number,
  height: number,
): GridRect[] {
  const isInterior = (x: number, y: number): boolean =>
    isCellOccupied(grid, width, height, x, y) &&
    isCellOccupied(grid, width, height, x, y - 1) &&
    isCellOccupied(grid, width, height, x, y + 1) &&
    isCellOccupied(grid, width, height, x - 1, y) &&
    isCellOccupied(grid, width, height, x + 1, y);

  const visited = new Uint8Array(width * height);
  const rects: GridRect[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (visited[startIdx] || !isInterior(x, y)) continue;

      let w = 1;
      while (x + w < width && !visited[y * width + (x + w)] && isInterior(x + w, y)) {
        w++;
      }

      let h = 1;
      outer: while (y + h < height) {
        for (let dx = 0; dx < w; dx++) {
          if (visited[(y + h) * width + (x + dx)] || !isInterior(x + dx, y + h)) {
            break outer;
          }
        }
        h++;
      }

      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          visited[(y + dy) * width + (x + dx)] = 1;
        }
      }

      rects.push({ x, y, w, h });
    }
  }

  return rects;
}

/**
 * Extracts all occupied grid cells that touch at least one empty or out-of-bounds 4-neighbor.
 */
export function extractBoundaryCells(
  grid: Int16Array,
  width: number,
  height: number,
): ExposedBoundaryCell[] {
  const out: ExposedBoundaryCell[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colorIndex = grid[y * width + x];
      if (colorIndex < 0) continue;

      const north = !isCellOccupied(grid, width, height, x, y - 1);
      const south = !isCellOccupied(grid, width, height, x, y + 1);
      const west = !isCellOccupied(grid, width, height, x - 1, y);
      const east = !isCellOccupied(grid, width, height, x + 1, y);

      if (north || south || east || west) {
        out.push({ x, y, colorIndex, north, south, east, west });
      }
    }
  }

  return out;
}

export interface BoundaryVertex {
  px: number;
  pz: number;
  nx: number;
  nz: number;
  u: number;
  v: number;
  yJitter: number;
  isExposedSide: boolean;
}

function clampLocalUv(local: number): number {
  return Math.max(0.06, Math.min(0.94, local + 0.5));
}

/**
 * Computes a watertight clockwise (in XZ when viewed from +Y) perimeter polygon for a boundary cell:
 * - Isolated beads become smooth circles (4 quarter-circle arcs).
 * - Clustered boundary beads fuse squarely on occupied sides and form scalloped cushions on exposed edges.
 * - Exposed edges receive deterministic texture-driven radial & vertical irregularity.
 */
export function computeBoundaryCellLoop(
  cell: ExposedBoundaryCell,
  grid: Int16Array,
  width: number,
  height: number,
  craftId: CraftId,
  meltLevel: number,
  arcSegments: number,
): BoundaryVertex[] {
  const segs = Math.max(2, arcSegments);
  const cx = cell.x + 0.5 - width * 0.5;
  const cz = cell.y + 0.5 - height * 0.5;
  const scallopDip = 0.075 * (1 - 0.35 * Math.max(0, Math.min(1, meltLevel)));
  const preset = getCraftPreset(craftId);
  const deformAmp = preset.edgeDeformStrength * (0.75 + 0.4 * meltLevel);

  const occN = !cell.north;
  const occS = !cell.south;
  const occE = !cell.east;
  const occW = !cell.west;
  const occNE = isCellOccupied(grid, width, height, cell.x + 1, cell.y - 1);
  const occSE = isCellOccupied(grid, width, height, cell.x + 1, cell.y + 1);
  const occSW = isCellOccupied(grid, width, height, cell.x - 1, cell.y + 1);
  const occNW = isCellOccupied(grid, width, height, cell.x - 1, cell.y - 1);

  const loop: BoundaryVertex[] = [];

  const pushPoint = (
    lx: number,
    lz: number,
    nx: number,
    nz: number,
    deformable: boolean,
  ) => {
    const basePx = cx + lx;
    const basePz = cz + lz;
    let px = basePx;
    let pz = basePz;
    let yJitter = 0;

    if (deformable && deformAmp > 0) {
      const relief = sampleCraftDeformation(craftId, basePx, basePz);
      const disp = relief * deformAmp;
      px += nx * disp;
      pz += nz * disp;
      yJitter = relief * deformAmp * 0.08;
    }

    // Clamp UV strictly inside this cell's pixel texel to prevent transparent neighbor bleeding
    const u = (cell.x + clampLocalUv(lx)) / width;
    const v = (cell.y + clampLocalUv(lz)) / height;

    // Avoid duplicate consecutive vertices (preserving exposed flag if either is exposed)
    const prev = loop[loop.length - 1];
    if (prev && Math.abs(prev.px - px) < 1e-5 && Math.abs(prev.pz - pz) < 1e-5) {
      prev.isExposedSide = prev.isExposedSide || deformable;
      return;
    }
    loop.push({ px, pz, nx, nz, u, v, yJitter, isExposedSide: deformable });
  };

  // Helper for a straight or scalloped edge half-segment from (lx0, lz0) to (lx1, lz1)
  const pushHalfEdge = (
    lx0: number,
    lz0: number,
    lx1: number,
    lz1: number,
    nx: number,
    nz: number,
    deformable: boolean,
  ) => {
    const steps = deformable ? Math.max(2, segs) : 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lx = lx0 + (lx1 - lx0) * t;
      const lz = lz0 + (lz1 - lz0) * t;
      pushPoint(lx, lz, nx, nz, deformable);
    }
  };

  // Quadrant 1: NE (0, -0.5) -> (0.5, 0)
  if (!occN && !occE) {
    for (let s = 0; s <= segs; s++) {
      const a = -Math.PI * 0.5 + (Math.PI * 0.5 * s) / segs;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      pushPoint(nx * 0.5, nz * 0.5, nx, nz, true);
    }
  } else if (occN && occE) {
    pushPoint(0, -0.5, 0, -1, false);
    pushPoint(0.5, -0.5, 0.7071, -0.7071, false);
    pushPoint(0.5, 0, 1, 0, false);
  } else if (!occN && occE) {
    const dip = occNE ? 0 : scallopDip;
    const seamDeform = !occNE;
    const steps = Math.max(2, segs);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lx = 0.5 * t;
      const lz = -0.5 + dip * (1 - Math.cos(t * Math.PI * 0.5));
      pushPoint(lx, lz, 0, -1, s < steps ? true : seamDeform);
    }
    pushHalfEdge(0.5, -0.5 + dip, 0.5, 0, 1, 0, false);
  } else {
    // occN && !occE
    const dip = occNE ? 0 : scallopDip;
    const seamDeform = !occNE;
    pushHalfEdge(0, -0.5, 0.5 - dip, -0.5, 0, -1, false);
    const steps = Math.max(2, segs);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lx = 0.5 - dip * Math.cos(t * Math.PI * 0.5);
      const lz = -0.5 + 0.5 * t;
      pushPoint(lx, lz, 1, 0, s > 0 ? true : seamDeform);
    }
  }

  // Quadrant 2: SE (0.5, 0) -> (0, 0.5)
  if (!occE && !occS) {
    for (let s = 0; s <= segs; s++) {
      const a = (Math.PI * 0.5 * s) / segs;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      pushPoint(nx * 0.5, nz * 0.5, nx, nz, true);
    }
  } else if (occE && occS) {
    pushPoint(0.5, 0, 1, 0, false);
    pushPoint(0.5, 0.5, 0.7071, 0.7071, false);
    pushPoint(0, 0.5, 0, 1, false);
  } else if (!occE && occS) {
    const dip = occSE ? 0 : scallopDip;
    const seamDeform = !occSE;
    const steps = Math.max(2, segs);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lx = 0.5 - dip * (1 - Math.cos(t * Math.PI * 0.5));
      const lz = 0.5 * t;
      pushPoint(lx, lz, 1, 0, s < steps ? true : seamDeform);
    }
    pushHalfEdge(0.5 - dip, 0.5, 0, 0.5, 0, 1, false);
  } else {
    // occE && !occS
    const dip = occSE ? 0 : scallopDip;
    const seamDeform = !occSE;
    pushHalfEdge(0.5, 0, 0.5, 0.5 - dip, 1, 0, false);
    const steps = Math.max(2, segs);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lx = 0.5 * (1 - t);
      const lz = 0.5 - dip * Math.cos(t * Math.PI * 0.5);
      pushPoint(lx, lz, 0, 1, s > 0 ? true : seamDeform);
    }
  }

  // Quadrant 3: SW (0, 0.5) -> (-0.5, 0)
  if (!occS && !occW) {
    for (let s = 0; s <= segs; s++) {
      const a = Math.PI * 0.5 + (Math.PI * 0.5 * s) / segs;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      pushPoint(nx * 0.5, nz * 0.5, nx, nz, true);
    }
  } else if (occS && occW) {
    pushPoint(0, 0.5, 0, 1, false);
    pushPoint(-0.5, 0.5, -0.7071, 0.7071, false);
    pushPoint(-0.5, 0, -1, 0, false);
  } else if (!occS && occW) {
    const dip = occSW ? 0 : scallopDip;
    const seamDeform = !occSW;
    const steps = Math.max(2, segs);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lx = -0.5 * t;
      const lz = 0.5 - dip * (1 - Math.cos(t * Math.PI * 0.5));
      pushPoint(lx, lz, 0, 1, s < steps ? true : seamDeform);
    }
    pushHalfEdge(-0.5, 0.5 - dip, -0.5, 0, -1, 0, false);
  } else {
    // occS && !occW
    const dip = occSW ? 0 : scallopDip;
    const seamDeform = !occSW;
    pushHalfEdge(0, 0.5, -0.5 + dip, 0.5, 0, 1, false);
    const steps = Math.max(2, segs);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lx = -0.5 + dip * Math.cos(t * Math.PI * 0.5);
      const lz = 0.5 * (1 - t);
      pushPoint(lx, lz, -1, 0, s > 0 ? true : seamDeform);
    }
  }

  // Quadrant 4: NW (-0.5, 0) -> (0, -0.5)
  if (!occW && !occN) {
    for (let s = 0; s <= segs; s++) {
      const a = Math.PI + (Math.PI * 0.5 * s) / segs;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      pushPoint(nx * 0.5, nz * 0.5, nx, nz, true);
    }
  } else if (occW && occN) {
    pushPoint(-0.5, 0, -1, 0, false);
    pushPoint(-0.5, -0.5, -0.7071, -0.7071, false);
    pushPoint(0, -0.5, 0, -1, false);
  } else if (!occW && occN) {
    const dip = occNW ? 0 : scallopDip;
    const seamDeform = !occNW;
    const steps = Math.max(2, segs);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lx = -0.5 + dip * (1 - Math.cos(t * Math.PI * 0.5));
      const lz = -0.5 * t;
      pushPoint(lx, lz, -1, 0, s < steps ? true : seamDeform);
    }
    pushHalfEdge(-0.5 + dip, -0.5, 0, -0.5, 0, -1, false);
  } else {
    // occW && !occN
    const dip = occNW ? 0 : scallopDip;
    const seamDeform = !occNW;
    pushHalfEdge(-0.5, 0, -0.5, -0.5 + dip, -1, 0, false);
    const steps = Math.max(2, segs);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lx = -0.5 * (1 - t);
      const lz = -0.5 + dip * Math.cos(t * Math.PI * 0.5);
      pushPoint(lx, lz, 0, -1, s > 0 ? true : seamDeform);
    }
  }

  // Remove closing duplicate if it matches loop[0]
  if (loop.length > 2) {
    const first = loop[0];
    const last = loop[loop.length - 1];
    if (Math.abs(first.px - last.px) < 1e-5 && Math.abs(first.pz - last.pz) < 1e-5) {
      first.isExposedSide = first.isExposedSide || last.isExposedSide;
      loop.pop();
    }
  }

  return loop;
}

export interface PixelDataTextures {
  albedoTexture: THREE.DataTexture;
  materialMaskTexture: THREE.DataTexture;
}

/**
 * Builds crisp `width x height` DataTextures for pixel colors and special bead masks.
 * Uses `flipY = false` so UV `(x/width, y/height)` aligns 1:1 with grid rows (top at -Z, bottom at +Z).
 */
export function buildPixelDataTextures(
  grid: Int16Array,
  width: number,
  height: number,
  palette: readonly BeadColor[],
  brandId: string,
  enableSpecialBeads: boolean,
): PixelDataTextures {
  const len = width * height * 4;
  const albedoBytes = new Uint8Array(len);
  const maskBytes = new Uint8Array(len);
  const kinds = palette.map((c) => classifyBeadColor(brandId, c));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cellIdx = y * width + x;
      const colorIdx = grid[cellIdx];
      const o = cellIdx * 4;

      if (colorIdx < 0 || colorIdx >= palette.length) {
        albedoBytes[o] = 0;
        albedoBytes[o + 1] = 0;
        albedoBytes[o + 2] = 0;
        albedoBytes[o + 3] = 0;
        maskBytes[o + 3] = 255;
        continue;
      }

      const rgb = palette[colorIdx].rgb;
      albedoBytes[o] = rgb[0];
      albedoBytes[o + 1] = rgb[1];
      albedoBytes[o + 2] = rgb[2];
      albedoBytes[o + 3] = 255;

      if (enableSpecialBeads) {
        const kind = kinds[colorIdx];
        maskBytes[o] = kind === 'transparent' ? 255 : 0;
        maskBytes[o + 1] = kind === 'glow' ? 255 : 0;
        maskBytes[o + 2] = kind === 'pearlescent' ? 255 : 0;
      }
      maskBytes[o + 3] = 255;
    }
  }

  const albedoTexture = new THREE.DataTexture(albedoBytes, width, height, THREE.RGBAFormat);
  albedoTexture.colorSpace = THREE.SRGBColorSpace;
  albedoTexture.flipY = false;
  albedoTexture.minFilter = THREE.NearestFilter;
  albedoTexture.magFilter = THREE.NearestFilter;
  albedoTexture.generateMipmaps = false;
  albedoTexture.needsUpdate = true;

  const materialMaskTexture = new THREE.DataTexture(maskBytes, width, height, THREE.RGBAFormat);
  materialMaskTexture.colorSpace = THREE.NoColorSpace;
  materialMaskTexture.flipY = false;
  materialMaskTexture.minFilter = THREE.NearestFilter;
  materialMaskTexture.magFilter = THREE.NearestFilter;
  materialMaskTexture.generateMipmaps = false;
  materialMaskTexture.needsUpdate = true;

  return { albedoTexture, materialMaskTexture };
}

function buildCapFromRectsAndLoops(
  rects: readonly GridRect[],
  boundaryLoops: ReadonlyArray<{ cell: ExposedBoundaryCell; loop: BoundaryVertex[] }>,
  width: number,
  height: number,
  yPos: number,
  isTop: boolean,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const ny = isTop ? 1 : -1;

  // 1. Interior greedy rects (square-packed inside the fused sheet)
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const x0 = r.x - width * 0.5;
    const x1 = r.x + r.w - width * 0.5;
    const z0 = r.y - height * 0.5;
    const z1 = r.y + r.h - height * 0.5;

    const u0 = r.x / width;
    const u1 = (r.x + r.w) / width;
    const v0 = r.y / height;
    const v1 = (r.y + r.h) / height;

    if (isTop) {
      // (0,3,2), (0,2,1) -> CCW from +Y
      positions.push(
        x0, yPos, z0, x0, yPos, z1, x1, yPos, z1,
        x0, yPos, z0, x1, yPos, z1, x1, yPos, z0,
      );
      uvs.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
    } else {
      // (0,1,2), (0,2,3) -> CCW from -Y
      positions.push(
        x0, yPos, z0, x1, yPos, z0, x1, yPos, z1,
        x0, yPos, z0, x1, yPos, z1, x0, yPos, z1,
      );
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }

    for (let k = 0; k < 6; k++) {
      normals.push(0, ny, 0);
    }
  }

  // 2. Boundary cell rounded/deformed polygon fans
  for (let i = 0; i < boundaryLoops.length; i++) {
    const { cell, loop } = boundaryLoops[i];
    if (loop.length < 3) continue;

    const cx = cell.x + 0.5 - width * 0.5;
    const cz = cell.y + 0.5 - height * 0.5;
    const cu = (cell.x + 0.5) / width;
    const cv = (cell.y + 0.5) / height;

    for (let s = 0; s < loop.length; s++) {
      const p0 = loop[s];
      const p1 = loop[(s + 1) % loop.length];
      const y0 = yPos + (isTop ? p0.yJitter : -p0.yJitter);
      const y1 = yPos + (isTop ? p1.yJitter : -p1.yJitter);

      if (isTop) {
        // Loop runs clockwise viewed from +Y -> (center, p1, p0) is CCW from +Y
        positions.push(cx, yPos, cz, p1.px, y1, p1.pz, p0.px, y0, p0.pz);
        uvs.push(cu, cv, p1.u, p1.v, p0.u, p0.v);
      } else {
        // Viewed from -Y -> (center, p0, p1) is CCW from -Y
        positions.push(cx, yPos, cz, p0.px, y0, p0.pz, p1.px, y1, p1.pz);
        uvs.push(cu, cv, p0.u, p0.v, p1.u, p1.v);
      }

      for (let k = 0; k < 3; k++) {
        normals.push(0, ny, 0);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geom;
}

function buildPerimeterWallFromLoops(
  boundaryLoops: ReadonlyArray<{ cell: ExposedBoundaryCell; loop: BoundaryVertex[] }>,
  width: number,
  height: number,
  palette: readonly BeadColor[],
  thickness: number,
): THREE.BufferGeometry {
  const halfT = thickness * 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const tmpColor = new THREE.Color();

  for (let i = 0; i < boundaryLoops.length; i++) {
    const { cell, loop } = boundaryLoops[i];
    const col = palette[cell.colorIndex];
    if (!col || loop.length < 3) continue;

    tmpColor.setRGB(col.rgb[0] / 255, col.rgb[1] / 255, col.rgb[2] / 255, THREE.SRGBColorSpace);
    const uCoord = (cell.x + 0.5) / width;
    const vCoord = (cell.y + 0.5) / height;

    for (let s = 0; s < loop.length; s++) {
      const p0 = loop[s];
      const p1 = loop[(s + 1) % loop.length];

      // Only extrude exposed segments (not internal stitch segments shared with occupied neighbors)
      if (!p0.isExposedSide || !p1.isExposedSide) continue;

      const y0Top = halfT + p0.yJitter;
      const y0Bot = -halfT - p0.yJitter;
      const y1Top = halfT + p1.yJitter;
      const y1Bot = -halfT - p1.yJitter;

      positions.push(
        p0.px, y0Bot, p0.pz,
        p0.px, y0Top, p0.pz,
        p1.px, y1Top, p1.pz,

        p0.px, y0Bot, p0.pz,
        p1.px, y1Top, p1.pz,
        p1.px, y1Bot, p1.pz,
      );
      normals.push(
        p0.nx, 0, p0.nz,
        p0.nx, 0, p0.nz,
        p1.nx, 0, p1.nz,

        p0.nx, 0, p0.nz,
        p1.nx, 0, p1.nz,
        p1.nx, 0, p1.nz,
      );
      for (let k = 0; k < 6; k++) {
        colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
        uvs.push(uCoord, vCoord);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geom;
}

export interface FusedSlabGeometries {
  topGeometry: THREE.BufferGeometry;
  bottomGeometry: THREE.BufferGeometry;
  perimeterGeometry: THREE.BufferGeometry;
}

/**
 * Builds watertight fused slab top/bottom caps + matching perimeter side walls:
 * - Interior cells fuse into square-packed greedy rects.
 * - Isolated beads & outer corners are genuinely circular/rounded.
 * - Exposed edges deform organically according to the selected ironing craft texture.
 */
export function buildFusedSlabGeometries(
  grid: Int16Array,
  width: number,
  height: number,
  palette: readonly BeadColor[],
  thickness: number,
  arcSegments: number,
  craftId: CraftId = 'standard',
  meltLevel = 0.65,
  impostorSheetOnly = false,
): FusedSlabGeometries {
  const halfT = thickness * 0.5;

  if (impostorSheetOnly) {
    const rects = buildGreedyRects(grid, width, height);
    return {
      topGeometry: buildCapFromRectsAndLoops(rects, [], width, height, halfT, true),
      bottomGeometry: buildCapFromRectsAndLoops(rects, [], width, height, -halfT, false),
      perimeterGeometry: new THREE.BufferGeometry(),
    };
  }

  const interiorRects = buildInteriorGreedyRects(grid, width, height);
  const boundaryCells = extractBoundaryCells(grid, width, height);
  const boundaryLoops = boundaryCells.map((cell) => ({
    cell,
    loop: computeBoundaryCellLoop(
      cell,
      grid,
      width,
      height,
      craftId,
      meltLevel,
      arcSegments,
    ),
  }));

  return {
    topGeometry: buildCapFromRectsAndLoops(interiorRects, boundaryLoops, width, height, halfT, true),
    bottomGeometry: buildCapFromRectsAndLoops(
      interiorRects,
      boundaryLoops,
      width,
      height,
      -halfT,
      false,
    ),
    perimeterGeometry: buildPerimeterWallFromLoops(
      boundaryLoops,
      width,
      height,
      palette,
      thickness,
    ),
  };
}

export function createHollowBeadGeometry(
  thickness: number,
  holeRadiusRatio: number,
  lod: HoledLodLevel,
): THREE.BufferGeometry {
  const radialSegments = lod === 'high' ? 20 : lod === 'medium' ? 12 : 8;
  const rOut = 0.49;
  const rIn = Math.max(0.12, Math.min(0.42, holeRadiusRatio * 0.5));
  const halfH = thickness * 0.5;
  const bevel = Math.min(0.06, thickness * 0.14);

  const points: THREE.Vector2[] = [
    new THREE.Vector2(rIn, -halfH + bevel * 0.5),
    new THREE.Vector2(rIn + bevel * 0.5, -halfH),
    new THREE.Vector2(rOut - bevel, -halfH),
    new THREE.Vector2(rOut, -halfH + bevel),
    new THREE.Vector2(rOut, halfH - bevel),
    new THREE.Vector2(rOut - bevel, halfH),
    new THREE.Vector2(rIn + bevel * 0.5, halfH),
    new THREE.Vector2(rIn, halfH - bevel * 0.5),
    new THREE.Vector2(rIn, -halfH + bevel * 0.5),
  ];

  const geom = new THREE.LatheGeometry(points, radialSegments);
  geom.computeVertexNormals();
  return geom;
}

export interface ChunkedHoledMaterials {
  standardMaterial: THREE.Material;
  transparentMaterial: THREE.Material;
  glowMaterial: THREE.Material;
}

/**
 * Partitions occupied beads into 32x32 spatial chunks and optical material buckets
 * (standard / transparent / glow) for efficient frustum-culled InstancedMesh rendering.
 */
export function buildChunkedHoledBeads(
  grid: Int16Array,
  width: number,
  height: number,
  palette: readonly BeadColor[],
  brandId: string,
  enableSpecialBeads: boolean,
  beadGeometry: THREE.BufferGeometry,
  materials: ChunkedHoledMaterials,
  castShadow: boolean,
  receiveShadow: boolean,
): THREE.Group {
  const group = new THREE.Group();
  const chunkSize = 32;
  const kinds = palette.map((c) => classifyBeadColor(brandId, c));
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  type BucketKey = 'standard' | 'transparent' | 'glow';

  for (let cy = 0; cy < height; cy += chunkSize) {
    const yEnd = Math.min(height, cy + chunkSize);
    for (let cx = 0; cx < width; cx += chunkSize) {
      const xEnd = Math.min(width, cx + chunkSize);

      const buckets: Record<BucketKey, Array<{ x: number; y: number; colorIdx: number }>> = {
        standard: [],
        transparent: [],
        glow: [],
      };

      for (let y = cy; y < yEnd; y++) {
        for (let x = cx; x < xEnd; x++) {
          const colorIdx = grid[y * width + x];
          if (colorIdx < 0 || colorIdx >= palette.length) continue;

          let bucket: BucketKey = 'standard';
          if (enableSpecialBeads) {
            const kind = kinds[colorIdx];
            if (kind === 'transparent') bucket = 'transparent';
            else if (kind === 'glow') bucket = 'glow';
          }
          buckets[bucket].push({ x, y, colorIdx });
        }
      }

      const bucketPairs: Array<[BucketKey, THREE.Material]> = [
        ['standard', materials.standardMaterial],
        ['transparent', materials.transparentMaterial],
        ['glow', materials.glowMaterial],
      ];

      for (const [key, mat] of bucketPairs) {
        const list = buckets[key];
        if (list.length === 0) continue;

        const mesh = new THREE.InstancedMesh(beadGeometry, mat, list.length);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;

        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          dummy.position.set(
            item.x + 0.5 - width * 0.5,
            0,
            item.y + 0.5 - height * 0.5,
          );
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);

          const rgb = palette[item.colorIdx].rgb;
          tmpColor.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
          mesh.setColorAt(i, tmpColor);
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    }
  }

  return group;
}

/**
 * Builds a translucent acrylic pegboard + peg pins underneath unfused beads.
 * Skips individual pegs if total cells > 16,000 to protect low-end GPUs.
 */
export function buildPegboardGroup(
  width: number,
  height: number,
  beadThickness: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseThickness = 0.35;
  const pad = 1.2;

  const boardGeom = new THREE.BoxGeometry(width + pad * 2, baseThickness, height + pad * 2);
  const boardMat = new THREE.MeshStandardMaterial({
    color: 0xeaf2fa,
    roughness: 0.25,
    metalness: 0.0,
    transparent: true,
    opacity: 0.52,
  });
  const board = new THREE.Mesh(boardGeom, boardMat);
  board.position.y = -beadThickness * 0.5 - baseThickness * 0.5 - 0.01;
  board.receiveShadow = true;
  group.add(board);

  const totalCells = width * height;
  if (totalCells <= 16000) {
    const pegHeight = beadThickness * 0.85;
    const pegGeom = new THREE.CylinderGeometry(0.16, 0.19, pegHeight, 6);
    const pegMat = new THREE.MeshStandardMaterial({
      color: 0xdbe7f3,
      roughness: 0.3,
      transparent: true,
      opacity: 0.65,
    });
    const pegs = new THREE.InstancedMesh(pegGeom, pegMat, totalCells);
    const dummy = new THREE.Object3D();
    const pegY = -beadThickness * 0.5 + pegHeight * 0.5;
    let idx = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        dummy.position.set(x + 0.5 - width * 0.5, pegY, y + 0.5 - height * 0.5);
        dummy.updateMatrix();
        pegs.setMatrixAt(idx++, dummy.matrix);
      }
    }
    pegs.instanceMatrix.needsUpdate = true;
    group.add(pegs);
  }

  return group;
}
