import { expect, test } from "vitest";
import { beginDraft, endDraft, isDrawingTool, moveDraft } from "../mask/tools";
import { emptyShow, newSurface } from "../document";
import { parseShow, serializeShow } from "../show-file";

test("paint captures a stroke, and a line needs only two points", () => {
  expect(isDrawingTool("paint")).toBe(true);
  let draft = beginDraft("paint", [0, 0])!;
  draft = moveDraft(draft, [10, 10]);
  draft = moveDraft(draft, [20, 30]);
  const step = endDraft(draft, [40, 60]);
  expect(step.kind).toBe("commit");
  // A mask has to enclose an area; a brush mark does not, so two points commit
  // where the shape tools would discard them.
  const short = endDraft(beginDraft("paint", [5, 5])!, [9, 9]);
  expect(short.kind).toBe("commit");
  expect(endDraft(beginDraft("rect", [5, 5])!, [5, 5]).kind).toBe("discard");
  // A single point is not a line and must not reach the renderer.
  const dot = endDraft({ tool: "paint", points: [], cursor: [1, 1] }, [1, 1]);
  expect(dot.kind).toBe("discard");
});

test("painted strokes save, and degenerate ones are dropped on read", () => {
  const show = emptyShow();
  const surface = newSurface(show.output, 0);
  surface.source = { ...surface.source, drawing: { strokes: [
    { points: [[0, 0], [10, 10], [20, 5]], color: "#ff0000", widthPx: 12 },
    // One point is not a line; it must not survive to the renderer.
    { points: [[3, 3]], color: "#00ff00", widthPx: 4 },
  ] } };
  show.scenes[0].surfaces = [surface];
  const saved = parseShow(serializeShow(show)).scenes[0].surfaces[0].source.drawing!;
  expect(saved.strokes).toHaveLength(1);
  expect(saved.strokes[0]).toMatchObject({ color: "#ff0000", widthPx: 12 });
  expect(saved.strokes[0].points).toEqual([[0, 0], [10, 10], [20, 5]]);
});

test('stroke replay saves duration/loop and defaults malformed durations safely', () => {
  const show = emptyShow(); const surface = newSurface(show.output, 0);
  surface.source.drawing = { strokes: [{ points: [[0, 0], [10, 0]], color: '#fff', widthPx: 3 }], replay: { durationS: 8, loop: false } };
  show.scenes[0].surfaces = [surface];
  expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].source.drawing).toEqual(surface.source.drawing);
  surface.source.drawing.replay!.durationS = -2;
  expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].source.drawing?.replay?.durationS).toBe(.1);
});
