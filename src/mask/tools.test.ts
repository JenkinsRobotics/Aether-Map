import { samplePath } from '@aether/sketch';
import { describe, expect, it } from "vitest";
import {
  CLOSE_TOLERANCE,
  TOOL_SHORTCUTS,
  beginDraft, penPointerDown,
  endDraft,
  finishPen,
  moveDraft,
  previewShape,
  type Draft,
} from "./tools";

describe("drag tools", () => {
  it("keeps Add Shape squares and circles equal on both axes in preview and output", () => {
    for (const tool of ["square", "circle"] as const) {
      const draft = moveDraft(beginDraft(tool, [10, 10])!, [110, 60]);
      const preview = previewShape(draft);
      const step = endDraft(draft, [110, 60]);
      expect(step.kind).toBe("commit");
      if (step.kind !== "commit") continue;
      expect(samplePath({ points: step.shape, curves: step.curves, closed: true })).toEqual(preview);
      for (const points of [preview, step.shape]) {
        const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
        expect(Math.max(...xs) - Math.min(...xs)).toBe(100);
        expect(Math.max(...ys) - Math.min(...ys)).toBe(100);
      }
    }
    // The ribbon's rectangle remains a freely sized rectangle.
    expect(endDraft(beginDraft("rect", [10, 10])!, [110, 60])).toMatchObject({
      kind: "commit", shape: [[10, 10], [110, 10], [110, 60], [10, 60]],
    });
  });

  it("shares Rectangle/Ellipse geometry with the Square/Circle presets when Shift is held", () => {
    for (const [tool, preset] of [["rect", "square"], ["ellipse", "circle"]] as const) {
      const shifted = moveDraft(beginDraft(tool, [10, 10])!, [110, 60], true);
      const fromPicker = moveDraft(beginDraft(preset, [10, 10])!, [110, 60]);
      expect(previewShape(shifted)).toEqual(previewShape(fromPicker));
      expect(endDraft(shifted, [110, 60])).toEqual(endDraft(fromPicker, [110, 60]));
      expect(previewShape(moveDraft(shifted, [110, 60], false))).not.toEqual(previewShape(fromPicker));
      expect(endDraft(shifted, [110, 60], false)).not.toEqual(endDraft(fromPicker, [110, 60]));
    }
  });

  it("rect commits the dragged rectangle on release", () => {
    const draft = beginDraft("rect", [10, 10])!;
    const step = endDraft(draft, [110, 60]);
    expect(step.kind).toBe("commit");
    if (step.kind === "commit") expect(step.shape).toHaveLength(4);
  });

  it("ellipse and polygon commit closed shapes", () => {
    for (const tool of ["ellipse", "polygon"] as const) {
      const step = endDraft(beginDraft(tool, [100, 100])!, [200, 160]);
      expect(step.kind).toBe("commit");
      if (step.kind === "commit") expect(step.shape.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("discards a click that never became a drag", () => {
    // A tap with a drag tool is a slip, not a zero-area mask.
    expect(endDraft(beginDraft("rect", [50, 50])!, [51, 50]).kind).toBe("discard");
    expect(endDraft(beginDraft("ellipse", [50, 50])!, [50, 50]).kind).toBe("discard");
  });

  it("previews the shape under the cursor before release", () => {
    const draft = moveDraft(beginDraft("rect", [0, 0])!, [40, 20]);
    expect(previewShape(draft)).toEqual([
      [0, 0],
      [40, 0],
      [40, 20],
      [0, 20],
    ]);
  });
});

describe("pen", () => {
  it("adds a vertex per click and closes when the click returns to the start", () => {
    let draft: Draft = beginDraft("pen", [0, 0])!;
    for (const p of [
      [100, 0],
      [100, 100],
      [0, 100],
    ] as const) {
      const step = endDraft(draft, [p[0], p[1]]);
      expect(step.kind).toBe("continue");
      if (step.kind === "continue") draft = step.draft;
    }
    expect(draft.points).toHaveLength(4);
    const close = endDraft(draft, [CLOSE_TOLERANCE - 2, 3]);
    expect(close.kind).toBe("commit");
    if (close.kind === "commit") expect(close.shape).toHaveLength(4);
  });

  it("can be finished explicitly without returning to the start", () => {
    let draft: Draft = beginDraft("pen", [0, 0])!;
    for (const p of [
      [100, 0],
      [50, 80],
    ] as const) {
      const step = endDraft(draft, [p[0], p[1]]);
      if (step.kind === "continue") draft = step.draft;
    }
    expect(finishPen(draft).kind).toBe("commit");
  });

  it("will not close two points into nothing", () => {
    const draft = beginDraft("pen", [0, 0])!;
    const step = endDraft(draft, [1, 1]);
    // Near the start, but there is no shape yet: that is a second vertex.
    expect(step.kind).toBe("continue");
    expect(finishPen(draft).kind).toBe("discard");
  });
});

describe("freehand", () => {
  it("records the stroke and commits a simplified closed shape", () => {
    let draft = beginDraft("freehand", [0, 0])!;
    for (let x = 2; x <= 100; x += 2) draft = moveDraft(draft, [x, 0]);
    for (let y = 2; y <= 100; y += 2) draft = moveDraft(draft, [100, y]);
    for (let x = 98; x >= 0; x -= 2) draft = moveDraft(draft, [x, 100]);
    expect(draft.points.length).toBeGreaterThan(100);
    const step = endDraft(draft, [0, 2]);
    expect(step.kind).toBe("commit");
    if (step.kind === "commit") expect(step.shape.length).toBeLessThan(10);
  });
});

describe("selection tools", () => {
  it("do not start a draft", () => {
    expect(beginDraft("select", [0, 0])).toBeNull();
  });

  it("have single-key shortcuts that do not collide", () => {
    const keys = Object.keys(TOOL_SHORTCUTS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(Object.values(TOOL_SHORTCUTS)).size).toBe(keys.length);
  });
});

it('pen click-drag authors retained mirrored tangents and closing preserves the first tangent', () => {
  let draft = penPointerDown(null, [0, 0]);
  let step = endDraft(moveDraft(draft, [50, 0]), [50, 0]);
  expect(step.kind).toBe('continue'); if (step.kind !== 'continue') return;
  draft = penPointerDown(step.draft, [100, 100]);
  step = endDraft(moveDraft(draft, [150, 100]), [150, 100]);
  if (step.kind !== 'continue') throw new Error('expected next point');
  draft = penPointerDown(step.draft, [0, 100]);
  step = endDraft(draft, [0, 100]); if (step.kind !== 'continue') throw new Error('expected next point');
  draft = penPointerDown(step.draft, [0, 0]); step = endDraft(draft, [0, 0]);
  expect(step.kind).toBe('commit'); if (step.kind !== 'commit') return;
  expect(step.shape).toEqual([[0, 0], [100, 100], [0, 100]]);
  expect(step.curves?.[0]).toEqual({ c1: [50, 0], c2: [50, 100] });
  expect(step.curves?.[2]?.c2).toEqual([-50, 0]);
});

it('retains four cubic ellipse edges and smooth nodes instead of baking samples', () => {
  const step = endDraft(beginDraft('ellipse', [100, 100])!, [500, 300]);
  expect(step).toMatchObject({ kind: 'commit', closed: true, nodeModes: ['smooth', 'smooth', 'smooth', 'smooth'] });
  if (step.kind !== 'commit') throw Error('commit');
  expect(step.shape).toHaveLength(4); expect(step.curves?.filter(Boolean)).toHaveLength(4);
});
