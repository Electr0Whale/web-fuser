import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { BeadColor } from '../../core/colorSpace';
import { type Preview3DSettings, getCraftPreset } from '../../core/preview3d/craftCatalog';
import { getLightingPreset } from '../../core/preview3d/scenePresets';

export interface PreviewSnapshotHandle {
  capturePng: (scale: 1 | 2) => Promise<void>;
}

interface Fallback25DCanvasProps {
  grid: Int16Array;
  width: number;
  height: number;
  palette: readonly BeadColor[];
  settings: Preview3DSettings;
  theme: 'light' | 'dark';
  projectName: string;
  reason?: string;
  snapshotRef: React.RefObject<PreviewSnapshotHandle | null>;
}

export const Fallback25DCanvas: React.FC<Fallback25DCanvasProps> = ({
  grid,
  width,
  height,
  palette,
  settings,
  theme,
  projectName,
  reason,
  snapshotRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ yaw: 0.18, pitch: 0.28, zoom: 1.0 });
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });

  const drawScene = useCallback(
    (targetCanvas: HTMLCanvasElement, transparentBg: boolean, scaleFactor = 1) => {
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return;

      const cw = targetCanvas.width;
      const ch = targetCanvas.height;
      const lighting = getLightingPreset(settings.lightingPreset);
      const preset = getCraftPreset(settings.craftId);

      ctx.save();
      ctx.clearRect(0, 0, cw, ch);

      if (!transparentBg) {
        const bgHex =
          theme === 'dark'
            ? `#${lighting.bgDarkHex.toString(16).padStart(6, '0')}`
            : `#${lighting.bgLightHex.toString(16).padStart(6, '0')}`;
        ctx.fillStyle = bgHex;
        ctx.fillRect(0, 0, cw, ch);
      }

      const maxDim = Math.max(width, height);
      const baseCell = (Math.min(cw, ch) * 0.68 * tilt.zoom) / maxDim;
      const cellW = baseCell;
      const cellH = baseCell * Math.max(0.45, Math.cos(tilt.pitch));
      const depthPx = Math.max(2, baseCell * 0.65 * Math.sin(tilt.pitch));
      const skewX = Math.sin(tilt.yaw) * 0.25;

      const startX = cw * 0.5 - (width * cellW) * 0.5;
      const startY = ch * 0.5 - (height * cellH) * 0.5;

      ctx.translate(cw * 0.5, ch * 0.5);
      ctx.transform(1, skewX * 0.25, -skewX, 1, 0, 0);
      ctx.translate(-cw * 0.5, -ch * 0.5);

      // Soft contact drop shadow (only on live viewport background, omitted on transparent cutout)
      if (!transparentBg) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.24)';
        ctx.shadowBlur = 18 * scaleFactor;
        ctx.shadowOffsetX = Math.cos((settings.lightAzimuth * Math.PI) / 180) * 10 * scaleFactor;
        ctx.shadowOffsetY = Math.sin((settings.lightAzimuth * Math.PI) / 180) * 10 * scaleFactor + depthPx;
        ctx.fillStyle = 'rgba(0,0,0,0.01)';
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (grid[y * width + x] >= 0) {
              ctx.fillRect(startX + x * cellW, startY + y * cellH, cellW + 0.5, cellH + 0.5);
            }
          }
        }
        ctx.restore();
      }

      // Extruded thickness rim pass
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const ci = grid[y * width + x];
          if (ci < 0 || ci >= palette.length) continue;
          const [r, g, b] = palette[ci].rgb;
          ctx.fillStyle = `rgb(${Math.round(r * 0.68)},${Math.round(g * 0.68)},${Math.round(b * 0.68)})`;
          ctx.fillRect(startX + x * cellW, startY + y * cellH + depthPx, cellW + 0.4, cellH + 0.4);
        }
      }

      // Top face pass
      const isHoled = preset.geometryMode === 'holed';
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const ci = grid[y * width + x];
          if (ci < 0 || ci >= palette.length) continue;
          const col = palette[ci];
          const px = startX + x * cellW;
          const py = startY + y * cellH;
          ctx.fillStyle = col.hex;

          if (isHoled && cellW >= 3) {
            ctx.beginPath();
            ctx.arc(px + cellW * 0.5, py + cellH * 0.5, cellW * 0.47, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(15,15,20,0.45)';
            ctx.beginPath();
            ctx.arc(px + cellW * 0.5, py + cellH * 0.5, cellW * 0.2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(px, py, cellW + 0.45, cellH + 0.45);
          }
        }
      }

      // Craft gloss sheen overlay
      if (preset.clearcoat > 0.3) {
        const grad = ctx.createLinearGradient(startX, startY, startX + width * cellW, startY + height * cellH);
        grad.addColorStop(0, 'rgba(255,255,255,0.18)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.02)');
        grad.addColorStop(1, 'rgba(255,255,255,0.12)');
        ctx.fillStyle = grad;
        ctx.fillRect(startX, startY, width * cellW, height * cellH);
      }

      ctx.restore();
    },
    [grid, height, palette, settings, theme, tilt, width],
  );

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeAndDraw = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      drawScene(canvas, false, dpr);
    };

    resizeAndDraw();
    const ro = new ResizeObserver(resizeAndDraw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [drawScene]);

  useImperativeHandle(
    snapshotRef,
    () => ({
      capturePng: async (scale) => {
        const source = canvasRef.current;
        if (!source) return;
        const off = document.createElement('canvas');
        off.width = Math.min(3840, source.width * scale);
        off.height = Math.min(3840, source.height * scale);
        drawScene(off, true, scale);
        const blob = await new Promise<Blob | null>((resolve) =>
          off.toBlob((b) => resolve(b), 'image/png'),
        );
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName || 'bead-studio'}-2.5d-${settings.craftId}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    }),
    [drawScene, projectName, settings.craftId],
  );

  return (
    <div ref={containerRef} className="relative flex-1 w-full h-full overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          dragRef.current = { active: true, x: e.clientX, y: e.clientY };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.active) return;
          const dx = e.clientX - dragRef.current.x;
          const dy = e.clientY - dragRef.current.y;
          dragRef.current = { active: true, x: e.clientX, y: e.clientY };
          setTilt((t) => ({
            ...t,
            yaw: Math.max(-0.85, Math.min(0.85, t.yaw + dx * 0.005)),
            pitch: Math.max(0.05, Math.min(1.05, t.pitch + dy * 0.005)),
          }));
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
        onWheel={(e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.08 : 0.92;
          setTilt((t) => ({ ...t, zoom: Math.max(0.4, Math.min(2.6, t.zoom * factor)) }));
        }}
      />

      <div className="absolute top-3 left-3 max-w-md m3-callout m3-callout-info pointer-events-none">
        {reason || '当前设备或浏览器暂不支持 WebGL，已自动切换为 2.5D 兼容交互预览模式（可拖拽调整倾角）。'}
      </div>
    </div>
  );
};
