import { describe, expect, it } from "vitest";
import {
  MAX_SCALE,
  MIN_SCALE,
  actualSize,
  clampScale,
  coverView,
  cropFraction,
  fitView,
  panBy,
  toContent,
  wheelPixels,
  zoomAt,
} from "./viewport";

const RASTER = { width: 1920, height: 1080 };

describe("fitView", () => {
  it("scales the raster to fit and centres it", () => {
    const view = fitView({ width: 1000, height: 800 }, RASTER, 0);
    expect(view.scale).toBeCloseTo(1000 / 1920, 6);
    expect(view.x).toBeCloseTo(0, 6);
    // Vertically centred in the leftover space.
    expect(view.y).toBeCloseTo((800 - 1080 * (1000 / 1920)) / 2, 6);
  });

  it("fits by height when the container is wide", () => {
    const view = fitView({ width: 4000, height: 500 }, RASTER, 0);
    expect(view.scale).toBeCloseTo(500 / 1080, 6);
  });

  it("survives a container with no size yet", () => {
    const view = fitView({ width: 0, height: 0 }, RASTER);
    expect(Number.isFinite(view.scale)).toBe(true);
    expect(view.scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });
});

describe("actualSize", () => {
  it("is 1:1 and centred", () => {
    const view = actualSize({ width: 2000, height: 1200 }, RASTER);
    expect(view.scale).toBe(1);
    expect(view.x).toBe(40);
    expect(view.y).toBe(60);
  });
});

describe("zoomAt", () => {
  it("keeps the point under the cursor fixed", () => {
    const view = { scale: 1, x: 0, y: 0 };
    const before = toContent(view, 300, 200);
    const zoomed = zoomAt(view, 2, 300, 200);
    const after = toContent(zoomed, 300, 200);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });

  it("keeps it fixed when zooming out, and from an offset view", () => {
    const view = { scale: 2.5, x: -120, y: 40 };
    const before = toContent(view, 640, 360);
    const zoomed = zoomAt(view, 0.5, 640, 360);
    const after = toContent(zoomed, 640, 360);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });

  it("stops at the limits", () => {
    expect(zoomAt({ scale: MAX_SCALE, x: 0, y: 0 }, 4, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: MIN_SCALE, x: 0, y: 0 }, 0.1, 0, 0).scale).toBe(MIN_SCALE);
  });

  it("does not drift when the zoom is refused at a limit", () => {
    // Clamping must not translate: a refused zoom that still pans would slide
    // the raster away every time you hit the end of the range.
    const view = { scale: MAX_SCALE, x: 37, y: -11 };
    const zoomed = zoomAt(view, 4, 500, 250);
    expect(zoomed.x).toBeCloseTo(37, 9);
    expect(zoomed.y).toBeCloseTo(-11, 9);
  });
});

describe("panBy", () => {
  it("translates without touching the scale", () => {
    expect(panBy({ scale: 3, x: 10, y: 20 }, -5, 7)).toEqual({ scale: 3, x: 5, y: 27 });
  });
});

describe("toContent", () => {
  it("maps a container point into output-space pixels", () => {
    expect(toContent({ scale: 2, x: 100, y: 50 }, 300, 250)).toEqual([100, 100]);
  });
});

describe("clampScale", () => {
  it("refuses NaN rather than poisoning the transform", () => {
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("wheelPixels", () => {
  it("converts line and page deltas so a mouse wheel does not feel dead", () => {
    expect(wheelPixels(3, 0)).toBe(3);
    expect(wheelPixels(3, 1)).toBe(48);
    expect(wheelPixels(1, 2)).toBe(400);
  });
});

describe("coverView", () => {
  it("is exactly 1:1 when the device matches the raster", () => {
    const view = coverView({ width: 1920, height: 1080 }, RASTER);
    expect(view).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("fills a wider device and crops top and bottom", () => {
    // 21:9 device, 16:9 raster: width governs, height overflows.
    const device = { width: 2560, height: 1080 };
    const view = coverView(device, RASTER);
    expect(view.scale).toBeCloseTo(2560 / 1920, 6);
    expect(view.x).toBeCloseTo(0, 6);
    expect(view.y).toBeLessThan(0);
    const crop = cropFraction(device, RASTER);
    expect(crop.x).toBeCloseTo(0, 6);
    expect(crop.y).toBeGreaterThan(0.2);
  });

  it("fills a taller device and crops the sides", () => {
    // 4:3 projector, 16:9 raster: height governs, width overflows.
    const device = { width: 1024, height: 768 };
    const view = coverView(device, RASTER);
    expect(view.scale).toBeCloseTo(768 / 1080, 6);
    expect(view.x).toBeLessThan(0);
    const crop = cropFraction(device, RASTER);
    expect(crop.y).toBeCloseTo(0, 6);
    expect(crop.x).toBeGreaterThan(0.2);
  });

  it("never letterboxes: the raster always reaches both device edges", () => {
    for (const device of [
      { width: 800, height: 600 },
      { width: 3440, height: 1440 },
      { width: 1280, height: 1280 },
    ]) {
      const view = coverView(device, RASTER);
      expect(RASTER.width * view.scale).toBeGreaterThanOrEqual(device.width - 1e-6);
      expect(RASTER.height * view.scale).toBeGreaterThanOrEqual(device.height - 1e-6);
    }
  });
});
