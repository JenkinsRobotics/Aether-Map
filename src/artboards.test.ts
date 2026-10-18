import { describe, expect, it } from "vitest";
import { ARTBOARD_GAP, artboardAt, artboardBounds, artboardLayout, artboardOrigin } from "./artboards";
import { emptyShow, newScene, type MapShow, type Scene } from "./document";

function showWith(...scenes: Scene[]): MapShow {
  return { ...emptyShow(), scenes, activeSceneId: scenes[0].id };
}

const hd = { widthPx: 1920, heightPx: 1080 };
const square = { widthPx: 1080, heightPx: 1080 };

describe("artboardLayout", () => {
  it("lays scenes out in a row, in scene order, top-aligned", () => {
    const layout = artboardLayout(showWith(newScene("A", hd), newScene("B", square)));
    expect(layout.map((board) => [board.scene.name, board.x, board.y])).toEqual([
      ["A", 0, 0],
      ["B", 1920 + ARTBOARD_GAP, 0],
    ]);
  });

  it("uses each scene's own artboard size", () => {
    const layout = artboardLayout(showWith(newScene("A", hd), newScene("B", square)));
    expect(layout.map((board) => [board.width, board.height])).toEqual([
      [1920, 1080],
      [1080, 1080],
    ]);
  });

  it("omits a hidden scene and leaves no gap where it was", () => {
    const a = newScene("A", hd);
    const b = { ...newScene("B", hd), hidden: true };
    const c = newScene("C", hd);
    const layout = artboardLayout(showWith(a, b, c));
    expect(layout.map((board) => board.scene.name)).toEqual(["A", "C"]);
    expect(layout[1].x).toBe(1920 + ARTBOARD_GAP);
  });

  it("keeps a suppressed scene on the canvas — it is still being authored", () => {
    const layout = artboardLayout(showWith(newScene("A", hd), { ...newScene("B", hd), suppressed: true }));
    expect(layout.map((board) => board.scene.name)).toEqual(["A", "B"]);
  });

  it("hides a scene that is both hidden and suppressed", () => {
    const layout = artboardLayout(showWith(newScene("A", hd), { ...newScene("B", hd), hidden: true, suppressed: true }));
    expect(layout.map((board) => board.scene.name)).toEqual(["A"]);
  });
});

describe("artboardBounds", () => {
  it("spans every artboard including the gaps between them", () => {
    const layout = artboardLayout(showWith(newScene("A", hd), newScene("B", square)));
    expect(artboardBounds(layout)).toEqual({ width: 1920 + ARTBOARD_GAP + 1080, height: 1080 });
  });

  it("is the tallest artboard's height, not the last one's", () => {
    const tall = { widthPx: 1080, heightPx: 1920 };
    const layout = artboardLayout(showWith(newScene("A", tall), newScene("B", hd)));
    expect(artboardBounds(layout).height).toBe(1920);
  });

  it("is a single output raster when every scene is hidden, so the view still fits something", () => {
    const layout = artboardLayout(showWith({ ...newScene("A", hd), hidden: true }));
    expect(artboardBounds(layout)).toEqual({ width: 1920, height: 1080 });
  });
});

describe("artboardAt", () => {
  const layout = artboardLayout(showWith(newScene("A", hd), newScene("B", square)));

  it("finds the artboard under a canvas-space point", () => {
    expect(artboardAt(layout, [10, 10])?.scene.name).toBe("A");
    expect(artboardAt(layout, [1920 + ARTBOARD_GAP + 10, 10])?.scene.name).toBe("B");
  });

  it("returns nothing in the gutter between artboards", () => {
    expect(artboardAt(layout, [1920 + ARTBOARD_GAP / 2, 10])).toBeUndefined();
  });

  it("returns nothing below a shorter artboard", () => {
    // B is 1080 tall where the row is 1080, so probe past the bottom of both.
    expect(artboardAt(layout, [10, 1081])).toBeUndefined();
  });

  it("treats the top-left corner as inside and the bottom-right as outside", () => {
    expect(artboardAt(layout, [0, 0])?.scene.name).toBe("A");
    expect(artboardAt(layout, [1920, 1080])).toBeUndefined();
  });
});

describe("artboardOrigin", () => {
  it("gives the canvas offset a scene's own pixel space sits at", () => {
    const layout = artboardLayout(showWith(newScene("A", hd), newScene("B", square)));
    expect(artboardOrigin(layout, layout[1].scene.id)).toEqual([1920 + ARTBOARD_GAP, 0]);
  });

  it("is the origin for a scene that is not laid out, so pointer math stays finite", () => {
    const hidden = { ...newScene("A", hd), hidden: true };
    expect(artboardOrigin(artboardLayout(showWith(hidden)), hidden.id)).toEqual([0, 0]);
  });
});
