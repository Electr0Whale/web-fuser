import { describe, expect, it } from 'vitest';
import {
  applyAspectPresetToCrop,
  applyZoomToCrop,
  fitDimensionsByAxis,
  fitDimensionsToMaxSide,
  getRotatedDimensions,
} from '../imagePreprocess';
import { useEditorStore } from '../../store/editorStore';

describe('imagePreprocess & non-square pegboard fitting', () => {
  it('fits landscape, portrait, square, and extreme images to pegboard maxSide', () => {
    expect(fitDimensionsToMaxSide(300, 150, 52)).toEqual({ width: 52, height: 26 });
    expect(fitDimensionsToMaxSide(150, 300, 78)).toEqual({ width: 39, height: 78 });
    expect(fitDimensionsToMaxSide(178, 178, 104)).toEqual({ width: 104, height: 104 });
    expect(fitDimensionsToMaxSide(1000, 20, 52)).toEqual({ width: 52, height: 8 });
  });

  it('fits complementary axis cleanly and caps at 200 without distorting ratio', () => {
    expect(fitDimensionsByAxis(300, 150, 'w', 100)).toEqual({ width: 100, height: 50 });
    expect(fitDimensionsByAxis(150, 300, 'w', 120)).toEqual({ width: 100, height: 200 });
    expect(fitDimensionsByAxis(300, 150, 'h', 120)).toEqual({ width: 200, height: 100 });
  });

  it('computes centered aspect presets and zooms around crop center', () => {
    const sqOnWide = applyAspectPresetToCrop(300, 150, '1:1');
    expect(sqOnWide.w).toBeCloseTo(0.5, 4);
    expect(sqOnWide.h).toBeCloseTo(1, 4);
    expect(sqOnWide.x).toBeCloseTo(0.25, 4);

    const zoomed = applyZoomToCrop(sqOnWide, sqOnWide.w, sqOnWide.h, 2);
    expect(zoomed.w).toBeCloseTo(0.25, 4);
    expect(zoomed.h).toBeCloseTo(0.5, 4);
    expect(zoomed.x + zoomed.w / 2).toBeCloseTo(0.5, 4);
    expect(zoomed.y + zoomed.h / 2).toBeCloseTo(0.5, 4);

    expect(getRotatedDimensions(300, 150, 90)).toEqual({ width: 150, height: 300 });
    expect(getRotatedDimensions(300, 150, 180)).toEqual({ width: 300, height: 150 });
  });

  it('store setSourceImage & applyBoardPreset preserve aspect ratio on pegboard presets', () => {
    const store = useEditorStore.getState();
    store.newBlankCanvas(52, 52);

    const rgba = new Uint8ClampedArray(300 * 150 * 4);
    for (let i = 0; i < 300 * 150; i++) {
      rgba[i * 4] = 200;
      rgba[i * 4 + 1] = 120;
      rgba[i * 4 + 2] = 80;
      rgba[i * 4 + 3] = 255;
    }

    useEditorStore.getState().setSourceImage(
      {
        rgba,
        width: 300,
        height: 150,
        previewUrl: 'data:image/png;base64,',
        fileName: 'rect.png',
      },
      true,
      52,
    );

    expect(useEditorStore.getState().width).toBe(52);
    expect(useEditorStore.getState().height).toBe(26);

    useEditorStore.getState().applyBoardPreset(78);
    expect(useEditorStore.getState().width).toBe(78);
    expect(useEditorStore.getState().height).toBe(39);

    useEditorStore.getState().applyBoardPreset(104);
    expect(useEditorStore.getState().width).toBe(104);
    expect(useEditorStore.getState().height).toBe(52);
  });
});
