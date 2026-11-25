import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  FlipHorizontal2,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  type CropAspectPreset,
  type CropTransformState,
  applyAspectPresetToCrop,
  applyZoomToCrop,
  clampCropRect,
  createDefaultCropState,
  fitDimensionsToMaxSide,
  getRotatedDimensions,
  getTargetAspectRatio,
  renderPreprocessedImage,
} from '../core/imagePreprocess';
import { CANVAS_SIZE_PRESETS, type RawSourceImage } from '../store/editorStore';

interface ImagePreprocessModalProps {
  rawImage: RawSourceImage;
  initialCrop?: CropTransformState;
  initialBoardSize: number;
  onCancel: () => void;
  onConfirm: (result: {
    rgba: Uint8ClampedArray;
    width: number;
    height: number;
    previewUrl: string;
    cropState: CropTransformState;
    boardSize: number;
  }) => void;
}

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';

const ASPECT_OPTIONS: Array<{ id: CropAspectPreset; label: string }> = [
  { id: 'original', label: '原图比例' },
  { id: 'free', label: '自由裁剪' },
  { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' },
  { id: '4:3', label: '4:3' },
];

const CANVAS_W = 520;
const CANVAS_H = 380;
const CANVAS_PAD = 18;

export const ImagePreprocessModal: React.FC<ImagePreprocessModalProps> = ({
  rawImage,
  initialCrop,
  initialBoardSize,
  onCancel,
  onConfirm,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  const [crop, setCrop] = useState<CropTransformState>(
    () => initialCrop ?? createDefaultCropState(),
  );
  const [boardSize, setBoardSize] = useState<number>(() =>
    CANVAS_SIZE_PRESETS.includes(initialBoardSize as (typeof CANVAS_SIZE_PRESETS)[number])
      ? initialBoardSize
      : Math.max(8, Math.min(200, Math.round(initialBoardSize || 52))),
  );

  const dragRef = useRef<{
    handle: DragHandle;
    startX: number;
    startY: number;
    startCrop: CropTransformState;
  } | null>(null);

  useEffect(() => {
    setImgLoaded(false);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = rawImage.url;
  }, [rawImage.url]);

  const { width: rotW, height: rotH } = useMemo(
    () => getRotatedDimensions(rawImage.width, rawImage.height, crop.rotation),
    [crop.rotation, rawImage.height, rawImage.width],
  );

  const baseRect = useMemo(
    () => applyAspectPresetToCrop(rotW, rotH, crop.aspectPreset),
    [crop.aspectPreset, rotH, rotW],
  );

  const currentZoom = useMemo(() => {
    const z = Math.min(baseRect.w / Math.max(0.01, crop.w), baseRect.h / Math.max(0.01, crop.h));
    return Math.max(1, Math.min(4, Math.round(z * 100) / 100));
  }, [baseRect.h, baseRect.w, crop.h, crop.w]);

  const cropPxW = Math.max(1, Math.round(crop.w * rotW));
  const cropPxH = Math.max(1, Math.round(crop.h * rotH));
  const fittedGrid = useMemo(
    () => fitDimensionsToMaxSide(cropPxW, cropPxH, boardSize),
    [boardSize, cropPxH, cropPxW],
  );

  const getLayout = useCallback(() => {
    const availW = CANVAS_W - CANVAS_PAD * 2;
    const availH = CANVAS_H - CANVAS_PAD * 2;
    const scale = Math.min(availW / Math.max(1, rotW), availH / Math.max(1, rotH));
    const drawW = rotW * scale;
    const drawH = rotH * scale;
    const imgX = (CANVAS_W - drawW) / 2;
    const imgY = (CANVAS_H - drawH) / 2;
    return { imgX, imgY, drawW, drawH };
  }, [rotH, rotW]);

  // Draw interactive crop preview
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(CANVAS_W * dpr);
    canvas.height = Math.floor(CANVAS_H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background checkerboard
    ctx.fillStyle = '#1E1F20';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const check = 12;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < CANVAS_H; y += check) {
      for (let x = ((y / check) % 2) * check; x < CANVAS_W; x += check * 2) {
        ctx.fillRect(x, y, check, check);
      }
    }

    const { imgX, imgY, drawW, drawH } = getLayout();

    // Draw rotated & flipped image crisply
    ctx.save();
    ctx.imageSmoothingEnabled = Math.max(rotW, rotH) > 320;
    ctx.translate(imgX + drawW / 2, imgY + drawH / 2);
    ctx.rotate((crop.rotation * Math.PI) / 180);
    ctx.scale(crop.flipH ? -1 : 1, crop.flipV ? -1 : 1);
    const unrotDrawW = crop.rotation === 90 || crop.rotation === 270 ? drawH : drawW;
    const unrotDrawH = crop.rotation === 90 || crop.rotation === 270 ? drawW : drawH;
    ctx.drawImage(img, -unrotDrawW / 2, -unrotDrawH / 2, unrotDrawW, unrotDrawH);
    ctx.restore();

    // Dim exterior outside crop rect
    const cx = imgX + crop.x * drawW;
    const cy = imgY + crop.y * drawH;
    const cw = crop.w * drawW;
    const ch = crop.h * drawH;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(imgX, imgY, drawW, Math.max(0, cy - imgY));
    ctx.fillRect(imgX, cy + ch, drawW, Math.max(0, imgY + drawH - (cy + ch)));
    ctx.fillRect(imgX, cy, Math.max(0, cx - imgX), ch);
    ctx.fillRect(cx + cw, cy, Math.max(0, imgX + drawW - (cx + cw)), ch);

    // Rule-of-thirds grid inside crop
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 2; i++) {
      const gx = cx + (cw * i) / 3;
      const gy = cy + (ch * i) / 3;
      ctx.moveTo(gx, cy);
      ctx.lineTo(gx, cy + ch);
      ctx.moveTo(cx, gy);
      ctx.lineTo(cx + cw, gy);
    }
    ctx.stroke();

    // Crop border
    const primary =
      getComputedStyle(document.documentElement).getPropertyValue('--md-primary').trim() || '#0B57D0';
    ctx.strokeStyle = primary;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);

    // 8 handles
    const handles: Array<[number, number]> = [
      [cx, cy],
      [cx + cw, cy],
      [cx, cy + ch],
      [cx + cw, cy + ch],
      [cx + cw / 2, cy],
      [cx + cw / 2, cy + ch],
      [cx, cy + ch / 2],
      [cx + cw, cy + ch / 2],
    ];
    for (const [hx, hy] of handles) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }, [crop, getLayout, imgLoaded, rotH, rotW]);

  const toCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * CANVAS_W,
      y: ((clientY - rect.top) / Math.max(1, rect.height)) * CANVAS_H,
    };
  };

  const hitTestHandle = (px: number, py: number): DragHandle | null => {
    const { imgX, imgY, drawW, drawH } = getLayout();
    const cx = imgX + crop.x * drawW;
    const cy = imgY + crop.y * drawH;
    const cw = crop.w * drawW;
    const ch = crop.h * drawH;

    const points: Array<[DragHandle, number, number]> = [
      ['nw', cx, cy],
      ['ne', cx + cw, cy],
      ['sw', cx, cy + ch],
      ['se', cx + cw, cy + ch],
      ['n', cx + cw / 2, cy],
      ['s', cx + cw / 2, cy + ch],
      ['w', cx, cy + ch / 2],
      ['e', cx + cw, cy + ch / 2],
    ];
    for (const [h, hx, hy] of points) {
      if (Math.hypot(px - hx, py - hy) <= 12) return h;
    }
    if (px >= cx && px <= cx + cw && py >= cy && py <= cy + ch) {
      return 'move';
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toCanvasCoords(e.clientX, e.clientY);
    const handle = hitTestHandle(pt.x, pt.y);
    if (!handle) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      handle,
      startX: pt.x,
      startY: pt.y,
      startCrop: { ...crop },
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pt = toCanvasCoords(e.clientX, e.clientY);
    const { drawW, drawH } = getLayout();
    const dxNorm = (pt.x - drag.startX) / Math.max(1, drawW);
    const dyNorm = (pt.y - drag.startY) / Math.max(1, drawH);
    const sc = drag.startCrop;

    if (drag.handle === 'move') {
      setCrop((prev) => ({
        ...prev,
        x: Math.max(0, Math.min(1 - sc.w, sc.x + dxNorm)),
        y: Math.max(0, Math.min(1 - sc.h, sc.y + dyNorm)),
      }));
      return;
    }

    const targetRatio = getTargetAspectRatio(rotW, rotH, sc.aspectPreset);
    const pxLeft = sc.x * rotW;
    const pxTop = sc.y * rotH;
    const pxRight = (sc.x + sc.w) * rotW;
    const pxBot = (sc.y + sc.h) * rotH;
    const pxDx = dxNorm * rotW;
    const pxDy = dyNorm * rotH;
    const minPx = Math.max(8, 0.08 * Math.min(rotW, rotH));

    if (targetRatio === null) {
      // Free resize
      let l = pxLeft;
      let t = pxTop;
      let r = pxRight;
      let b = pxBot;
      if (drag.handle.includes('w')) l = Math.max(0, Math.min(r - minPx, pxLeft + pxDx));
      if (drag.handle.includes('e')) r = Math.min(rotW, Math.max(l + minPx, pxRight + pxDx));
      if (drag.handle.includes('n')) t = Math.max(0, Math.min(b - minPx, pxTop + pxDy));
      if (drag.handle.includes('s')) b = Math.min(rotH, Math.max(t + minPx, pxBot + pxDy));
      setCrop((prev) => ({
        ...prev,
        ...clampCropRect({ x: l / rotW, y: t / rotH, w: (r - l) / rotW, h: (b - t) / rotH }),
      }));
      return;
    }

    // Locked pixel-space aspect ratio resize
    let anchorX = pxLeft;
    let anchorY = pxTop;
    let maxW = rotW;
    let maxH = rotH;
    let signX = 1;
    let signY = 1;

    if (drag.handle === 'nw') {
      anchorX = pxRight;
      anchorY = pxBot;
      maxW = anchorX;
      maxH = anchorY;
      signX = -1;
      signY = -1;
    } else if (drag.handle === 'ne') {
      anchorX = pxLeft;
      anchorY = pxBot;
      maxW = rotW - anchorX;
      maxH = anchorY;
      signX = 1;
      signY = -1;
    } else if (drag.handle === 'sw') {
      anchorX = pxRight;
      anchorY = pxTop;
      maxW = anchorX;
      maxH = rotH - anchorY;
      signX = -1;
      signY = 1;
    } else if (drag.handle === 'se') {
      anchorX = pxLeft;
      anchorY = pxTop;
      maxW = rotW - anchorX;
      maxH = rotH - anchorY;
      signX = 1;
      signY = 1;
    } else if (drag.handle === 'e' || drag.handle === 'w') {
      const centerY = (pxTop + pxBot) / 2;
      const candW =
        drag.handle === 'e' ? pxRight - pxLeft + pxDx : pxRight - pxLeft - pxDx;
      const limitW =
        drag.handle === 'e' ? rotW - pxLeft : pxRight;
      const maxHByCenter = Math.min(centerY, rotH - centerY) * 2;
      const clampedMaxW = Math.min(limitW, maxHByCenter * targetRatio);
      const newW = Math.max(minPx, Math.min(clampedMaxW, candW));
      const newH = newW / targetRatio;
      const l = drag.handle === 'e' ? pxLeft : pxRight - newW;
      const t = centerY - newH / 2;
      setCrop((prev) => ({
        ...prev,
        ...clampCropRect({ x: l / rotW, y: t / rotH, w: newW / rotW, h: newH / rotH }),
      }));
      return;
    } else if (drag.handle === 'n' || drag.handle === 's') {
      const centerX = (pxLeft + pxRight) / 2;
      const candH =
        drag.handle === 's' ? pxBot - pxTop + pxDy : pxBot - pxTop - pxDy;
      const limitH =
        drag.handle === 's' ? rotH - pxTop : pxBot;
      const maxWByCenter = Math.min(centerX, rotW - centerX) * 2;
      const clampedMaxH = Math.min(limitH, maxWByCenter / targetRatio);
      const newH = Math.max(minPx, Math.min(clampedMaxH, candH));
      const newW = newH * targetRatio;
      const t = drag.handle === 's' ? pxTop : pxBot - newH;
      const l = centerX - newW / 2;
      setCrop((prev) => ({
        ...prev,
        ...clampCropRect({ x: l / rotW, y: t / rotH, w: newW / rotW, h: newH / rotH }),
      }));
      return;
    }

    const rawW = (pxRight - pxLeft) + signX * pxDx;
    const rawH = (pxBot - pxTop) + signY * pxDy;
    const desiredW = Math.max(rawW, rawH * targetRatio);
    const maxAllowedW = Math.min(maxW, maxH * targetRatio);
    const minAllowedW = Math.max(minPx, minPx * targetRatio);
    const newW = Math.max(minAllowedW, Math.min(maxAllowedW, desiredW));
    const newH = newW / targetRatio;

    const left = signX > 0 ? anchorX : anchorX - newW;
    const top = signY > 0 ? anchorY : anchorY - newH;
    setCrop((prev) => ({
      ...prev,
      ...clampCropRect({ x: left / rotW, y: top / rotH, w: newW / rotW, h: newH / rotH }),
    }));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const nextZoom = Math.max(1, Math.min(4, currentZoom + (e.deltaY < 0 ? 0.15 : -0.15)));
    setCrop((prev) => ({
      ...prev,
      ...applyZoomToCrop(prev, baseRect.w, baseRect.h, nextZoom),
    }));
  };

  const handleConfirmWith = (stateToApply: CropTransformState) => {
    const img = imgRef.current;
    if (!img) return;
    const rendered = renderPreprocessedImage(img, stateToApply);
    onConfirm({
      ...rendered,
      cropState: stateToApply,
      boardSize,
    });
  };

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-label="图片预处理（裁剪与缩放）"
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] rounded-2xl gemini-modal flex flex-col overflow-hidden"
        style={{ color: 'var(--md-on-surface)' }}
      >
        <div
          className="px-5 py-3.5 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: 'var(--md-outline-subtle)' }}
        >
          <div>
            <h2 className="font-display text-base font-semibold">图片预处理 · 裁剪与缩放</h2>
            <div className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
              {rawImage.fileName} · 原图 {rawImage.width}×{rawImage.height} px
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="关闭预处理弹窗"
            className="w-8 h-8 rounded-full flex items-center justify-center m3-hover"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-5 gap-5">
          {/* Interactive Crop Canvas */}
          <div className="md:col-span-3 flex flex-col gap-2">
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheelZoom}
              className="w-full aspect-[520/380] rounded-xl cursor-move touch-none"
              style={{ border: '1px solid var(--md-outline-variant)' }}
            />
            <div className="text-[11px] text-center" style={{ color: 'var(--md-on-surface-variant)' }}>
              拖动选框移动位置，拖动四角/边控制点调整裁剪范围，滚轮缩放裁剪区域
            </div>
          </div>

          {/* Right Controls */}
          <div className="md:col-span-2 flex flex-col gap-3">
            {/* Aspect Presets */}
            <div className="rounded-xl p-3 flex flex-col gap-2 gemini-card">
              <span className="text-xs font-semibold">裁剪比例</span>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_OPTIONS.map((opt) => {
                  const active = crop.aspectPreset === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        const rect = applyAspectPresetToCrop(rotW, rotH, opt.id);
                        setCrop((prev) => ({
                          ...prev,
                          aspectPreset: opt.id,
                          ...rect,
                        }));
                      }}
                      className="h-7 px-3 rounded-full text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: active
                          ? 'var(--md-primary)'
                          : 'var(--md-surface-container)',
                        color: active ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Zoom slider */}
              <div className="pt-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>缩放裁剪</span>
                  <span className="font-mono">{Math.round(currentZoom * 100)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="缩小裁剪"
                    onClick={() =>
                      setCrop((prev) => ({
                        ...prev,
                        ...applyZoomToCrop(prev, baseRect.w, baseRect.h, currentZoom - 0.2),
                      }))
                    }
                    className="w-7 h-7 rounded-full flex items-center justify-center gemini-tonal-btn"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.05}
                    aria-label="裁剪缩放比例"
                    value={currentZoom}
                    onChange={(e) => {
                      const z = Number(e.target.value);
                      setCrop((prev) => ({
                        ...prev,
                        ...applyZoomToCrop(prev, baseRect.w, baseRect.h, z),
                      }));
                    }}
                    className="flex-1 accent-[var(--md-primary)]"
                  />
                  <button
                    type="button"
                    aria-label="放大裁剪"
                    onClick={() =>
                      setCrop((prev) => ({
                        ...prev,
                        ...applyZoomToCrop(prev, baseRect.w, baseRect.h, currentZoom + 0.2),
                      }))
                    }
                    className="w-7 h-7 rounded-full flex items-center justify-center gemini-tonal-btn"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Rotate / Flip / Reset */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setCrop((prev) => {
                      const nextRot = ((prev.rotation + 90) % 360) as 0 | 90 | 180 | 270;
                      const nextDims = getRotatedDimensions(rawImage.width, rawImage.height, nextRot);
                      const rect = applyAspectPresetToCrop(
                        nextDims.width,
                        nextDims.height,
                        prev.aspectPreset,
                      );
                      return { ...prev, rotation: nextRot, ...rect };
                    })
                  }
                  className="h-7 px-2.5 rounded-full text-xs flex items-center gap-1 gemini-tonal-btn"
                >
                  <RotateCw className="w-3.5 h-3.5" /> 旋转 90°
                </button>
                <button
                  type="button"
                  onClick={() => setCrop((prev) => ({ ...prev, flipH: !prev.flipH }))}
                  className="h-7 px-2.5 rounded-full text-xs flex items-center gap-1 gemini-tonal-btn"
                  style={{
                    backgroundColor: crop.flipH ? 'var(--md-primary-container)' : undefined,
                    color: crop.flipH ? 'var(--md-on-primary-container)' : undefined,
                  }}
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5" /> 水平翻转
                </button>
                <button
                  type="button"
                  onClick={() => setCrop(createDefaultCropState())}
                  className="h-7 px-2.5 rounded-full text-xs flex items-center gap-1 gemini-tonal-btn"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> 重置
                </button>
              </div>
            </div>

            {/* Pegboard size & live output */}
            <div className="rounded-xl p-3 flex flex-col gap-2 gemini-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">目标拼豆板规格</span>
                <span className="text-[11px]" style={{ color: 'var(--md-on-surface-variant)' }}>
                  最长边适配
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {CANVAS_SIZE_PRESETS.map((sz) => {
                  const active = boardSize === sz;
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setBoardSize(sz)}
                      className="h-7 rounded-full font-mono text-xs transition-colors"
                      style={{
                        backgroundColor: active
                          ? 'var(--md-primary)'
                          : 'var(--md-surface-container)',
                        color: active ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                      }}
                    >
                      {sz}×{sz}
                    </button>
                  );
                })}
              </div>

              <div className="m3-callout m3-callout-info mt-1">
                <div>
                  裁剪区域：<strong className="font-mono">{cropPxW} × {cropPxH} px</strong>
                </div>
                <div>
                  输出图纸：<strong className="font-mono">{fittedGrid.width} × {fittedGrid.height} 格</strong>
                  （完整放入 {boardSize}×{boardSize} 豆板）
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 mt-auto">
              <button
                type="button"
                disabled={!imgLoaded}
                onClick={() => handleConfirmWith(crop)}
                className="w-full h-10 px-4 rounded-full text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-45"
                style={{
                  backgroundColor: 'var(--md-primary)',
                  color: 'var(--md-on-primary)',
                }}
              >
                <Check className="w-4 h-4" />
                <span>确认并生成图纸</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!imgLoaded}
                  onClick={() => handleConfirmWith(createDefaultCropState())}
                  className="h-9 px-3 rounded-full text-xs font-medium gemini-tonal-btn"
                >
                  直接导入原图
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="h-9 px-3 rounded-full text-xs font-medium gemini-tonal-btn"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
