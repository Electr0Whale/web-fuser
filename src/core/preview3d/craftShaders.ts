import * as THREE from 'three';
import type { CraftId } from './craftCatalog';

export interface CraftShaderUniforms {
  uGridSize: { value: THREE.Vector2 };
  uCraftRepeat: { value: number };
  uSeamStrength: { value: number };
  uMeltLevel: { value: number };
  uColorWarp: { value: number };
  uHoleRadiusRatio: { value: number };
  uEnableSSS: { value: number };
  uGlowBoost: { value: number };
  uEnableSpecial: { value: number };
  uMaterialMask: { value: THREE.Texture };
  uKeyLightDir: { value: THREE.Vector3 };
  uGlitterMap: { value: THREE.Texture };
  uGlitterIntensity: { value: number };
  uGlitterIridescence: { value: number };
  uBackHolesMode: { value: number };
}

export interface CraftShaderOptions {
  craftId: CraftId;
  width: number;
  height: number;
  craftRepeat: number;
  seamStrength: number;
  meltLevel: number;
  colorWarp: number;
  holeRadiusRatio: number;
  enableSSS: boolean;
  glowBoost: number;
  enableSpecialBeads: boolean;
  materialMaskTexture: THREE.Texture;
  keyLightDir: THREE.Vector3;
  glitterMap: THREE.Texture | null;
  glitterIntensity: number;
  glitterIridescence: number;
  backHolesMode: boolean;
}

let fallbackMaskTex: THREE.DataTexture | null = null;
export function getFallbackMaskTexture(): THREE.DataTexture {
  if (!fallbackMaskTex) {
    fallbackMaskTex = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    fallbackMaskTex.colorSpace = THREE.NoColorSpace;
    fallbackMaskTex.needsUpdate = true;
  }
  return fallbackMaskTex;
}

/**
 * Attaches procedural craft shader enhancements to MeshStandardMaterial / MeshPhysicalMaterial
 * via onBeforeCompile with a stable customProgramCacheKey.
 */
export function enhanceBeadMaterialWithCraftShader(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  options: CraftShaderOptions,
): CraftShaderUniforms {
  const dummyTex = getFallbackMaskTexture();
  const uniforms: CraftShaderUniforms = {
    uGridSize: { value: new THREE.Vector2(options.width, options.height) },
    uCraftRepeat: { value: options.craftRepeat },
    uSeamStrength: { value: options.seamStrength },
    uMeltLevel: { value: options.meltLevel },
    uColorWarp: { value: options.colorWarp },
    uHoleRadiusRatio: { value: options.holeRadiusRatio },
    uEnableSSS: { value: options.enableSSS ? 1.0 : 0.0 },
    uGlowBoost: { value: options.glowBoost },
    uEnableSpecial: { value: options.enableSpecialBeads ? 1.0 : 0.0 },
    uMaterialMask: { value: options.materialMaskTexture },
    uKeyLightDir: { value: options.keyLightDir.clone().normalize() },
    uGlitterMap: { value: options.glitterMap ?? dummyTex },
    uGlitterIntensity: { value: options.glitterMap ? options.glitterIntensity : 0.0 },
    uGlitterIridescence: { value: options.glitterIridescence },
    uBackHolesMode: { value: options.backHolesMode ? 1.0 : 0.0 },
  };

  material.userData.craftUniforms = uniforms;
  material.customProgramCacheKey = () =>
    [
      'bead-craft-v2',
      options.glitterMap ? 'glitter' : 'plain',
      options.backHolesMode ? 'backholes' : 'solid',
      options.colorWarp > 0.001 ? 'warp' : 'nowarp',
    ].join(':');

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 uGridSize;
varying vec2 vBeadGridUv;
varying vec3 vBeadWorldNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vec4 beadObjPos = vec4( position, 1.0 );
#ifdef USE_INSTANCING
  beadObjPos = instanceMatrix * beadObjPos;
#endif
vBeadGridUv = vec2(
  (beadObjPos.x + uGridSize.x * 0.5) / uGridSize.x,
  (beadObjPos.z + uGridSize.y * 0.5) / uGridSize.y
);
vec3 beadN = normal;
#ifdef USE_INSTANCING
  beadN = mat3( instanceMatrix ) * beadN;
#endif
vBeadWorldNormal = normalize( mat3( modelMatrix ) * beadN );`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 uGridSize;
uniform float uCraftRepeat;
uniform float uSeamStrength;
uniform float uMeltLevel;
uniform float uColorWarp;
uniform float uHoleRadiusRatio;
uniform float uEnableSSS;
uniform float uGlowBoost;
uniform float uEnableSpecial;
uniform sampler2D uMaterialMask;
uniform vec3 uKeyLightDir;
uniform sampler2D uGlitterMap;
uniform float uGlitterIntensity;
uniform float uGlitterIridescence;
uniform float uBackHolesMode;
varying vec2 vBeadGridUv;
varying vec3 vBeadWorldNormal;`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  #if defined( USE_NORMALMAP )
    if ( uColorWarp > 0.001 ) {
      vec2 warpN = texture2D( normalMap, vNormalMapUv ).xy * 2.0 - 1.0;
      vec2 warpedUv = clamp( vMapUv + ( warpN * uColorWarp ) / max( uGridSize, vec2( 1.0 ) ), 0.0001, 0.9999 );
      vec4 warpedSample = texture2D( map, warpedUv );
      if ( warpedSample.a > 0.5 ) {
        sampledDiffuseColor = warpedSample;
      }
    }
  #endif
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec2 beadCellUv = fract( clamp( vBeadGridUv, 0.0, 0.9999 ) * uGridSize );
vec2 seamEdge = min( beadCellUv, 1.0 - beadCellUv );
float seamDist = min( seamEdge.x, seamEdge.y );
float seamMask = 1.0 - smoothstep( 0.0, 0.14, seamDist );
diffuseColor.rgb *= ( 1.0 - seamMask * uSeamStrength * 0.24 );

vec4 beadMatInfo = texture2D( uMaterialMask, clamp( vBeadGridUv, 0.0001, 0.9999 ) );
if ( uBackHolesMode > 0.5 && vBeadWorldNormal.y < -0.5 ) {
  vec2 centered = beadCellUv - 0.5;
  float r = length( centered ) * 2.0;
  float holeR = clamp( uHoleRadiusRatio, 0.16, 0.52 );
  float insideHole = 1.0 - smoothstep( holeR - 0.06, holeR + 0.04, r );
  float innerRim = smoothstep( holeR - 0.14, holeR + 0.08, r ) * ( 1.0 - smoothstep( holeR + 0.05, holeR + 0.26, r ) );
  float rimDir = dot( normalize( centered + 1e-4 ), normalize( uKeyLightDir.xz + 1e-4 ) );
  diffuseColor.rgb *= mix( 1.0, 0.22, insideHole );
  diffuseColor.rgb *= ( 1.0 + innerRim * rimDir * 0.18 );
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
if ( uEnableSpecial > 0.5 ) {
  if ( beadMatInfo.g > 0.5 ) {
    totalEmissiveRadiance += diffuseColor.rgb * uGlowBoost;
  }
  if ( beadMatInfo.r > 0.5 ) {
    totalEmissiveRadiance += diffuseColor.rgb * 0.08;
  }
}`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
if ( uEnableSSS > 0.5 ) {
  float luma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
  float wrapDiff = max( 0.0, ( dot( normalize( vBeadWorldNormal ), uKeyLightDir ) + 0.55 ) / 1.55 );
  float sssFactor = ( 0.12 + 0.18 * luma + beadMatInfo.r * 0.28 * uEnableSpecial ) * wrapDiff;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * sssFactor * 0.34;
}
if ( uEnableSpecial > 0.5 && beadMatInfo.b > 0.5 ) {
  float fresnelPearl = pow( 1.0 - clamp( abs( dot( normalize( vViewPosition ), normalize( normal ) ) ), 0.0, 1.0 ), 2.2 );
  reflectedLight.indirectSpecular += mix( diffuseColor.rgb, vec3( 1.0 ), 0.5 ) * fresnelPearl * 0.28;
}
if ( uGlitterIntensity > 0.01 ) {
  vec2 gUv = vBeadGridUv * uGridSize * uCraftRepeat;
  vec4 flake = texture2D( uGlitterMap, gUv );
  if ( flake.a > 0.08 ) {
    vec3 flakeN = normalize( flake.rgb * 2.0 - 1.0 );
    vec3 viewDirW = normalize( ( vec4( vViewPosition, 0.0 ) * viewMatrix ).xyz );
    vec3 worldFlakeN = normalize( vec3( flakeN.x, flakeN.z, flakeN.y ) );
    vec3 halfV = normalize( uKeyLightDir + normalize( viewDirW + vec3( 0.0, 0.35, 0.0 ) ) );
    float glint = pow( max( dot( worldFlakeN, halfV ), 0.0 ), 42.0 ) * flake.a * uGlitterIntensity;
    vec3 iridTint = 0.5 + 0.5 * cos( 6.2831 * ( flake.r * 1.3 + flake.g * 0.7 + vec3( 0.0, 0.33, 0.67 ) ) );
    vec3 glintColor = mix( vec3( 1.0, 0.99, 0.96 ), iridTint, uGlitterIridescence );
    reflectedLight.directSpecular += glintColor * glint;
  }
}`,
      );
  };

  return uniforms;
}

export interface HoledImpostorOptions {
  width: number;
  height: number;
  albedoTexture: THREE.Texture;
  materialMaskTexture: THREE.Texture;
  holeRadiusRatio: number;
  roughness: number;
  glowBoost: number;
  enableSpecialBeads: boolean;
  keyLightDir: THREE.Vector3;
}

/**
 * Ultra-fast fragment-impostor material for 40,000 holed beads on weak mobile/integrated GPUs.
 * Draws hollow cylinder rings with crisp inner bore AO on a single greedy slab mesh.
 */
export function createHoledImpostorMaterial(
  options: HoledImpostorOptions,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: options.albedoTexture,
    roughness: options.roughness,
    metalness: 0.0,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });

  const uniforms = {
    uGridSize: { value: new THREE.Vector2(options.width, options.height) },
    uHoleRadiusRatio: { value: options.holeRadiusRatio },
    uGlowBoost: { value: options.glowBoost },
    uEnableSpecial: { value: options.enableSpecialBeads ? 1.0 : 0.0 },
    uMaterialMask: { value: options.materialMaskTexture },
    uKeyLightDir: { value: options.keyLightDir.clone().normalize() },
  };

  mat.userData.craftUniforms = uniforms;
  mat.customProgramCacheKey = () => 'bead-holed-impostor-v1';

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 uGridSize;
varying vec2 vImpGridUv;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vImpGridUv = vec2(
  (position.x + uGridSize.x * 0.5) / uGridSize.x,
  (position.z + uGridSize.y * 0.5) / uGridSize.y
);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 uGridSize;
uniform float uHoleRadiusRatio;
uniform float uGlowBoost;
uniform float uEnableSpecial;
uniform sampler2D uMaterialMask;
uniform vec3 uKeyLightDir;
varying vec2 vImpGridUv;`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `vec2 impCell = fract( clamp( vImpGridUv, 0.0, 0.9999 ) * uGridSize ) - 0.5;
float impR = length( impCell ) * 2.0;
if ( impR > 0.96 || impR < uHoleRadiusRatio ) discard;
float rimAO = smoothstep( uHoleRadiusRatio, uHoleRadiusRatio + 0.14, impR ) * ( 1.0 - smoothstep( 0.80, 0.96, impR ) * 0.35 );
diffuseColor.rgb *= ( 0.72 + 0.28 * rimAO );
#include <alphatest_fragment>`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
if ( uEnableSpecial > 0.5 ) {
  vec4 impMask = texture2D( uMaterialMask, clamp( vImpGridUv, 0.0001, 0.9999 ) );
  if ( impMask.g > 0.5 ) {
    totalEmissiveRadiance += diffuseColor.rgb * uGlowBoost;
  }
}`,
      );
  };

  return mat;
}
