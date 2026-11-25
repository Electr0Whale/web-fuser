import * as THREE from 'three';
import type { LightingPresetId } from './craftCatalog';

export interface LightingPresetConfig {
  id: LightingPresetId;
  name: string;
  defaultAzimuth: number;
  defaultElevation: number;
  keyColor: number;
  keyIntensity: number;
  fillColor: number;
  fillIntensity: number;
  rimColor: number;
  rimIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
  bgLightHex: number;
  bgDarkHex: number;
  shadowOpacity: number;
  glowBoost: number;
  envIntensity: number;
}

export const LIGHTING_PRESETS: readonly LightingPresetConfig[] = [
  {
    id: 'warm-desk',
    name: '暖阳柔光',
    defaultAzimuth: 38,
    defaultElevation: 56,
    keyColor: 0xfff3e0,
    keyIntensity: 2.35,
    fillColor: 0xe3eeff,
    fillIntensity: 0.72,
    rimColor: 0xffe4c4,
    rimIntensity: 0.45,
    hemiSkyColor: 0xfffaf0,
    hemiGroundColor: 0xd8cec0,
    hemiIntensity: 0.68,
    bgLightHex: 0xf4efe6,
    bgDarkHex: 0x1a1917,
    shadowOpacity: 0.24,
    glowBoost: 0.12,
    envIntensity: 0.65,
  },
  {
    id: 'studio-soft',
    name: '柔光摄影棚',
    defaultAzimuth: 28,
    defaultElevation: 65,
    keyColor: 0xffffff,
    keyIntensity: 2.05,
    fillColor: 0xf2f6fc,
    fillIntensity: 0.92,
    rimColor: 0xffffff,
    rimIntensity: 0.5,
    hemiSkyColor: 0xffffff,
    hemiGroundColor: 0xcfd6e0,
    hemiIntensity: 0.8,
    bgLightHex: 0xeef2f7,
    bgDarkHex: 0x181a1f,
    shadowOpacity: 0.18,
    glowBoost: 0.08,
    envIntensity: 0.78,
  },
  {
    id: 'window-side',
    name: '窗边侧光',
    defaultAzimuth: 68,
    defaultElevation: 26,
    keyColor: 0xfff8ef,
    keyIntensity: 2.65,
    fillColor: 0xdbe8ff,
    fillIntensity: 0.55,
    rimColor: 0xfff2dc,
    rimIntensity: 0.58,
    hemiSkyColor: 0xf5f9ff,
    hemiGroundColor: 0xcbc7be,
    hemiIntensity: 0.52,
    bgLightHex: 0xebeae4,
    bgDarkHex: 0x17181b,
    shadowOpacity: 0.3,
    glowBoost: 0.15,
    envIntensity: 0.58,
  },
  {
    id: 'darkroom-glow',
    name: '暗室夜光',
    defaultAzimuth: 44,
    defaultElevation: 48,
    keyColor: 0xb7ccff,
    keyIntensity: 0.92,
    fillColor: 0x4b5c86,
    fillIntensity: 0.32,
    rimColor: 0x9fc2ff,
    rimIntensity: 0.7,
    hemiSkyColor: 0x354263,
    hemiGroundColor: 0x10131a,
    hemiIntensity: 0.35,
    bgLightHex: 0x181c28,
    bgDarkHex: 0x0d1018,
    shadowOpacity: 0.14,
    glowBoost: 1.45,
    envIntensity: 0.35,
  },
];

const LIGHTING_MAP = new Map<LightingPresetId, LightingPresetConfig>(
  LIGHTING_PRESETS.map((p) => [p.id, p]),
);

export function getLightingPreset(id: LightingPresetId): LightingPresetConfig {
  return LIGHTING_MAP.get(id) ?? LIGHTING_PRESETS[0];
}

export function sphericalToLightPosition(
  azimuthDeg: number,
  elevationDeg: number,
  distance: number,
): THREE.Vector3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (Math.max(8, Math.min(88, elevationDeg)) * Math.PI) / 180;
  const cosEl = Math.cos(el);
  return new THREE.Vector3(
    distance * cosEl * Math.sin(az),
    distance * Math.sin(el),
    distance * cosEl * Math.cos(az),
  );
}

/**
 * Lightweight baked radial contact shadow plane used when real-time ShadowMap is off (`lite` tier).
 */
export function createBakedContactShadowMesh(
  width: number,
  height: number,
  yOffset: number,
): THREE.Mesh {
  const texSize = 128;
  const rgba = new Uint8Array(texSize * texSize * 4);
  for (let y = 0; y < texSize; y++) {
    const ny = (y / (texSize - 1)) * 2 - 1;
    for (let x = 0; x < texSize; x++) {
      const nx = (x / (texSize - 1)) * 2 - 1;
      const boxDist = Math.max(Math.abs(nx), Math.abs(ny));
      const radial = Math.hypot(nx, ny) * 0.72;
      const d = boxDist * 0.65 + radial * 0.35;
      const alpha = Math.max(0, 1 - Math.min(1, d / 0.96));
      const o = (y * texSize + x) * 4;
      rgba[o] = 12;
      rgba[o + 1] = 14;
      rgba[o + 2] = 18;
      rgba[o + 3] = Math.round(alpha * alpha * 96);
    }
  }

  const tex = new THREE.DataTexture(rgba, texSize, texSize, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  const geom = new THREE.PlaneGeometry(width * 1.18 + 3, height * 1.18 + 3);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = yOffset;
  return mesh;
}
