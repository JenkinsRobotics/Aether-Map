import { expect, test } from "vitest";
import { duplicateSurface, moveSurface, surfacesAt, translateSurface } from "./surface-interaction";
import { newFeature } from "./features/new-feature";
import { animateSurface } from "./features/animation";
import { beginHistoryGesture, endHistoryGesture, initialHistory, pushHistory, undoHistory, redoHistory } from "./history";

const surface = () => newFeature("surface", { width: 1920, height: 1080 }, 0);
test("translation carries masks and animated geometry together without changing source or keys", () => {
  const s = surface(); s.masks = [[[0, 0], [100, 0], [0, 100]]];
  s.transform = { xPx: 35, yPx: 22, rotationDeg: 67, scaleX: 1.5, scaleY: 0.7 };
  const before = animateSurface(s, 0);
  const moved = { ...s, ...translateSurface(s, [50, -25]) };
  const after = animateSurface(moved, 0);
  for (let i = 0; i < 4; i++) { expect(after.corners[i][0] - before.corners[i][0]).toBeCloseTo(50); expect(after.corners[i][1] - before.corners[i][1]).toBeCloseTo(-25); }
  expect(moved.masks[0][0]).toEqual([50, -25]);
  expect(moved.source).toBe(s.source); expect(s.masks[0][0]).toEqual([0, 0]);
});
test("picking follows shape clipping, layer order, visibility and locks", () => {
  const a = surface(), b = surface(); a.corners = b.corners = [[0, 0], [100, 0], [100, 100], [0, 100]];
  b.masks = [[[0, 0], [50, 0], [50, 50], [0, 50]]];
  expect(surfacesAt([a, b], [20, 20], 0).map((s) => s.id)).toEqual([b.id, a.id]);
  expect(surfacesAt([a, b], [80, 80], 0).map((s) => s.id)).toEqual([a.id]);
  b.locked = true; expect(surfacesAt([a, b], [20, 20], 0).map((s) => s.id)).toEqual([a.id]);
  a.enabled = false; expect(surfacesAt([a, b], [20, 20], 0)).toEqual([]);
});
test("layer reorder maps visual before/after to paint order and protects locks", () => {
  const a = surface(), b = surface(), c = surface();
  expect(moveSurface([a, b, c], a.id, c.id, "before")).toEqual([b, c, a]);
  expect(moveSurface([a, b, c], c.id, a.id, "after")).toEqual([c, a, b]);
  a.locked = true; expect(moveSurface([a, b], a.id, b.id, "before")).toEqual([a, b]);
});
test("duplicate has independent geometry and child identities", () => {
  const s = surface(); s.animation = { opacity: [{ id: "key", timeS: 0, value: 1, interpolation: "linear" }] };
  const copy = duplicateSurface(s); expect(copy.id).not.toBe(s.id); expect(copy.animation?.opacity?.[0].id).not.toBe("key");
  expect(copy.corners[0][0]).toBe(s.corners[0][0] + 20);
});
test("each explicit drag is one undo step even with pauses; cancel restores redo", () => {
  const base = initialHistory("before");
  let state = beginHistoryGesture(base);
  state = pushHistory(state, "moving", "move", 0);
  state = pushHistory(state, "after", "move", 10000);
  state = endHistoryGesture(state);
  state = endHistoryGesture(pushHistory(beginHistoryGesture(state), "second", "move", 10001));
  expect(undoHistory(state).present).toBe("after");
  const undone = undoHistory(undoHistory(state)); expect(undone.present).toBe("before");
  expect(redoHistory(undone).present).toBe("after");
  expect(endHistoryGesture(pushHistory(beginHistoryGesture(undone), "canceled", null, 12000), true)).toBe(undone);
  expect(endHistoryGesture(beginHistoryGesture(base)).past).toEqual([]);
});
