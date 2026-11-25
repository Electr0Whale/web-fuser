import * as THREE from 'three';

export interface SnapshotCaptureOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  scale: 1 | 2;
  fileName: string;
  onBeforeCapture?: () => void;
  onAfterCapture?: () => void;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Captures a high-resolution transparent-background PNG cutout of the 3D bead artwork
 * and restores the renderer state cleanly afterwards.
 */
export async function capturePreviewSnapshot(opts: SnapshotCaptureOptions): Promise<void> {
  const { renderer, scene, camera, scale, fileName } = opts;
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const prevPixelRatio = renderer.getPixelRatio();
  const prevBackground = scene.background;
  const prevClearAlpha = renderer.getClearAlpha();
  const prevClearColor = new THREE.Color();
  renderer.getClearColor(prevClearColor);

  const maxTexSize = renderer.capabilities.maxTextureSize || 4096;
  const maxSafeDim = Math.min(3840, maxTexSize);
  const targetRatio = Math.min(
    prevPixelRatio * scale,
    maxSafeDim / Math.max(1, size.x),
    maxSafeDim / Math.max(1, size.y),
  );

  try {
    renderer.setPixelRatio(Math.max(1, targetRatio));
    renderer.setSize(size.x, size.y, false);

    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    opts.onBeforeCapture?.();

    renderer.render(scene, camera);

    const blob = await new Promise<Blob | null>((resolve) =>
      renderer.domElement.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) {
      throw new Error('生成透明背景 PNG 图片失败，请重试。');
    }
    downloadBlob(blob, fileName);
  } finally {
    opts.onAfterCapture?.();
    scene.background = prevBackground;
    renderer.setClearColor(prevClearColor, prevClearAlpha);
    renderer.setPixelRatio(prevPixelRatio);
    renderer.setSize(size.x, size.y, false);
    renderer.render(scene, camera);
  }
}
