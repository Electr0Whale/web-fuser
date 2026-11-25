import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Camera, RotateCw } from 'lucide-react';
import type { BeadColor } from '../../core/colorSpace';
import {
  type Preview3DSettings,
  type ResolvedQualityTier,
  computePhysicalDimensions,
  getCraftPreset,
} from '../../core/preview3d/craftCatalog';
import {
  createHoledImpostorMaterial,
  enhanceBeadMaterialWithCraftShader,
} from '../../core/preview3d/craftShaders';
import {
  getCraftThreeTextures,
} from '../../core/preview3d/craftTextures';
import {
  buildChunkedHoledBeads,
  buildFusedSlabGeometries,
  buildPegboardGroup,
  buildPixelDataTextures,
  createHollowBeadGeometry,
} from '../../core/preview3d/geometryBuilder';
import {
  FpsWatchdog,
  getDowngradedTier,
  getQualityProfile,
  probeBrowserHardware,
  resolveQualityTier,
} from '../../core/preview3d/performanceTier';
import {
  createBakedContactShadowMesh,
  getLightingPreset,
  sphericalToLightPosition,
} from '../../core/preview3d/scenePresets';
import { capturePreviewSnapshot } from '../../core/preview3d/snapshotExporter';
import { Fallback25DCanvas, type PreviewSnapshotHandle } from './Fallback25DCanvas';

export type CameraViewPreset = 'front' | 'back' | 'iso' | 'side' | 'reset';

interface BeadCanvas3DProps {
  grid: Int16Array;
  width: number;
  height: number;
  palette: readonly BeadColor[];
  brandId: string;
  settings: Preview3DSettings;
  theme: 'light' | 'dark';
  projectName: string;
  compact?: boolean;
  snapshotRef: React.RefObject<PreviewSnapshotHandle | null>;
  onUpdateSettings: (patch: Partial<Preview3DSettings>) => void;
  onResolvedTierChange?: (tier: ResolvedQualityTier) => void;
  onQuickSnapshot: () => void;
  onToast: (msg: string, tone?: 'info' | 'success' | 'warn' | 'danger') => void;
}

interface TweenState {
  active: boolean;
  startTime: number;
  durationMs: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
}

function disposeObjectTree(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else if (mat) {
      mat.dispose();
    }
  });
}

export const BeadCanvas3D: React.FC<BeadCanvas3DProps> = ({
  grid,
  width,
  height,
  palette,
  brandId,
  settings,
  theme,
  projectName,
  compact = false,
  snapshotRef,
  onUpdateSettings,
  onResolvedTierChange,
  onQuickSnapshot,
  onToast,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);

  const hwProbe = useMemo(() => probeBrowserHardware(), []);
  const [webglLostReason, setWebglLostReason] = useState<string | null>(
    hwProbe.hasWebGL ? null : '当前浏览器未启用 WebGL 硬件加速，已自动切换为 2.5D 预览模式。',
  );
  const [runtimeDowngrade, setRuntimeDowngrade] = useState<ResolvedQualityTier | null>(null);

  const beadCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] >= 0) count++;
    }
    return count;
  }, [grid]);

  const resolvedTier = useMemo<ResolvedQualityTier>(() => {
    if (settings.qualityTier !== 'auto') return settings.qualityTier;
    return runtimeDowngrade ?? resolveQualityTier('auto', hwProbe);
  }, [hwProbe, runtimeDowngrade, settings.qualityTier]);

  useEffect(() => {
    onResolvedTierChange?.(resolvedTier);
  }, [onResolvedTierChange, resolvedTier]);

  const profile = useMemo(
    () => getQualityProfile(resolvedTier, beadCount),
    [beadCount, resolvedTier],
  );

  const phys = useMemo(
    () =>
      computePhysicalDimensions(
        width,
        height,
        settings.beadSizeMm,
        settings.craftId,
        settings.meltLevel,
      ),
    [height, settings.beadSizeMm, settings.craftId, settings.meltLevel, width],
  );

  // Refs holding active Three.js objects across renders
  const engineRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    beadRoot: THREE.Group;
    envRoot: THREE.Group;
    keyLight: THREE.DirectionalLight;
    fillLight: THREE.DirectionalLight;
    rimLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    shadowCatcherMesh: THREE.Mesh | null;
    contactShadowMesh: THREE.Mesh | null;
    pmremEnvTex: THREE.Texture | null;
    dataTextures: THREE.DataTexture[];
    tween: TweenState | null;
    requestRender: () => void;
    autoRotate: boolean;
  } | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Initialize Three.js WebGL context once (re-created only if antialias/tier fundamentally requires or on mount)
  useEffect(() => {
    if (webglLostReason) return;
    const container = hostRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: profile.antialias,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglLostReason('WebGL 上下文初始化失败，已自动切换为 2.5D 预览模式。');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = profile.shadowMapEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxDpr));

    const rect = container.getBoundingClientRect();
    const initW = Math.max(1, Math.floor(rect.width));
    const initH = Math.max(1, Math.floor(rect.height));
    renderer.setSize(initW, initH, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const maxSpan = Math.max(width, height, 12);
    const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.2, Math.max(600, maxSpan * 12));
    camera.position.set(maxSpan * 0.58, maxSpan * 0.92, maxSpan * 0.92);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = Math.max(4, maxSpan * 0.18);
    controls.maxDistance = maxSpan * 4.5;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = Math.PI - 0.02;
    controls.target.set(0, 0, 0);
    controls.update();

    let pmremEnvTex: THREE.Texture | null = null;
    if (profile.enablePMREM) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      pmremEnvTex = pmrem.fromScene(roomEnv, 0.04).texture;
      scene.environment = pmremEnvTex;
      roomEnv.dispose();
      pmrem.dispose();
    }

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd0d0d0, 0.7);
    const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
    keyLight.castShadow = true;
    const fillLight = new THREE.DirectionalLight(0xe5efff, 0.7);
    const rimLight = new THREE.DirectionalLight(0xffe7cc, 0.45);
    scene.add(hemiLight, keyLight, fillLight, rimLight);

    const envRoot = new THREE.Group();
    const beadRoot = new THREE.Group();
    scene.add(envRoot, beadRoot);

    const watchdog = new FpsWatchdog();
    let rafId = 0;
    let dirty = true;
    let lastTs = performance.now();
    let disposed = false;

    const tick = (now: number) => {
      rafId = 0;
      if (disposed) return;

      const deltaMs = now - lastTs;
      lastTs = now;

      const engine = engineRef.current;
      if (!engine) return;

      let keepGoing = false;

      if (engine.tween?.active) {
        const t = Math.min(1, (now - engine.tween.startTime) / engine.tween.durationMs);
        const ease = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(engine.tween.fromPos, engine.tween.toPos, ease);
        controls.target.lerpVectors(engine.tween.fromTarget, engine.tween.toTarget, ease);
        controls.update();
        if (t >= 1) {
          engine.tween.active = false;
        } else {
          keepGoing = true;
        }
      } else {
        controls.autoRotate = engine.autoRotate;
        controls.autoRotateSpeed = 1.6;
        const moved = controls.update();
        if (moved || engine.autoRotate) {
          keepGoing = true;
        }
      }

      if (dirty || keepGoing) {
        dirty = false;
        renderer.render(scene, camera);

        if (
          settingsRef.current.qualityTier === 'auto' &&
          keepGoing &&
          watchdog.recordFrame(deltaMs)
        ) {
          const currentTier = resolveQualityTier('auto', hwProbe);
          const next = getDowngradedTier(runtimeDowngrade ?? currentTier);
          if (next) {
            setRuntimeDowngrade(next);
            onToast('检测到设备帧率较低，已自动优化 3D 渲染画质以保持流畅', 'info');
          }
        }
      }

      if (keepGoing) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const requestRender = () => {
      if (disposed) return;
      dirty = true;
      if (!rafId) {
        lastTs = performance.now();
        rafId = window.requestAnimationFrame(tick);
      }
    };

    controls.addEventListener('change', requestRender);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglLostReason('WebGL 图形上下文已中断，已自动切换为 2.5D 预览模式。');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const ro = new ResizeObserver(() => {
      if (disposed) return;
      const r = container.getBoundingClientRect();
      const nw = Math.max(1, Math.floor(r.width));
      const nh = Math.max(1, Math.floor(r.height));
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
      requestRender();
    });
    ro.observe(container);

    engineRef.current = {
      renderer,
      scene,
      camera,
      controls,
      beadRoot,
      envRoot,
      keyLight,
      fillLight,
      rimLight,
      hemiLight,
      shadowCatcherMesh: null,
      contactShadowMesh: null,
      pmremEnvTex,
      dataTextures: [],
      tween: null,
      requestRender,
      autoRotate: settingsRef.current.autoRotate,
    };

    requestRender();

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();
      disposeObjectTree(beadRoot);
      disposeObjectTree(envRoot);
      engineRef.current?.dataTextures.forEach((t) => t.dispose());
      pmremEnvTex?.dispose();
      renderer.dispose();
      engineRef.current = null;
    };
    // Re-init renderer only if WebGL lost state or antialias/shadowMap availability changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglLostReason, profile.antialias, profile.shadowMapEnabled, profile.enablePMREM]);

  // Keep DPR & autoRotate synced
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxDpr));
    engine.autoRotate = settings.autoRotate;
    engine.requestRender();
  }, [profile.maxDpr, settings.autoRotate]);

  // Rebuild bead meshes + materials whenever pattern, craft, melt, special-bead, or quality changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    disposeObjectTree(engine.beadRoot);
    engine.beadRoot.clear();
    engine.dataTextures.forEach((t) => t.dispose());
    engine.dataTextures = [];

    if (beadCount === 0) {
      engine.requestRender();
      return;
    }

    const preset = getCraftPreset(settings.craftId);
    const lighting = getLightingPreset(settings.lightingPreset);
    const keyPos = sphericalToLightPosition(
      settings.lightAzimuth,
      settings.lightElevation,
      Math.max(width, height) * 1.4,
    );
    const keyDir = keyPos.clone().normalize();

    const { albedoTexture, materialMaskTexture } = buildPixelDataTextures(
      grid,
      width,
      height,
      palette,
      brandId,
      settings.enableSpecialBeads,
    );
    engine.dataTextures.push(albedoTexture, materialMaskTexture);

    const castShadow = profile.shadowMapEnabled;
    const receiveShadow = profile.shadowMapEnabled;

    if (preset.geometryMode === 'holed') {
      if (profile.holedLod === 'impostor') {
        const { topGeometry } = buildFusedSlabGeometries(
          grid,
          width,
          height,
          palette,
          phys.thicknessWorld,
          1,
          settings.craftId,
          settings.meltLevel,
          true,
        );
        const impMat = createHoledImpostorMaterial({
          width,
          height,
          albedoTexture,
          materialMaskTexture,
          holeRadiusRatio: phys.holeRadiusRatio,
          roughness: preset.roughness,
          glowBoost: lighting.glowBoost,
          enableSpecialBeads: settings.enableSpecialBeads,
          keyLightDir: keyDir,
        });
        const impMesh = new THREE.Mesh(topGeometry, impMat);
        impMesh.position.y = 0;
        impMesh.castShadow = castShadow;
        impMesh.receiveShadow = receiveShadow;
        engine.beadRoot.add(impMesh);
      } else {
        const beadGeom = createHollowBeadGeometry(
          phys.thicknessWorld,
          phys.holeRadiusRatio,
          profile.holedLod,
        );
        const stdMat = new THREE.MeshStandardMaterial({
          roughness: preset.roughness,
          metalness: 0.0,
        });
        const transMat = new THREE.MeshStandardMaterial({
          roughness: Math.max(0.1, preset.roughness - 0.14),
          metalness: 0.0,
          transparent: true,
          opacity: 0.78,
        });
        const glowMat = new THREE.MeshStandardMaterial({
          roughness: preset.roughness,
          metalness: 0.0,
        });
        enhanceBeadMaterialWithCraftShader(glowMat, {
          craftId: settings.craftId,
          width,
          height,
          craftRepeat: preset.patternRepeatPerBead,
          seamStrength: 0,
          meltLevel: settings.meltLevel,
          colorWarp: 0,
          holeRadiusRatio: phys.holeRadiusRatio,
          enableSSS: profile.enableSSS,
          glowBoost: Math.max(0.35, lighting.glowBoost),
          enableSpecialBeads: settings.enableSpecialBeads,
          materialMaskTexture,
          keyLightDir: keyDir,
          glitterMap: null,
          glitterIntensity: 0,
          glitterIridescence: 0,
          backHolesMode: false,
        });

        const chunkedGroup = buildChunkedHoledBeads(
          grid,
          width,
          height,
          palette,
          brandId,
          settings.enableSpecialBeads,
          beadGeom,
          {
            standardMaterial: stdMat,
            transparentMaterial: transMat,
            glowMaterial: glowMat,
          },
          castShadow,
          receiveShadow,
        );
        engine.beadRoot.add(chunkedGroup);
      }

      if (settings.craftId === 'unfused' && settings.showPegboard) {
        const pegboard = buildPegboardGroup(width, height, phys.thicknessWorld);
        engine.beadRoot.add(pegboard);
      }
    } else {
      // Fused slab + circular/scalloped organic perimeter
      const { topGeometry, bottomGeometry, perimeterGeometry } = buildFusedSlabGeometries(
        grid,
        width,
        height,
        palette,
        phys.thicknessWorld,
        profile.perimeterArcSegments,
        settings.craftId,
        settings.meltLevel,
      );

      const craftMaps = getCraftThreeTextures(settings.craftId, profile.textureResolution);
      const repX = width * preset.patternRepeatPerBead;
      const repY = height * preset.patternRepeatPerBead;
      craftMaps.normalMap.repeat.set(repX, repY);
      craftMaps.roughnessMap.repeat.set(repX, repY);
      const colorWarp = preset.colorWarpStrength * (0.65 + 0.5 * settings.meltLevel);

      const topMat = profile.usePhysicalMaterial
        ? new THREE.MeshPhysicalMaterial({
            map: albedoTexture,
            normalMap: craftMaps.normalMap,
            normalScale: new THREE.Vector2(phys.normalStrength, phys.normalStrength),
            roughnessMap: craftMaps.roughnessMap,
            roughness: 1.0,
            metalness: 0.0,
            ior: 1.52,
            clearcoat: preset.clearcoat,
            clearcoatRoughness: preset.clearcoatRoughness,
          })
        : new THREE.MeshStandardMaterial({
            map: albedoTexture,
            normalMap: craftMaps.normalMap,
            normalScale: new THREE.Vector2(phys.normalStrength, phys.normalStrength),
            roughnessMap: craftMaps.roughnessMap,
            roughness: 1.0,
            metalness: 0.0,
          });

      enhanceBeadMaterialWithCraftShader(topMat, {
        craftId: settings.craftId,
        width,
        height,
        craftRepeat: preset.patternRepeatPerBead,
        seamStrength: phys.seamStrength,
        meltLevel: settings.meltLevel,
        colorWarp,
        holeRadiusRatio: phys.holeRadiusRatio,
        enableSSS: profile.enableSSS,
        glowBoost: lighting.glowBoost,
        enableSpecialBeads: settings.enableSpecialBeads,
        materialMaskTexture,
        keyLightDir: keyDir,
        glitterMap: profile.enableDynamicGlitter ? craftMaps.sparkleMap : null,
        glitterIntensity: preset.sparkle?.intensity ?? 0,
        glitterIridescence: preset.sparkle?.iridescence ?? 0,
        backHolesMode: false,
      });

      const topMesh = new THREE.Mesh(topGeometry, topMat);
      topMesh.castShadow = castShadow;
      topMesh.receiveShadow = receiveShadow;
      engine.beadRoot.add(topMesh);

      if (settings.sideMode === 'double-sided') {
        const bottomMesh = new THREE.Mesh(bottomGeometry, topMat);
        bottomMesh.castShadow = castShadow;
        bottomMesh.receiveShadow = receiveShadow;
        engine.beadRoot.add(bottomMesh);
      } else {
        const backMat = new THREE.MeshStandardMaterial({
          map: albedoTexture,
          roughness: 0.34,
          metalness: 0.0,
        });
        enhanceBeadMaterialWithCraftShader(backMat, {
          craftId: settings.craftId,
          width,
          height,
          craftRepeat: preset.patternRepeatPerBead,
          seamStrength: Math.max(0.35, phys.seamStrength),
          meltLevel: settings.meltLevel,
          colorWarp: 0,
          holeRadiusRatio: phys.holeRadiusRatio,
          enableSSS: profile.enableSSS,
          glowBoost: lighting.glowBoost,
          enableSpecialBeads: settings.enableSpecialBeads,
          materialMaskTexture,
          keyLightDir: keyDir,
          glitterMap: null,
          glitterIntensity: 0,
          glitterIridescence: 0,
          backHolesMode: true,
        });
        const bottomMesh = new THREE.Mesh(bottomGeometry, backMat);
        bottomMesh.castShadow = castShadow;
        bottomMesh.receiveShadow = receiveShadow;
        engine.beadRoot.add(bottomMesh);
      }

      const sideMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: Math.min(0.48, preset.roughness + 0.08),
        metalness: 0.0,
      });
      const sideMesh = new THREE.Mesh(perimeterGeometry, sideMat);
      sideMesh.castShadow = castShadow;
      sideMesh.receiveShadow = receiveShadow;
      engine.beadRoot.add(sideMesh);
    }

    engine.requestRender();
  }, [
    beadCount,
    brandId,
    grid,
    height,
    palette,
    phys,
    profile,
    settings.craftId,
    settings.enableSpecialBeads,
    settings.lightingPreset,
    settings.meltLevel,
    settings.showPegboard,
    settings.sideMode,
    width,
    // Keep keyLightDir synced smoothly below without full rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  // Update lighting, tabletop, shadows, and shader light-dir without rebuilding geometry
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const lighting = getLightingPreset(settings.lightingPreset);
    const bgHex = theme === 'dark' ? lighting.bgDarkHex : lighting.bgLightHex;
    engine.scene.background = new THREE.Color(bgHex);
    engine.scene.environmentIntensity = lighting.envIntensity;

    const span = Math.max(width, height, 12);
    const keyPos = sphericalToLightPosition(
      settings.lightAzimuth,
      settings.lightElevation,
      span * 1.45,
    );
    const keyDir = keyPos.clone().normalize();

    engine.hemiLight.color.setHex(lighting.hemiSkyColor);
    engine.hemiLight.groundColor.setHex(lighting.hemiGroundColor);
    engine.hemiLight.intensity = lighting.hemiIntensity;

    engine.keyLight.color.setHex(lighting.keyColor);
    engine.keyLight.intensity = lighting.keyIntensity;
    engine.keyLight.position.copy(keyPos);
    engine.keyLight.castShadow = profile.shadowMapEnabled;

    if (profile.shadowMapEnabled && profile.shadowMapSize > 0) {
      const cam = engine.keyLight.shadow.camera;
      const halfExtent = span * 0.72;
      cam.left = -halfExtent;
      cam.right = halfExtent;
      cam.top = halfExtent;
      cam.bottom = -halfExtent;
      cam.near = 1;
      cam.far = span * 4;
      cam.updateProjectionMatrix();
      if (engine.keyLight.shadow.mapSize.width !== profile.shadowMapSize) {
        engine.keyLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
        engine.keyLight.shadow.map?.dispose();
        engine.keyLight.shadow.map = null;
      }
      engine.keyLight.shadow.bias = -0.0005;
    }

    engine.fillLight.color.setHex(lighting.fillColor);
    engine.fillLight.intensity = lighting.fillIntensity;
    engine.fillLight.position.set(-keyPos.x * 0.7, span * 0.85, -keyPos.z * 0.6);

    engine.rimLight.color.setHex(lighting.rimColor);
    engine.rimLight.intensity = lighting.rimIntensity;
    engine.rimLight.position.set(-keyPos.x * 0.5, span * 0.45, keyPos.z * -0.9);

    // Rebuild quality-adaptive soft shadow plane (ShadowMaterial on balanced/ultra, baked contact on lite)
    disposeObjectTree(engine.envRoot);
    engine.envRoot.clear();
    engine.shadowCatcherMesh = null;
    engine.contactShadowMesh = null;

    const baseBottomY =
      settings.craftId === 'unfused' && settings.showPegboard
        ? -phys.thicknessWorld * 0.5 - 0.37
        : -phys.thicknessWorld * 0.5 - 0.02;

    if (profile.shadowMapEnabled) {
      const catcherSize = Math.max(40, span * 3.5);
      const catcherGeom = new THREE.PlaneGeometry(catcherSize, catcherSize);
      catcherGeom.rotateX(-Math.PI / 2);
      const catcherMat = new THREE.ShadowMaterial({
        opacity: lighting.shadowOpacity,
      });
      const catcherMesh = new THREE.Mesh(catcherGeom, catcherMat);
      catcherMesh.position.y = baseBottomY;
      catcherMesh.receiveShadow = true;
      engine.envRoot.add(catcherMesh);
      engine.shadowCatcherMesh = catcherMesh;
    } else {
      const contact = createBakedContactShadowMesh(width, height, baseBottomY + 0.005);
      engine.envRoot.add(contact);
      engine.contactShadowMesh = contact;
    }

    // Update shader uniforms on existing materials
    engine.beadRoot.traverse((obj) => {
      const m = (obj as THREE.Mesh).material;
      const mats = Array.isArray(m) ? m : m ? [m] : [];
      for (const mat of mats) {
        const u = mat.userData?.craftUniforms;
        if (u?.uKeyLightDir) {
          u.uKeyLightDir.value.copy(keyDir);
        }
        if (u?.uGlowBoost) {
          u.uGlowBoost.value = lighting.glowBoost;
        }
      }
    });

    engine.requestRender();
  }, [
    height,
    phys.thicknessWorld,
    profile.shadowMapEnabled,
    profile.shadowMapSize,
    settings.craftId,
    settings.lightAzimuth,
    settings.lightElevation,
    settings.lightingPreset,
    settings.showPegboard,
    theme,
    width,
  ]);

  // Reset camera target/bounds when grid dimensions change significantly
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const maxSpan = Math.max(width, height, 12);
    engine.controls.minDistance = Math.max(4, maxSpan * 0.18);
    engine.controls.maxDistance = maxSpan * 4.5;
    engine.camera.far = Math.max(600, maxSpan * 12);
    engine.camera.updateProjectionMatrix();
    engine.camera.position.set(maxSpan * 0.58, maxSpan * 0.92, maxSpan * 0.92);
    engine.controls.target.set(0, 0, 0);
    engine.controls.update();
    engine.requestRender();
  }, [width, height]);

  const animateCameraPreset = (preset: CameraViewPreset) => {
    const engine = engineRef.current;
    if (!engine) return;

    const span = Math.max(width, height, 12);
    const dist = span * 1.38;
    let azDeg = 35;
    let elDeg = 48;

    switch (preset) {
      case 'front':
        azDeg = 0;
        elDeg = 82;
        break;
      case 'back':
        azDeg = 0;
        elDeg = -76;
        break;
      case 'side':
        azDeg = 22;
        elDeg = 16;
        break;
      case 'iso':
      case 'reset':
        azDeg = 35;
        elDeg = 48;
        break;
    }

    const az = (azDeg * Math.PI) / 180;
    const el = (elDeg * Math.PI) / 180;
    const cosEl = Math.cos(el);
    const toPos = new THREE.Vector3(
      dist * cosEl * Math.sin(az),
      dist * Math.sin(el),
      dist * cosEl * Math.cos(az),
    );

    engine.tween = {
      active: true,
      startTime: performance.now(),
      durationMs: 360,
      fromPos: engine.camera.position.clone(),
      toPos,
      fromTarget: engine.controls.target.clone(),
      toTarget: new THREE.Vector3(0, 0, 0),
    };
    engine.requestRender();
  };

  useImperativeHandle(
    snapshotRef,
    () => ({
      capturePng: async (scale) => {
        const engine = engineRef.current;
        if (!engine) return;
        const prevCatcherVisible = engine.shadowCatcherMesh?.visible ?? false;
        const prevShadowVisible = engine.contactShadowMesh?.visible ?? false;
        await capturePreviewSnapshot({
          renderer: engine.renderer,
          scene: engine.scene,
          camera: engine.camera,
          scale,
          fileName: `${projectName || 'bead-studio'}-3d-${settings.craftId}.png`,
          onBeforeCapture: () => {
            if (engine.shadowCatcherMesh) engine.shadowCatcherMesh.visible = false;
            if (engine.contactShadowMesh) engine.contactShadowMesh.visible = false;
          },
          onAfterCapture: () => {
            if (engine.shadowCatcherMesh) engine.shadowCatcherMesh.visible = prevCatcherVisible;
            if (engine.contactShadowMesh) engine.contactShadowMesh.visible = prevShadowVisible;
          },
        });
      },
    }),
    [projectName, settings.craftId],
  );

  if (webglLostReason) {
    return (
      <Fallback25DCanvas
        grid={grid}
        width={width}
        height={height}
        palette={palette}
        settings={settings}
        theme={theme}
        projectName={projectName}
        reason={webglLostReason}
        snapshotRef={snapshotRef}
      />
    );
  }

  return (
    <div className="relative flex-1 w-full h-full min-h-0 overflow-hidden select-none">
      <div
        ref={hostRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        aria-label="3D 拼豆成品交互预览画布"
      />

      {/* Top-left floating physical specs & quality badge */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 pointer-events-none">
        <div
          className="px-3 py-1.5 rounded-full text-[11px] font-medium gemini-pill flex items-center gap-2"
          style={{ color: 'var(--md-on-surface)' }}
        >
          <span className="font-mono font-semibold">
            {phys.widthCm} × {phys.heightCm} cm
          </span>
          <span style={{ color: 'var(--md-on-surface-variant)' }}>
            {settings.beadSizeMm}mm · {beadCount.toLocaleString()} 颗
          </span>
        </div>
        <div
          className="px-2.5 py-1 rounded-full text-[11px] font-medium gemini-pill"
          style={{ color: 'var(--md-primary)' }}
        >
          {profile.label}
          {profile.holedLod === 'impostor' && getCraftPreset(settings.craftId).geometryMode === 'holed'
            ? ' · 极速孔洞'
            : ''}
        </div>
      </div>

      {/* Bottom floating quick camera viewpoints pill */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 ${
          compact ? 'bottom-2.5 max-w-[95%]' : 'bottom-4'
        } px-1.5 py-1 rounded-full gemini-pill flex items-center gap-0.5 overflow-x-auto`}
      >
        {(
          [
            ['front', '正面'],
            ['back', '背面'],
            ['iso', '45°'],
            ['side', '侧面'],
            ['reset', '重置'],
          ] as ReadonlyArray<[CameraViewPreset, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => animateCameraPreset(id)}
            className="h-7 px-2.5 rounded-full text-xs font-medium whitespace-nowrap m3-hover transition-colors"
            style={{ color: 'var(--md-on-surface)' }}
          >
            {label}
          </button>
        ))}

        <div
          className="w-px h-4 mx-0.5 shrink-0"
          style={{ backgroundColor: 'var(--md-outline-variant)' }}
        />

        <button
          type="button"
          onClick={() => onUpdateSettings({ autoRotate: !settings.autoRotate })}
          aria-pressed={settings.autoRotate}
          title="开启/关闭 360° 缓转展示"
          className="h-7 px-2.5 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1 transition-colors"
          style={{
            backgroundColor: settings.autoRotate ? 'var(--md-primary-container)' : 'transparent',
            color: settings.autoRotate
              ? 'var(--md-on-primary-container)'
              : 'var(--md-on-surface)',
          }}
        >
          <RotateCw className={`w-3.5 h-3.5 ${settings.autoRotate ? 'animate-spin' : ''}`} />
          <span>360°</span>
        </button>

        <button
          type="button"
          onClick={onQuickSnapshot}
          title="快捷保存高清 3D 渲染图"
          className="h-7 px-2.5 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1 transition-colors"
          style={{
            backgroundColor: 'var(--md-primary)',
            color: 'var(--md-on-primary)',
          }}
        >
          <Camera className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">拍照</span>
        </button>
      </div>
    </div>
  );
};
