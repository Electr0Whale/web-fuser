import * as THREE from 'three';
import { type CraftId, getCraftPreset } from './craftCatalog';

export interface CraftTextureMaps {
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  sparkleMap: THREE.DataTexture | null;
}

export interface CraftProceduralBuffers {
  height: Float32Array;
  roughness: Uint8Array;
  sparkle: Uint8Array | null;
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash2Periodic(ix: number, iy: number, period: number, seed = 0): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let h = (px * 374761393 + py * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoisePeriodic(u: number, v: number, freq: number, seed = 0): number {
  const x = u * freq;
  const y = v * freq;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash2Periodic(ix, iy, freq, seed);
  const n10 = hash2Periodic(ix + 1, iy, freq, seed);
  const n01 = hash2Periodic(ix, iy + 1, freq, seed);
  const n11 = hash2Periodic(ix + 1, iy + 1, freq, seed);

  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

function fbmPeriodic(u: number, v: number, baseFreq: number, octaves: number, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoisePeriodic(u, v, freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / (norm || 1);
}

interface VoronoiResult {
  f1: number;
  f2: number;
  cellHash: number;
  dx: number;
  dy: number;
}

function voronoiPeriodic(u: number, v: number, cells: number, seed = 0): VoronoiResult {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);

  let f1 = 99;
  let f2 = 99;
  let bestHash = 0;
  let bestDx = 0;
  let bestDy = 0;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox;
      const cy = iy + oy;
      const jx = hash2Periodic(cx, cy, cells, seed + 1);
      const jy = hash2Periodic(cx, cy, cells, seed + 2);
      const px = cx + 0.15 + 0.7 * jx;
      const py = cy + 0.15 + 0.7 * jy;
      const dx = px - x;
      const dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        bestHash = hash2Periodic(cx, cy, cells, seed + 3);
        bestDx = dx;
        bestDy = dy;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }

  return { f1, f2, cellHash: bestHash, dx: bestDx, dy: bestDy };
}

/**
 * Generate seamless tileable height, roughness, and optional sparkle buffers
 * for any of the 16 craft finishes. Pure JS/TypedArray so it can be unit-tested in Node.
 */
export function generateCraftHeightAndRoughness(
  craftId: CraftId,
  size: number,
): CraftProceduralBuffers {
  const n = size * size;
  const height = new Float32Array(n);
  const roughness = new Uint8Array(n);
  const preset = getCraftPreset(craftId);
  const baseR = preset.roughness;

  const hasSparkle = craftId === 'fine-glitter' || craftId === 'coarse-glitter';
  const sparkle = hasSparkle ? new Uint8Array(n * 4) : null;

  const TAU = Math.PI * 2;

  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const idx = py * size + px;
      let h = 0.5;
      let r = baseR;

      switch (craftId) {
        case 'unfused':
        case 'double-holed': {
          const grain = fbmPeriodic(u, v, 8, 2, 11);
          h = 0.5 + (grain - 0.5) * 0.08;
          r = clamp01(baseR + (grain - 0.5) * 0.08);
          break;
        }
        case 'standard': {
          // Subtle diagonal parchment paper texture
          const diag = Math.sin((u * 12 + v * 12) * TAU) * 0.06;
          const paper = (fbmPeriodic(u, v, 8, 3, 21) - 0.5) * 0.14;
          h = 0.5 + diag + paper;
          r = clamp01(baseR + (fbmPeriodic(u, v, 10, 2, 25) - 0.5) * 0.14);
          break;
        }
        case 'glossy-film': {
          const gentle = (fbmPeriodic(u, v, 3, 2, 31) - 0.5) * 0.04;
          h = 0.5 + gentle;
          r = clamp01(baseR + gentle * 0.4);
          break;
        }
        case 'cinderella': {
          // Flowing domain-warped water-wave silk ridges matching reference photos
          const warp = (fbmPeriodic(u, v, 4, 3, 41) - 0.5) * 2.2;
          const phase = v * 10 * TAU + Math.sin(u * 2 * TAU) * 1.4 + warp * Math.PI;
          const ridge = Math.pow(0.5 + 0.5 * Math.sin(phase), 1.6);
          const fine = Math.sin(v * 20 * TAU + warp * 2.0) * 0.1;
          h = clamp01(0.25 + ridge * 0.62 + fine);
          r = clamp01(baseR + (1 - ridge) * 0.1);
          break;
        }
        case 'waffle': {
          // 2x2 deep square waffle pockets per tile
          const gx = Math.abs(fract(u * 2) - 0.5) * 2;
          const gy = Math.abs(fract(v * 2) - 0.5) * 2;
          const wall = Math.max(smoothstep(0.58, 0.92, gx), smoothstep(0.58, 0.92, gy));
          const micro = (fbmPeriodic(u, v, 12, 2, 51) - 0.5) * 0.06;
          h = clamp01(0.2 + wall * 0.72 + micro);
          r = clamp01(baseR + (1 - wall) * 0.16);
          break;
        }
        case 'steamer-cloth': {
          // Fine 4x4 silicone mesh round-dot dimples
          const cx = fract(u * 4) - 0.5;
          const cy = fract(v * 4) - 0.5;
          const dist = Math.sqrt(cx * cx + cy * cy) * 2;
          const bump = 1 - smoothstep(0.3, 0.9, dist);
          h = clamp01(0.22 + bump * 0.65);
          r = clamp01(baseR + (1 - bump) * 0.12);
          break;
        }
        case 'fabric': {
          // Plain weave warp & weft linen pattern (8x8 threads per tile)
          const tx = Math.floor(u * 8);
          const ty = Math.floor(v * 8);
          const fx = fract(u * 8) - 0.5;
          const fy = fract(v * 8) - 0.5;
          const isWarp = (tx + ty) % 2 === 0;
          const threadH = isWarp
            ? Math.cos(fx * Math.PI) * (0.85 + 0.15 * Math.cos(fy * Math.PI))
            : Math.cos(fy * Math.PI) * (0.85 + 0.15 * Math.cos(fx * Math.PI));
          h = clamp01(0.22 + threadH * 0.68);
          r = clamp01(baseR + (1 - threadH) * 0.12);
          break;
        }
        case 'tea-mat': {
          // 2x2 basket-weave bamboo strips (each block has 3 parallel reeds)
          const bx = Math.floor(u * 2);
          const by = Math.floor(v * 2);
          const lu = fract(u * 2);
          const lv = fract(v * 2);
          const horizontalBlock = (bx + by) % 2 === 0;
          const across = horizontalBlock ? lv : lu;
          const along = horizontalBlock ? lu : lv;
          const reedProfile = Math.abs(Math.sin(across * 3 * Math.PI));
          const tuck = smoothstep(0.0, 0.16, along) * (1 - smoothstep(0.84, 1.0, along));
          h = clamp01(0.18 + reedProfile * (0.45 + 0.32 * tuck));
          r = clamp01(baseR + (1 - reedProfile) * 0.15);
          break;
        }
        case 'diamond-rib': {
          // 45-degree diagonal parallel ribbing + subtle cross-diamond hatch
          const d1 = Math.sin((u + v) * 8 * TAU);
          const d2 = Math.sin((u - v) * 8 * TAU);
          const rib = 0.5 + 0.36 * d1 + 0.14 * d2;
          h = clamp01(rib);
          r = clamp01(baseR + (1 - rib) * 0.14);
          break;
        }
        case 'towel': {
          // Soft fluffy cotton terry loops: warped multi-octave bumps
          const wx = u + (fbmPeriodic(u, v, 6, 2, 71) - 0.5) * 0.08;
          const wy = v + (fbmPeriodic(u, v, 6, 2, 73) - 0.5) * 0.08;
          const loops = fbmPeriodic(wx, wy, 12, 4, 79);
          const tuft = Math.pow(loops, 1.25);
          h = clamp01(0.12 + tuft * 0.85);
          r = clamp01(baseR + (1 - tuft) * 0.14);
          break;
        }
        case 'bath-towel': {
          // High-frequency exfoliating bath-towel grit (matte frosted pebbles)
          const vor = voronoiPeriodic(u, v, 14, 83);
          const grit = 1 - smoothstep(0.05, 0.65, vor.f1);
          const micro = (fbmPeriodic(u, v, 24, 2, 89) - 0.5) * 0.2;
          h = clamp01(0.2 + grit * 0.62 + micro);
          r = clamp01(baseR + (1 - grit) * 0.1);
          break;
        }
        case 'random-crinkle': {
          // Crumpled parchment paper: softer natural Voronoi folds + gentle secondary ripples
          const vor = voronoiPeriodic(u, v, 5, 97);
          const edge = vor.f2 - vor.f1;
          const crease = smoothstep(0.0, 0.24, edge);
          const tiltAngle = vor.cellHash * TAU;
          const facet =
            (vor.dx * Math.cos(tiltAngle) + vor.dy * Math.sin(tiltAngle)) * 0.2 +
            (vor.cellHash - 0.5) * 0.14;
          const softRipple = (fbmPeriodic(u, v, 8, 2, 103) - 0.5) * 0.1;
          h = clamp01(0.38 + crease * 0.24 + facet + softRipple);
          r = clamp01(baseR + (1 - crease) * 0.12);
          break;
        }
        case 'wave-wrinkle': {
          // Smooth continuous horizontal wave ridges
          const warp = (fbmPeriodic(u, v, 3, 2, 101) - 0.5) * 0.6;
          const wave = 0.5 + 0.45 * Math.sin(v * 9 * TAU + warp);
          h = clamp01(wave);
          r = clamp01(baseR + (1 - wave) * 0.12);
          break;
        }
        case 'fine-glitter':
        case 'coarse-glitter': {
          const isCoarse = craftId === 'coarse-glitter';
          const cells = isCoarse ? 14 : 36;
          const vor = voronoiPeriodic(u, v, cells, isCoarse ? 131 : 149);
          const radiusCutoff = isCoarse ? 0.36 : 0.42;
          const inFlake = 1 - smoothstep(radiusCutoff * 0.72, radiusCutoff, vor.f1);
          const active = vor.cellHash < (isCoarse ? 0.55 : 0.78) ? inFlake : 0;

          const baseGrain = (fbmPeriodic(u, v, 10, 2, 163) - 0.5) * 0.08;
          h = clamp01(0.45 + baseGrain + active * (isCoarse ? 0.35 : 0.18));
          r = clamp01(baseR * (1 - active * 0.75) + (1 - active) * 0.08);

          if (sparkle) {
            const sIdx = idx * 4;
            // Random tilted micro-facet normal encoded in [0..255]
            const nxSeed = hash2Periodic(
              Math.floor(vor.cellHash * 1000),
              isCoarse ? 7 : 13,
              1024,
              171,
            );
            const nySeed = hash2Periodic(
              Math.floor(vor.cellHash * 1000),
              isCoarse ? 19 : 29,
              1024,
              181,
            );
            const theta = nxSeed * TAU;
            const tilt = 0.25 + 0.65 * nySeed;
            const nx = Math.cos(theta) * tilt;
            const ny = Math.sin(theta) * tilt;
            const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));

            sparkle[sIdx] = Math.round((nx * 0.5 + 0.5) * 255);
            sparkle[sIdx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            sparkle[sIdx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            sparkle[sIdx + 3] = Math.round(clamp01(active * (0.6 + 0.4 * nySeed)) * 255);
          }
          break;
        }
      }

      height[idx] = h;
      roughness[idx] = Math.round(clamp01(r) * 255);
    }
  }

  return { height, roughness, sparkle };
}

/**
 * Convert a periodic height buffer into a tangent-space normal RGBA8 buffer using Sobel gradients.
 */
export function heightToNormalRgba(
  height: Float32Array,
  size: number,
  strength: number,
): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const sample = (x: number, y: number): number => {
    const sx = ((x % size) + size) % size;
    const sy = ((y % size) + size) % size;
    return height[sy * size + sx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;

      let nx = -dx;
      let ny = -dy;
      let nz = 1.0;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const o = (y * size + x) * 4;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }

  return out;
}

function buildGrayRgbaFromChannel(channel: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(channel.length * 4);
  for (let i = 0; i < channel.length; i++) {
    const v = channel[i];
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  return rgba;
}

const threeTextureCache = new Map<string, CraftTextureMaps>();

export function getCraftThreeTextures(
  craftId: CraftId,
  resolution: number,
): CraftTextureMaps {
  const key = `${craftId}:${resolution}`;
  const cached = threeTextureCache.get(key);
  if (cached) return cached;

  const { height, roughness, sparkle } = generateCraftHeightAndRoughness(craftId, resolution);
  const normalRgba = heightToNormalRgba(height, resolution, 2.8);
  const roughRgba = buildGrayRgbaFromChannel(roughness);

  const normalMap = new THREE.DataTexture(normalRgba, resolution, resolution, THREE.RGBAFormat);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.anisotropy = 4;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(roughRgba, resolution, resolution, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.generateMipmaps = true;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;
  roughnessMap.anisotropy = 4;
  roughnessMap.needsUpdate = true;

  let sparkleMap: THREE.DataTexture | null = null;
  if (sparkle) {
    sparkleMap = new THREE.DataTexture(sparkle, resolution, resolution, THREE.RGBAFormat);
    sparkleMap.wrapS = THREE.RepeatWrapping;
    sparkleMap.wrapT = THREE.RepeatWrapping;
    sparkleMap.colorSpace = THREE.NoColorSpace;
    sparkleMap.generateMipmaps = false;
    sparkleMap.minFilter = THREE.LinearFilter;
    sparkleMap.magFilter = THREE.LinearFilter;
    sparkleMap.needsUpdate = true;
  }

  const maps: CraftTextureMaps = { normalMap, roughnessMap, sparkleMap };
  threeTextureCache.set(key, maps);
  return maps;
}

export function disposeCraftTextureCache(): void {
  for (const maps of threeTextureCache.values()) {
    maps.normalMap.dispose();
    maps.roughnessMap.dispose();
    maps.sparkleMap?.dispose();
  }
  threeTextureCache.clear();
}

const swatchCache = new Map<CraftId, string>();

/**
 * Generates a small shaded preview swatch data URL for UI craft selector cards.
 */
export function generateCraftSwatchDataUrl(craftId: CraftId, size = 64): string {
  const existing = swatchCache.get(craftId);
  if (existing) return existing;
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(size, size);
  const data = img.data;

  if (craftId === 'unfused' || craftId === 'double-holed') {
    const holeRatio = craftId === 'unfused' ? 0.44 : 0.3;
    const cells = 3;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cx = fract((x / size) * cells) - 0.5;
        const cy = fract((y / size) * cells) - 0.5;
        const r = Math.sqrt(cx * cx + cy * cy) * 2;
        const idx = (y * size + x) * 4;
        if (r > 0.94 || r < holeRatio) {
          const bg = r < holeRatio ? 46 : 225;
          data[idx] = bg;
          data[idx + 1] = bg;
          data[idx + 2] = bg;
          data[idx + 3] = 255;
        } else {
          const rimShade = 1.0 - Math.abs(r - (0.94 + holeRatio) * 0.5) * 0.55;
          const spec = Math.max(0, 1 - Math.hypot(cx + 0.16, cy + 0.16) * 3.5) * 58;
          data[idx] = clampByte(72 * rimShade + spec);
          data[idx + 1] = clampByte(162 * rimShade + spec);
          data[idx + 2] = clampByte(234 * rimShade + spec);
          data[idx + 3] = 255;
        }
      }
    }
  } else {
    const { height, sparkle } = generateCraftHeightAndRoughness(craftId, size);
    const normal = heightToNormalRgba(height, size, 2.5);
    const lx = -0.45;
    const ly = -0.65;
    const lz = 0.61;
    const preset = getCraftPreset(craftId);

    for (let i = 0; i < size * size; i++) {
      const o = i * 4;
      const nx = (normal[o] / 255) * 2 - 1;
      const ny = (normal[o + 1] / 255) * 2 - 1;
      const nz = (normal[o + 2] / 255) * 2 - 1;

      const diff = Math.max(0.25, nx * lx + ny * ly + nz * lz);
      const halfZ = (lz + 1) * 0.5;
      const specPow = lerp(12, 72, 1 - preset.roughness);
      const spec = Math.pow(Math.max(0, nx * lx * 0.5 + ny * ly * 0.5 + nz * halfZ), specPow) *
        (0.25 + preset.clearcoat * 0.65);

      let glint = 0;
      if (sparkle) {
        const mask = sparkle[o + 3] / 255;
        if (mask > 0.1) {
          const snx = (sparkle[o] / 255) * 2 - 1;
          const sny = (sparkle[o + 1] / 255) * 2 - 1;
          const snz = (sparkle[o + 2] / 255) * 2 - 1;
          const sDot = Math.max(0, snx * -0.3 + sny * -0.4 + snz * 0.86);
          glint = Math.pow(sDot, 16) * mask * 180;
        }
      }

      data[o] = clampByte(78 * diff + spec * 210 + glint);
      data[o + 1] = clampByte(168 * diff + spec * 220 + glint);
      data[o + 2] = clampByte(236 * diff + spec * 240 + glint);
      data[o + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL('image/png');
  swatchCache.set(craftId, url);
  return url;
}

/**
 * Deterministic periodic relief displacement in [-1, 1] for texture-driven edge irregularity.
 * Must be evaluated strictly from undeformed world (x, z) so adjacent boundary cells share seams.
 */
export function sampleCraftDeformation(
  craftId: CraftId,
  worldX: number,
  worldZ: number,
): number {
  const preset = getCraftPreset(craftId);
  if (preset.edgeDeformStrength <= 0) return 0;

  const rep = preset.patternRepeatPerBead;
  const u = fract(worldX * rep);
  const v = fract(worldZ * rep);
  const TAU = Math.PI * 2;

  let raw = 0;
  switch (craftId) {
    case 'cinderella': {
      const warp = (fbmPeriodic(u, v, 4, 2, 41) - 0.5) * 2.0;
      raw = Math.sin(v * 10 * TAU + Math.sin(u * 2 * TAU) * 1.4 + warp * Math.PI);
      break;
    }
    case 'waffle': {
      const gx = Math.abs(fract(u * 2) - 0.5) * 2;
      const gy = Math.abs(fract(v * 2) - 0.5) * 2;
      raw = Math.max(smoothstep(0.58, 0.92, gx), smoothstep(0.58, 0.92, gy)) * 2 - 1;
      break;
    }
    case 'steamer-cloth': {
      const cx = fract(u * 4) - 0.5;
      const cy = fract(v * 4) - 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy) * 2;
      raw = (1 - smoothstep(0.3, 0.9, dist)) * 2 - 1;
      break;
    }
    case 'fabric': {
      const tx = Math.floor(u * 8);
      const ty = Math.floor(v * 8);
      raw = ((tx + ty) % 2 === 0 ? Math.cos((fract(u * 8) - 0.5) * Math.PI) : Math.cos((fract(v * 8) - 0.5) * Math.PI)) * 2 - 1;
      break;
    }
    case 'tea-mat': {
      const bx = Math.floor(u * 2);
      const by = Math.floor(v * 2);
      const across = (bx + by) % 2 === 0 ? fract(v * 2) : fract(u * 2);
      raw = Math.abs(Math.sin(across * 3 * Math.PI)) * 2 - 1;
      break;
    }
    case 'diamond-rib': {
      raw = 0.72 * Math.sin((u + v) * 8 * TAU) + 0.28 * Math.sin((u - v) * 8 * TAU);
      break;
    }
    case 'towel': {
      const n1 = fbmPeriodic(u, v, 10, 3, 79);
      const n2 = fbmPeriodic(fract(u + 0.31), fract(v + 0.17), 16, 2, 81);
      raw = ((n1 * 0.65 + n2 * 0.35) - 0.5) * 2;
      break;
    }
    case 'bath-towel': {
      const vor = voronoiPeriodic(u, v, 14, 83);
      raw = (1 - smoothstep(0.05, 0.65, vor.f1)) * 2 - 1;
      break;
    }
    case 'random-crinkle': {
      const vor = voronoiPeriodic(u, v, 5, 97);
      const crease = smoothstep(0.0, 0.24, vor.f2 - vor.f1);
      raw = (crease - 0.65) * 1.4 + (vor.cellHash - 0.5) * 0.6;
      break;
    }
    case 'wave-wrinkle': {
      const warp = (fbmPeriodic(u, v, 3, 2, 101) - 0.5) * 0.6;
      raw = Math.sin(v * 9 * TAU + warp);
      break;
    }
    case 'fine-glitter':
    case 'coarse-glitter':
    case 'standard': {
      raw = (fbmPeriodic(u, v, 8, 2, 21) - 0.5) * 2;
      break;
    }
    default:
      raw = 0;
  }

  return Math.max(-1, Math.min(1, raw));
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
