import { expect, test } from "vitest";
import { snapCropPosition, snapCropSize } from "./crop-snap";
import { cropTransform, sceneCrop } from "./output-crop";

const scene = { width: 1920, height: 1080 };
const crop = (xPx: number, yPx: number, widthPx = 960, heightPx = 540) =>
  ({ xPx, yPx, widthPx, heightPx, fit: "contain" } as const);

test("a dragged region latches to the scene's corners, edges and centre", () => {
  expect(snapCropPosition(crop(6, -4), scene, 12)).toMatchObject({ xPx: 0, yPx: 0 });
  expect(snapCropPosition(crop(955, 535), scene, 12)).toMatchObject({ xPx: 960, yPx: 540 });
  // Centre on both axes is the middle anchor, not an edge.
  expect(snapCropPosition(crop(484, 274), scene, 12)).toMatchObject({ xPx: 480, yPx: 270 });
  // One axis can latch while the other stays free.
  expect(snapCropPosition(crop(3, 400), scene, 12)).toMatchObject({ xPx: 0, yPx: 400 });
});

test("outside the tolerance nothing moves, and the nearest anchor wins inside it", () => {
  expect(snapCropPosition(crop(40, 40), scene, 12)).toMatchObject({ xPx: 40, yPx: 40 });
  // 486 is 6 from the centre (480) and 474 from the left edge: centre wins.
  expect(snapCropPosition(crop(486, 0), scene, 12).xPx).toBe(480);
  // Tolerance 0 still latches an exact hit rather than rejecting it.
  expect(snapCropPosition(crop(0, 0), scene, 0)).toMatchObject({ xPx: 0, yPx: 0 });
});

test("resizing latches the trailing edge, and a region never collapses", () => {
  expect(snapCropSize(crop(0, 0, 1914, 1074), scene, 12)).toMatchObject({ widthPx: 1920, heightPx: 1080 });
  expect(snapCropSize(crop(0, 0, 955, 535), scene, 12)).toMatchObject({ widthPx: 960, heightPx: 540 });
  // Dragged past its own origin, the region keeps a positive size.
  expect(snapCropSize(crop(500, 500, -80, -80), scene, 12)).toMatchObject({ widthPx: 1, heightPx: 1 });
  // A region far from any anchor resizes freely.
  expect(snapCropSize(crop(100, 100, 700, 300), scene, 12)).toMatchObject({ widthPx: 700, heightPx: 300 });
});

test("an output with no region saved shows the whole scene, never a silent crop", () => {
  // The regression this guards: "cover" scaled a 1920×1080 scene to fill a
  // 960×508 window, cutting 16px off the top and bottom before anyone had
  // chosen to crop anything.
  const output = { width: 1920, height: 1080 };
  expect(sceneCrop(output)).toMatchObject({ xPx: 0, yPx: 0, widthPx: 1920, heightPx: 1080, fit: "contain" });
  // contain scales to 508/1080, so the whole scene fits and pillarboxes.
  const whole = cropTransform(sceneCrop(output), { width: 960, height: 508 });
  expect(whole).toMatch(/scale\(0\.47037/);
  expect(whole).toMatch(/translate\(28\.4\d*px, 0px\)/);
  // What it used to do: fill the width and lose 16px off the top and bottom.
  expect(cropTransform({ ...sceneCrop(output), fit: "cover" }, { width: 960, height: 508 }))
    .toBe("translate(0px, -16px) scale(0.5, 0.5)");
  // A saved region is honoured exactly as written, fill included.
  const filled = { ...output, crop: { xPx: 0, yPx: 0, widthPx: 1920, heightPx: 1080, fit: "cover" as const } };
  expect(sceneCrop(filled).fit).toBe("cover");
});
