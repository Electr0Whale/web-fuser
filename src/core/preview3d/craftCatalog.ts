export type CraftCategory = 'holed' | 'flat' | 'textured' | 'glitter';

export type CraftId =
  | 'unfused'
  | 'double-holed'
  | 'standard'
  | 'glossy-film'
  | 'cinderella'
  | 'waffle'
  | 'steamer-cloth'
  | 'fabric'
  | 'tea-mat'
  | 'diamond-rib'
  | 'towel'
  | 'bath-towel'
  | 'random-crinkle'
  | 'wave-wrinkle'
  | 'fine-glitter'
  | 'coarse-glitter';

export type BeadSizeMm = 2.6 | 5.0;
export type SideMode = 'single-sided' | 'double-sided';
export type LightingPresetId = 'warm-desk' | 'studio-soft' | 'window-side' | 'darkroom-glow';
export type QualityTier = 'auto' | 'ultra' | 'balanced' | 'lite';
export type ResolvedQualityTier = 'ultra' | 'balanced' | 'lite';

export interface Preview3DSettings {
  craftId: CraftId;
  beadSizeMm: BeadSizeMm;
  sideMode: SideMode;
  meltLevel: number;
  showPegboard: boolean;
  enableSpecialBeads: boolean;
  lightingPreset: LightingPresetId;
  lightAzimuth: number;
  lightElevation: number;
  qualityTier: QualityTier;
  autoRotate: boolean;
}

export const DEFAULT_PREVIEW3D_SETTINGS: Preview3DSettings = {
  craftId: 'standard',
  beadSizeMm: 2.6,
  sideMode: 'single-sided',
  meltLevel: 0.65,
  showPegboard: true,
  enableSpecialBeads: true,
  lightingPreset: 'warm-desk',
  lightAzimuth: 38,
  lightElevation: 56,
  qualityTier: 'auto',
  autoRotate: false,
};

export interface SparkleConfig {
  density: number;
  size: number;
  intensity: number;
  iridescence: number;
}

export interface CraftPreset {
  id: CraftId;
  name: string;
  category: CraftCategory;
  description: string;
  geometryMode: 'holed' | 'slab';
  supportsSideMode: boolean;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  normalScale: number;
  patternRepeatPerBead: number;
  seamVisibility: number;
  edgeDeformStrength: number;
  colorWarpStrength: number;
  sparkle: SparkleConfig | null;
}

export const CRAFT_CATEGORIES: ReadonlyArray<{ id: CraftCategory; label: string }> = [
  { id: 'holed', label: '立豆 / 有孔' },
  { id: 'flat', label: '平烫基础' },
  { id: 'textured', label: '纹理压印' },
  { id: 'glitter', label: '闪粉特效' },
];

export const CRAFT_PRESETS: readonly CraftPreset[] = [
  {
    id: 'unfused',
    name: '未烫立豆',
    category: 'holed',
    description: '未熨烫颗粒立豆，可选透明底板',
    geometryMode: 'holed',
    supportsSideMode: false,
    roughness: 0.38,
    clearcoat: 0.08,
    clearcoatRoughness: 0.35,
    normalScale: 0.15,
    patternRepeatPerBead: 1.0,
    seamVisibility: 1.0,
    edgeDeformStrength: 0.0,
    colorWarpStrength: 0.0,
    sparkle: null,
  },
  {
    id: 'double-holed',
    name: '双面有孔烫',
    category: 'holed',
    description: '轻熔定型保留中空圆孔',
    geometryMode: 'holed',
    supportsSideMode: false,
    roughness: 0.24,
    clearcoat: 0.25,
    clearcoatRoughness: 0.2,
    normalScale: 0.18,
    patternRepeatPerBead: 1.0,
    seamVisibility: 0.9,
    edgeDeformStrength: 0.0,
    colorWarpStrength: 0.0,
    sparkle: null,
  },
  {
    id: 'standard',
    name: '普通烫',
    category: 'flat',
    description: '烘焙纸平烫，半哑光轻微熔缝',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.36,
    clearcoat: 0.12,
    clearcoatRoughness: 0.28,
    normalScale: 0.32,
    patternRepeatPerBead: 0.5,
    seamVisibility: 0.52,
    edgeDeformStrength: 0.018,
    colorWarpStrength: 0.02,
    sparkle: null,
  },
  {
    id: 'glossy-film',
    name: '亮面膜烫',
    category: 'flat',
    description: '镜面清漆光泽，表面极平整',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    normalScale: 0.08,
    patternRepeatPerBead: 0.35,
    seamVisibility: 0.16,
    edgeDeformStrength: 0.0,
    colorWarpStrength: 0.0,
    sparkle: null,
  },
  {
    id: 'cinderella',
    name: '仙度瑞拉烫',
    category: 'textured',
    description: '流动水波细棱纹 + 镜面丝光',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.14,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    normalScale: 0.82,
    patternRepeatPerBead: 0.22,
    seamVisibility: 0.24,
    edgeDeformStrength: 0.055,
    colorWarpStrength: 0.07,
    sparkle: null,
  },
  {
    id: 'waffle',
    name: '华夫格烫',
    category: 'textured',
    description: '立体方格凹坑，复古手作感',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.48,
    clearcoat: 0.08,
    clearcoatRoughness: 0.35,
    normalScale: 1.05,
    patternRepeatPerBead: 1.0,
    seamVisibility: 0.35,
    edgeDeformStrength: 0.05,
    colorWarpStrength: 0.05,
    sparkle: null,
  },
  {
    id: 'steamer-cloth',
    name: '蒸笼布烫',
    category: 'textured',
    description: '细密硅胶网垫微圆点压痕',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.42,
    clearcoat: 0.12,
    clearcoatRoughness: 0.3,
    normalScale: 0.9,
    patternRepeatPerBead: 0.9,
    seamVisibility: 0.38,
    edgeDeformStrength: 0.05,
    colorWarpStrength: 0.05,
    sparkle: null,
  },
  {
    id: 'fabric',
    name: '布艺烫',
    category: 'textured',
    description: '细腻棉麻经纬平纹编织肌理',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.54,
    clearcoat: 0.05,
    clearcoatRoughness: 0.4,
    normalScale: 0.8,
    patternRepeatPerBead: 0.85,
    seamVisibility: 0.3,
    edgeDeformStrength: 0.045,
    colorWarpStrength: 0.05,
    sparkle: null,
  },
  {
    id: 'tea-mat',
    name: '茶席烫',
    category: 'textured',
    description: '交错竹席方格编织纹理',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.5,
    clearcoat: 0.08,
    clearcoatRoughness: 0.36,
    normalScale: 0.98,
    patternRepeatPerBead: 0.55,
    seamVisibility: 0.28,
    edgeDeformStrength: 0.05,
    colorWarpStrength: 0.05,
    sparkle: null,
  },
  {
    id: 'diamond-rib',
    name: '格菱纹烫',
    category: 'textured',
    description: '45° 斜向平行棱纹与浅菱格',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.4,
    clearcoat: 0.16,
    clearcoatRoughness: 0.24,
    normalScale: 0.88,
    patternRepeatPerBead: 0.65,
    seamVisibility: 0.26,
    edgeDeformStrength: 0.045,
    colorWarpStrength: 0.05,
    sparkle: null,
  },
  {
    id: 'towel',
    name: '毛巾烫',
    category: 'textured',
    description: '纯棉毛巾软糯毛绒凹凸质感',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.72,
    clearcoat: 0.0,
    clearcoatRoughness: 0.5,
    normalScale: 1.15,
    patternRepeatPerBead: 0.35,
    seamVisibility: 0.22,
    edgeDeformStrength: 0.11,
    colorWarpStrength: 0.1,
    sparkle: null,
  },
  {
    id: 'bath-towel',
    name: '澡巾烫',
    category: 'textured',
    description: '细密磨砂粗颗粒，哑光复古',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.82,
    clearcoat: 0.0,
    clearcoatRoughness: 0.6,
    normalScale: 1.05,
    patternRepeatPerBead: 0.6,
    seamVisibility: 0.28,
    edgeDeformStrength: 0.095,
    colorWarpStrength: 0.085,
    sparkle: null,
  },
  {
    id: 'random-crinkle',
    name: '随机褶皱烫',
    category: 'textured',
    description: '揉皱烘焙纸自然折痕做旧',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.32,
    clearcoat: 0.22,
    clearcoatRoughness: 0.2,
    normalScale: 0.62,
    patternRepeatPerBead: 0.18,
    seamVisibility: 0.2,
    edgeDeformStrength: 0.08,
    colorWarpStrength: 0.075,
    sparkle: null,
  },
  {
    id: 'wave-wrinkle',
    name: '波浪褶皱烫',
    category: 'textured',
    description: '连续横向柔和波纹起伏肌理',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.34,
    clearcoat: 0.2,
    clearcoatRoughness: 0.22,
    normalScale: 0.92,
    patternRepeatPerBead: 0.3,
    seamVisibility: 0.25,
    edgeDeformStrength: 0.045,
    colorWarpStrength: 0.05,
    sparkle: null,
  },
  {
    id: 'fine-glitter',
    name: '细闪烫',
    category: 'glitter',
    description: '高密度微细格利特闪粉流光',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.22,
    clearcoat: 0.65,
    clearcoatRoughness: 0.12,
    normalScale: 0.45,
    patternRepeatPerBead: 0.5,
    seamVisibility: 0.26,
    edgeDeformStrength: 0.035,
    colorWarpStrength: 0.03,
    sparkle: {
      density: 0.85,
      size: 1.0,
      intensity: 1.35,
      iridescence: 0.35,
    },
  },
  {
    id: 'coarse-glitter',
    name: '粗闪烫',
    category: 'glitter',
    description: '大颗粒璀璨亮片炫彩折射',
    geometryMode: 'slab',
    supportsSideMode: true,
    roughness: 0.18,
    clearcoat: 0.78,
    clearcoatRoughness: 0.08,
    normalScale: 0.6,
    patternRepeatPerBead: 0.28,
    seamVisibility: 0.22,
    edgeDeformStrength: 0.035,
    colorWarpStrength: 0.03,
    sparkle: {
      density: 0.55,
      size: 2.2,
      intensity: 1.75,
      iridescence: 0.65,
    },
  },
];

const PRESET_MAP = new Map<CraftId, CraftPreset>(CRAFT_PRESETS.map((p) => [p.id, p]));

export function getCraftPreset(id: CraftId): CraftPreset {
  return PRESET_MAP.get(id) ?? CRAFT_PRESETS[2];
}

export interface PhysicalDimensions {
  widthMm: number;
  heightMm: number;
  widthCm: number;
  heightCm: number;
  thicknessWorld: number;
  holeRadiusRatio: number;
  seamStrength: number;
  normalStrength: number;
}

export function computePhysicalDimensions(
  width: number,
  height: number,
  beadSizeMm: BeadSizeMm,
  craftId: CraftId,
  meltLevel: number,
): PhysicalDimensions {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const melt = Math.max(0, Math.min(1, meltLevel));
  const preset = getCraftPreset(craftId);

  const widthMm = Number((safeW * beadSizeMm).toFixed(1));
  const heightMm = Number((safeH * beadSizeMm).toFixed(1));
  const widthCm = Number((widthMm / 10).toFixed(1));
  const heightCm = Number((heightMm / 10).toFixed(1));

  // 5mm standard midi beads are slightly taller relative to outer diameter than 2.6mm mini beads
  const sizeAspectBoost = beadSizeMm === 5.0 ? 1.04 : 1.0;

  let thicknessWorld: number;
  let holeRadiusRatio: number;

  if (craftId === 'unfused') {
    thicknessWorld = 1.0 * sizeAspectBoost;
    holeRadiusRatio = 0.49;
  } else if (craftId === 'double-holed') {
    thicknessWorld = (0.82 - 0.14 * melt) * sizeAspectBoost;
    holeRadiusRatio = 0.44 - 0.2 * melt;
  } else {
    thicknessWorld = (0.68 - 0.16 * melt) * sizeAspectBoost;
    holeRadiusRatio = 0.42 - 0.14 * melt;
  }

  const seamStrength =
    craftId === 'unfused' ? 1.0 : Number((preset.seamVisibility * (1 - 0.72 * melt)).toFixed(4));
  const normalStrength = Number((preset.normalScale * (0.7 + 0.5 * melt)).toFixed(4));

  return {
    widthMm,
    heightMm,
    widthCm,
    heightCm,
    thicknessWorld: Number(thicknessWorld.toFixed(4)),
    holeRadiusRatio: Number(holeRadiusRatio.toFixed(4)),
    seamStrength,
    normalStrength,
  };
}
