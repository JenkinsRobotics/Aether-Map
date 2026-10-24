import { describe, expect, it } from "vitest";
import { initialHistory, pushHistory, redoHistory, restoreHistoryCheckpoint, undoHistory } from "./history";

const t0 = 1_000_000;

it("discards preview edits without putting canceled content back into undo/redo", () => {
  const before = pushHistory(initialHistory("empty"), "saved feature", null, t0);
  const canceled = restoreHistoryCheckpoint(before, before.present);
  expect(redoHistory(undoHistory(canceled)).present).toBe("saved feature");
  expect(canceled.past).toEqual(["empty"]);
  const otherEdits = restoreHistoryCheckpoint(before, "saved feature plus unrelated edit");
  expect(undoHistory(otherEdits).present).toBe("saved feature");
  expect(redoHistory(undoHistory(otherEdits)).present).toBe("saved feature plus unrelated edit");
});

describe("pushHistory", () => {
  it("records a discrete edit as its own step", () => {
    let state = initialHistory("a");
    state = pushHistory(state, "b", null, t0);
    state = pushHistory(state, "c", null, t0 + 5000);
    expect(state.present).toBe("c");
    expect(state.past).toEqual(["a", "b"]);
  });

  it("merges a continuous gesture into one step", () => {
    // A corner drag: many edits, same key, milliseconds apart. One undo should
    // take back the whole drag, not one pixel of it.
    let state = initialHistory("start");
    for (let index = 0; index < 20; index += 1) {
      state = pushHistory(state, `drag-${index}`, "corners:s1", t0 + index * 16);
    }
    expect(state.present).toBe("drag-19");
    expect(state.past).toEqual(["start"]);
    expect(undoHistory(state).present).toBe("start");
  });

  it("does not merge across the coalesce window", () => {
    let state = initialHistory("a");
    state = pushHistory(state, "b", "corners:s1", t0);
    state = pushHistory(state, "c", "corners:s1", t0 + 5000);
    expect(state.past).toEqual(["a", "b"]);
  });

  it("does not merge different gestures", () => {
    let state = initialHistory("a");
    state = pushHistory(state, "b", "corners:s1", t0);
    state = pushHistory(state, "c", "corners:s2", t0 + 20);
    expect(state.past).toEqual(["a", "b"]);
  });

  it("ignores an edit that changes nothing", () => {
    const state = initialHistory("a");
    expect(pushHistory(state, "a", null, t0)).toBe(state);
  });

  it("drops the redo stack once a new edit lands", () => {
    let state = initialHistory("a");
    state = pushHistory(state, "b", null, t0);
    state = undoHistory(state);
    expect(state.future).toEqual(["b"]);
    state = pushHistory(state, "c", null, t0 + 5000);
    expect(state.future).toEqual([]);
  });

  it("bounds the stack so a long session cannot grow without limit", () => {
    let state = initialHistory(0);
    for (let index = 1; index <= 250; index += 1) {
      state = pushHistory(state, index, null, t0 + index * 5000);
    }
    expect(state.past.length).toBeLessThanOrEqual(100);
    expect(state.present).toBe(250);
  });
});

describe("undo and redo", () => {
  it("round-trips", () => {
    let state = initialHistory("a");
    state = pushHistory(state, "b", null, t0);
    state = pushHistory(state, "c", null, t0 + 5000);

    state = undoHistory(state);
    expect(state.present).toBe("b");
    state = undoHistory(state);
    expect(state.present).toBe("a");
    state = redoHistory(state);
    expect(state.present).toBe("b");
    state = redoHistory(state);
    expect(state.present).toBe("c");
  });

  it("stops at the ends rather than throwing", () => {
    const state = initialHistory("only");
    expect(undoHistory(state)).toBe(state);
    expect(redoHistory(state)).toBe(state);
  });

  it("clears the coalesce key so the next edit cannot swallow the undo", () => {
    let state = initialHistory("a");
    state = pushHistory(state, "b", "corners:s1", t0);
    state = undoHistory(state);
    // Same key, immediately after: must still be a new step.
    state = pushHistory(state, "c", "corners:s1", t0 + 10);
    expect(state.past).toEqual(["a"]);
    expect(undoHistory(state).present).toBe("a");
  });
});
