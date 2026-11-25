import type { QualityTier, ResolvedQualityTier } from './craftCatalog';

export interface HardwareProbeInput {
  hasWebGL: boolean;
  hasWebGL2: boolean;
  rendererString: string;
  hardwareConcurrency: number;
  deviceMemory?: number;
  isMobile: boolean;
  maxTextureSize: number;
}

export type HoledLodLevel = 'high' | 'medium' | 'low' | 'impostor';

export interface QualityProfile {
  tier: ResolvedQualityTier;
  label: string;
  maxDpr: number;
  antialias: boolean;
  shadowMapEnabled: boolean;
  shadowMapSize: number;
  textureResolution: number;
  usePhysicalMaterial: boolean;
  enablePMREM: boolean;
  enableSSS: boolean;
  enableDynamicGlitter: boolean;
  perimeterArcSegments: number;
  holedLod: HoledLodLevel;
}

const SOFTWARE_RENDERER_RE = /swiftshader|llvmpipe|software|microsoft basic/i;
const LOW_END_MOBILE_GPU_RE =
  /mali-4|mali-t|adreno\s*(3\d\d|4\d\d|5\d\d|610|615|620)|powervr/i;
const DISCRETE_DESKTOP_GPU_RE =
  /nvidia|geforce|rtx|gtx|quadro|radeon|rx\s*\d|amd|arc\s*a\d/i;
const INTEGRATED_OR_MOBILE_RE = /intel.*(uhd|hd|iris)|apple gpu|adreno\s*6|mali-g/i;

export function probeBrowserHardware(): HardwareProbeInput {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      hasWebGL: false,
      hasWebGL2: false,
      rendererString: '',
      hardwareConcurrency: 4,
      isMobile: false,
      maxTextureSize: 2048,
    };
  }

  const nav = window.navigator as Navigator & { deviceMemory?: number };
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(nav.userAgent) ||
    window.innerWidth < 768;
  const hardwareConcurrency = nav.hardwareConcurrency || 4;
  const deviceMemory = nav.deviceMemory;

  const canvas = document.createElement('canvas');
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let hasWebGL2 = false;

  try {
    gl = canvas.getContext('webgl2');
    if (gl) {
      hasWebGL2 = true;
    } else {
      gl =
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ??
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    }
  } catch {
    gl = null;
  }

  if (!gl) {
    return {
      hasWebGL: false,
      hasWebGL2: false,
      rendererString: '',
      hardwareConcurrency,
      deviceMemory,
      isMobile,
      maxTextureSize: 0,
    };
  }

  let rendererString = '';
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      rendererString = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '');
    }
    if (!rendererString) {
      rendererString = String(gl.getParameter(gl.RENDERER) ?? '');
    }
  } catch {
    rendererString = '';
  }

  let maxTextureSize = 2048;
  try {
    maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048;
  } catch {
    maxTextureSize = 2048;
  }

  return {
    hasWebGL: true,
    hasWebGL2,
    rendererString,
    hardwareConcurrency,
    deviceMemory,
    isMobile,
    maxTextureSize,
  };
}

export function detectHardwareTier(probe?: HardwareProbeInput): ResolvedQualityTier {
  const hw = probe ?? probeBrowserHardware();
  if (!hw.hasWebGL) return 'lite';

  const r = hw.rendererString;
  if (
    !hw.hasWebGL2 ||
    SOFTWARE_RENDERER_RE.test(r) ||
    LOW_END_MOBILE_GPU_RE.test(r) ||
    hw.hardwareConcurrency <= 2 ||
    (hw.deviceMemory !== undefined && hw.deviceMemory <= 2)
  ) {
    return 'lite';
  }

  if (
    hw.isMobile ||
    INTEGRATED_OR_MOBILE_RE.test(r) ||
    hw.hardwareConcurrency <= 6
  ) {
    return 'balanced';
  }

  if (DISCRETE_DESKTOP_GPU_RE.test(r)) {
    return 'ultra';
  }

  return 'balanced';
}

export function resolveQualityTier(
  configured: QualityTier,
  probe?: HardwareProbeInput,
): ResolvedQualityTier {
  return configured === 'auto' ? detectHardwareTier(probe) : configured;
}

export function getQualityProfile(
  tier: ResolvedQualityTier,
  beadCount: number,
): QualityProfile {
  let holedLod: HoledLodLevel;
  if (tier === 'lite' && beadCount > 6000) {
    holedLod = 'impostor';
  } else if (beadCount > 25000) {
    holedLod = 'impostor';
  } else if (beadCount > 12000 || tier === 'lite') {
    holedLod = 'low';
  } else if (beadCount > 4000 || tier === 'balanced') {
    holedLod = 'medium';
  } else {
    holedLod = 'high';
  }

  if (tier === 'ultra') {
    return {
      tier,
      label: '极致画质',
      maxDpr: 2.0,
      antialias: true,
      shadowMapEnabled: true,
      shadowMapSize: 2048,
      textureResolution: 512,
      usePhysicalMaterial: true,
      enablePMREM: true,
      enableSSS: true,
      enableDynamicGlitter: true,
      perimeterArcSegments: 5,
      holedLod,
    };
  }

  if (tier === 'balanced') {
    return {
      tier,
      label: '均衡画质',
      maxDpr: 1.5,
      antialias: true,
      shadowMapEnabled: true,
      shadowMapSize: 1024,
      textureResolution: 256,
      usePhysicalMaterial: false,
      enablePMREM: true,
      enableSSS: true,
      enableDynamicGlitter: true,
      perimeterArcSegments: 3,
      holedLod,
    };
  }

  return {
    tier: 'lite',
    label: '流畅省电',
    maxDpr: 1.0,
    antialias: false,
    shadowMapEnabled: false,
    shadowMapSize: 0,
    textureResolution: 128,
    usePhysicalMaterial: false,
    enablePMREM: false,
    enableSSS: false,
    enableDynamicGlitter: false,
    perimeterArcSegments: 1,
    holedLod,
  };
}

export function getDowngradedTier(tier: ResolvedQualityTier): ResolvedQualityTier | null {
  if (tier === 'ultra') return 'balanced';
  if (tier === 'balanced') return 'lite';
  return null;
}

/**
 * Monitors active interactive rendering frames using a 30-frame sliding window
 * and signals downgrade if recent FPS stays below 20 FPS (> 50 ms/frame avg) over >= 1.5s.
 */
export class FpsWatchdog {
  private samples: number[] = [];
  private totalDeltaMs = 0;

  recordFrame(deltaMs: number): boolean {
    // Ignore huge spikes from tab switching or paused on-demand rendering
    if (deltaMs <= 0 || deltaMs > 250) return false;
    this.samples.push(deltaMs);
    this.totalDeltaMs += deltaMs;

    if (this.samples.length > 30) {
      const removed = this.samples.shift() ?? 0;
      this.totalDeltaMs -= removed;
    }

    if (this.samples.length >= 24 && this.totalDeltaMs >= 1500) {
      const avgDelta = this.totalDeltaMs / this.samples.length;
      if (avgDelta > 50) {
        this.reset();
        return true;
      }
    }
    return false;
  }

  reset(): void {
    this.samples = [];
    this.totalDeltaMs = 0;
  }
}
