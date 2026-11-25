import { describe, expect, it } from 'vitest';
import {
  FpsWatchdog,
  detectHardwareTier,
  getQualityProfile,
} from '../performanceTier';

describe('performanceTier & adaptive LOD', () => {
  it('classifies hardware probes into ultra / balanced / lite accurately', () => {
    expect(
      detectHardwareTier({
        hasWebGL: true,
        hasWebGL2: true,
        rendererString: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)',
        hardwareConcurrency: 16,
        deviceMemory: 32,
        isMobile: false,
        maxTextureSize: 16384,
      }),
    ).toBe('ultra');

    expect(
      detectHardwareTier({
        hasWebGL: true,
        hasWebGL2: true,
        rendererString: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)',
        hardwareConcurrency: 8,
        deviceMemory: 16,
        isMobile: false,
        maxTextureSize: 8192,
      }),
    ).toBe('balanced');

    expect(
      detectHardwareTier({
        hasWebGL: true,
        hasWebGL2: true,
        rendererString: 'Apple GPU',
        hardwareConcurrency: 6,
        isMobile: true,
        maxTextureSize: 4096,
      }),
    ).toBe('balanced');

    expect(
      detectHardwareTier({
        hasWebGL: true,
        hasWebGL2: false,
        rendererString: 'Mali-400 MP',
        hardwareConcurrency: 4,
        isMobile: true,
        maxTextureSize: 2048,
      }),
    ).toBe('lite');

    expect(
      detectHardwareTier({
        hasWebGL: true,
        hasWebGL2: true,
        rendererString: 'Google SwiftShader',
        hardwareConcurrency: 8,
        isMobile: false,
        maxTextureSize: 4096,
      }),
    ).toBe('lite');
  });

  it('selects appropriate LOD and shadow settings across bead counts', () => {
    const smallUltra = getQualityProfile('ultra', 500);
    expect(smallUltra.holedLod).toBe('high');
    expect(smallUltra.shadowMapEnabled).toBe(true);
    expect(smallUltra.usePhysicalMaterial).toBe(true);

    const hugeUltra = getQualityProfile('ultra', 40000);
    expect(hugeUltra.holedLod).toBe('impostor');

    const mediumLite = getQualityProfile('lite', 8000);
    expect(mediumLite.holedLod).toBe('impostor');
    expect(mediumLite.shadowMapEnabled).toBe(false);
    expect(mediumLite.maxDpr).toBe(1.0);
  });

  it('triggers downgrade in FpsWatchdog only on sustained low FPS', () => {
    const dog = new FpsWatchdog();
    // 30 frames at 60fps (16ms) -> no downgrade
    for (let i = 0; i < 30; i++) {
      expect(dog.recordFrame(16)).toBe(false);
    }

    // Sustained 15fps (65ms/frame) over > 1.5s and >= 24 frames -> downgrade on 24th frame
    let triggered = false;
    for (let i = 0; i < 30; i++) {
      if (dog.recordFrame(65)) triggered = true;
    }
    expect(triggered).toBe(true);
  });
});
