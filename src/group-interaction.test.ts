import { expect, test } from "vitest";
import { boxSurfaces, cubeSurfaces } from "./features/shape-groups";
import {
  applyGroupGeometry,
  groupBounds,
  resizedGroupGeometry,
  rotatedGroupGeometry,
  translatedGroupGeometry,
} from "./group-interaction";

const output = { width: 1920, height: 1080 };

test("moving a compound folder translates every face and outline together", () => {
  const cube = cubeSurfaces(output, 0);
  cube[0] = { ...cube[0], masks: [[[800, 300], [900, 300], [900, 400]]] };
  const other = boxSurfaces(output, 3);
  const initial = [...cube, ...other];
  const before = groupBounds(cube, 0)!;
  const changes = translatedGroupGeometry(cube, [31, -19], 0);
  const moved = applyGroupGeometry(initial, "Cube", changes);

  expect(groupBounds(moved.slice(0, 3), 0)).toEqual({ ...before, x: before.x + 31, y: before.y - 19 });
  for (let face = 0; face < cube.length; face++) {
    for (let corner = 0; corner < 4; corner++) {
      expect(moved[face].corners[corner]).toEqual([
        cube[face].corners[corner][0] + 31, cube[face].corners[corner][1] - 19,
      ]);
    }
  }
  expect(moved[0].masks[0][0]).toEqual([831, 281]);
  expect(moved.slice(3)).toEqual(other);
  expect(moved[0].corners[2]).toEqual(moved[1].corners[1]);
  expect(moved[0].corners[2]).toEqual(moved[2].corners[0]);
});

test("a locked or missing face prevents a partial group move", () => {
  const cube = cubeSurfaces(output, 0);
  const changes = translatedGroupGeometry(cube, [20, 10], 0);
  const locked = [cube[0], { ...cube[1], locked: true }, cube[2]];
  expect(applyGroupGeometry(locked, "Cube", changes)).toBe(locked);
  expect(applyGroupGeometry(cube, "Cube", changes.slice(1))).toBe(cube);
});

test("resizing a compound scales every face through one shared frame", () => {
  const cube = cubeSurfaces(output, 0);
  const before = groupBounds(cube, 0)!;
  const next = { x: before.x - 40, y: before.y + 20, width: before.width * 1.5, height: before.height * .75 };
  const resized = applyGroupGeometry(cube, "Cube", resizedGroupGeometry(cube, next, 0));

  const resizedBounds = groupBounds(resized, 0);
  expect(resizedBounds).not.toBeNull();
  expect(resizedBounds!.x).toBeCloseTo(next.x);
  expect(resizedBounds!.y).toBeCloseTo(next.y);
  expect(resizedBounds!.width).toBeCloseTo(next.width);
  expect(resizedBounds!.height).toBeCloseTo(next.height);
  // The near vertex belongs to all three faces and must remain one point after scaling.
  expect(resized[0].corners[2]).toEqual(resized[1].corners[1]);
  expect(resized[0].corners[2]).toEqual(resized[2].corners[0]);
});

test("rotating a compound uses one pivot and retains shared edges", () => {
  const cube = cubeSurfaces(output, 0);
  const rotated = applyGroupGeometry(cube, "Cube", rotatedGroupGeometry(cube, 90, 0));
  const before = groupBounds(cube, 0)!;
  const after = groupBounds(rotated, 0)!;

  expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2);
  expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2);
  expect(after.width).toBeCloseTo(before.height);
  expect(after.height).toBeCloseTo(before.width);
  expect(rotated[0].corners[2]).toEqual(rotated[1].corners[1]);
  expect(rotated[0].corners[2]).toEqual(rotated[2].corners[0]);
});
