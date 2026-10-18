// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { evaluateSurface } from './playback';
import { editSurfaceAutomation } from './features/surface-automation';
import { SurfaceCanvas } from "./SurfaceCanvas";
import { cssMatrix3d, solveHomography } from "./homography";
import { emptyShow, quadCorners, type MapShow, type Point, type Quad } from "./document";
import type { OutputCrop } from "./features/types";
import { backgroundLayerID } from "./background-layer";
import type { MaskTool } from "./mask/tools";
import { installPointerEvents } from "./test-pointer";
import { cubeSurfaces } from "./features/shape-groups";
import { folderID, moveSurfaceToScene } from "./scene-tree";

const CORNERS: Quad = [
  [120, 80],
  [900, 64],
  [912, 700],
  [110, 684],
];

function showWithSurface(overrides = {}): MapShow {
  const base = emptyShow();
  return {
    ...base,
    scenes: [
      {
        ...base.scenes[0],
            surfaces: [
          {
            id: "s1",
            name: "Front door",
            enabled: true,
            corners: CORNERS,
            source: { mediaId: null, rect: [0, 0, 1920, 1080] },
            masks: [],
            opacity: 1,
            color: "#4c9dff",
            cues: [],
            clips: [],
            ...overrides,
          },
        ],
      },
    ],
  };
}

function renderCanvas(
  show: MapShow,
  options: { previewMode?: "mapping" | "visualization"; resolved?: MapShow; mediaUrls?: Record<string, string>; tool?: MaskTool; onDrawShape?: (shape: Point[]) => void;
    onMaskShape?: (id: string, shape: number, points: Point[]) => void; onDelete?: (id: string) => void;
    onCorners?: (id: string, corners: Quad) => void;
    selectedID?: string | null; onCrop?: (crop: OutputCrop) => void;
    outputID?: string | null;
    onSelectScene?: (sceneID: string) => void;
    onMoveToScene?: (id: string, sceneID: string | null, offset: Point) => void } = {},
) {
  // jsdom has no layout, so ResizeObserver never fires and the view stays at
  // identity — which is what we want: pointer coordinates are output pixels.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  installPointerEvents();
  return render(
    <SurfaceCanvas
      show={show}
      resolved={options.resolved ?? show}
      previewMode={options.previewMode}
      mediaUrls={options.mediaUrls ?? {}}
      selectedID={options.selectedID === undefined ? "s1" : options.selectedID}
      outputID={options.outputID}
      onCrop={options.onCrop}
      onSelect={() => {}}
      onSelectScene={options.onSelectScene ?? (() => {})}
      onMoveToScene={options.onMoveToScene}
      onGeometry={() => {}}
      onGroupGeometry={() => {}}
      onCorners={options.onCorners ?? (() => {})}
      onMaskShape={options.onMaskShape ?? (() => {})}
      onDelete={options.onDelete}
      onDrawShape={options.onDrawShape ?? (() => {})}
      tool={options.tool ?? "select"}
      timeS={0}
      playing={false}
    />,
  );
}

describe("SurfaceCanvas", () => {
  it("fades only the selected surface's mapping content and keeps transparent nodes editable", () => {
    const show = showWithSurface({ mappingOpacity: 0, opacity: .8 });
    show.scenes[0].surfaces.push({ ...show.scenes[0].surfaces[0], id: 's2', mappingOpacity: .6 });
    const onCorners = vi.fn();
    const mapping = renderCanvas(show, { previewMode: 'mapping', tool: 'node', onCorners });
    const layers = mapping.container.querySelectorAll<HTMLElement>('.map-surface');
    expect(Array.from(layers, layer => layer.style.opacity)).toEqual(['0', '0.6']);
    const handle = mapping.container.querySelector('.map-handle')!;
    expect(handle.closest('.map-surface')).toBeNull();
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 120, clientY: 80 });
    fireEvent.pointerMove(mapping.container.querySelector('.map-canvas-host')!,
      { pointerId: 1, clientX: 140, clientY: 100, altKey: true });
    expect(onCorners.mock.lastCall?.[1][0]).toEqual([140, 100]);
    mapping.unmount();
    const visualization = renderCanvas(show, { previewMode: 'visualization' });
    expect(Array.from(visualization.container.querySelectorAll<HTMLElement>('.map-surface'),
      layer => layer.style.opacity)).toEqual(['0.8', '0.8']);
    visualization.unmount();
  });

  it("snaps a dragged corner to a neighbour vertex and Alt bypasses it", () => {
    const show = showWithSurface();
    show.scenes[0].surfaces.push({ ...show.scenes[0].surfaces[0], id: 's2', corners: [[200, 150], [300, 150], [300, 250], [200, 250]] });
    const onCorners = vi.fn();
    const { container } = renderCanvas(show, { tool: 'node', onCorners });
    const host = container.querySelector('.map-canvas-host')!, handle = container.querySelector('.map-handle')!;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 120, clientY: 80 });
    fireEvent.pointerMove(host, { pointerId: 1, clientX: 198, clientY: 149 });
    expect(onCorners.mock.lastCall?.[1][0]).toEqual([200, 150]);
    fireEvent.pointerMove(host, { pointerId: 1, clientX: 198, clientY: 149, altKey: true });
    expect(onCorners.mock.lastCall?.[1][0]).toEqual([198, 149]);
    fireEvent.pointerUp(host, { pointerId: 1 });
  });
  it("keeps editing alive when backdrop nodes temporarily collapse", () => {
    const show = emptyShow();
    show.media = [{ id: "photo", name: "Wall", file: "wall.png", width: 100, height: 100, kind: "image", bytes: 1 }];
    show.scenes[0].setupBackground = { mediaId: "photo", visible: true, opacity: .6,
      corners: [[0, 0], [0, 0], [0, 0], [0, 0]] };
    const { container } = renderCanvas(show, { mediaUrls: { photo: "/wall.png" } });
    expect(container.querySelector(".map-canvas-host")).not.toBeNull();
    expect(container.querySelector(".map-setup-background")).toBeNull();
  });

  it("applies the homography for the surface's corners as a CSS transform", () => {
    const { container } = renderCanvas(showWithSurface());
    const layer = container.querySelector<HTMLElement>(".map-surface-grid");

    const expected = cssMatrix3d(solveHomography(quadCorners([0, 0, 1920, 1080]), CORNERS));
    expect(layer?.style.transform).toBe(expected);
    // Without this the browser rotates about the element's centre and the
    // corners land nowhere near where they were dragged.
    expect(layer?.style.transformOrigin).toBe("0 0");
  });

  it("clips each surface to its own quad", () => {
    const { container } = renderCanvas(showWithSurface());
    const clip = container.querySelector<HTMLElement>(".map-surface")?.style.clipPath;
    expect(clip).toContain("120px 80px");
    expect(clip).toContain("110px 684px");
  });

  it("draws drag handles only for the selected surface", () => {
    const { container } = renderCanvas(showWithSurface());
    expect(container.querySelectorAll(".map-resize-handle")).toHaveLength(8);
  });

  it("gives a selected compound one full transform frame, then drills into face controls", () => {
    const show = emptyShow();
    show.scenes[0].surfaces = cubeSurfaces(show.output, 0);
    const groupID = folderID(show.scenes[0].id, "Cube");
    const { container, rerender } = renderCanvas(show, { selectedID: groupID });
    expect(container.querySelectorAll(".map-outline.is-selected")).toHaveLength(3);
    expect(container.querySelector(".map-group-bounds")?.getAttribute("data-group-id")).toBe(groupID);
    expect(container.querySelectorAll(".map-resize-handle")).toHaveLength(8);
    expect(container.querySelectorAll(".map-rotate-handle")).toHaveLength(1);
    // A face selected from the tree gets its own controls, not the group box.
    rerender(<SurfaceCanvas show={show} resolved={show} mediaUrls={{}}
      selectedID={show.scenes[0].surfaces[0].id} onSelect={() => {}} onSelectScene={() => {}}
      onGeometry={() => {}} onGroupGeometry={() => {}} onCorners={() => {}}
      onMaskShape={() => {}} onDrawShape={() => {}} tool="select" timeS={0} playing={false} />);
    expect(container.querySelectorAll(".map-outline.is-selected")).toHaveLength(1);
    expect(container.querySelector(".map-group-bounds")).toBeNull();
    expect(container.querySelectorAll(".map-resize-handle")).toHaveLength(8);
  });

  it("renders nothing for a disabled surface", () => {
    const { container } = renderCanvas(showWithSurface({ enabled: false }));
    expect(container.querySelector(".map-surface")).toBeNull();
    expect(container.querySelector(".map-outline")).toBeNull();
  });

  it("skips the frame rather than emitting NaN when a quad collapses", () => {
    const collapsed: Quad = [
      [100, 100],
      [100, 100],
      [100, 100],
      [100, 100],
    ];
    const { container } = renderCanvas(showWithSurface({ corners: collapsed }));
    expect(container.querySelector(".map-surface")).toBeNull();
    expect(container.innerHTML).not.toContain("NaN");
  });

  it("draws mask handles and a mask outline when a surface is masked", () => {
    const masked = showWithSurface({
      masks: [
        [
          [200, 150],
          [800, 150],
          [800, 600],
          [200, 600],
        ],
      ],
    });
    const { container } = renderCanvas(masked, { tool: "node" });
    expect(container.querySelectorAll(".map-handle")).toHaveLength(4);
    expect(container.querySelectorAll(".map-mask-handle")).toHaveLength(4);
    expect(container.querySelector(".map-mask-outline")).not.toBeNull();
  });

  it("clips to the mask rather than the quad once a mask exists", () => {
    const masked = showWithSurface({
      masks: [
        [
          [200, 150],
          [800, 150],
          [800, 600],
          [200, 600],
        ],
      ],
    });
    const { container } = renderCanvas(masked, { tool: "node" });
    const clip = container.querySelector<HTMLElement>(".map-surface")?.style.clipPath;
    expect(clip).toContain("200px 150px");
    expect(clip).not.toContain("120px 80px");
  });

  it("positions the artboards with an explicit translate and scale", () => {
    // Not flex centring: a scaled child still occupies its full unscaled box,
    // which is what left the raster offset and clipped. The transform sits on
    // the artboards wrapper so each artboard inside keeps its scene's own
    // untransformed pixel space.
    const { container } = renderCanvas(showWithSurface());
    const artboards = container.querySelector<HTMLElement>(".map-artboards");
    expect(artboards?.style.transform).toMatch(/^translate\(.+\) scale\(.+\)$/);
    expect(artboards?.style.transformOrigin === "" || artboards?.style.transformOrigin).toBeTruthy();
    // The one artboard is laid out at the canvas origin and carries no
    // transform of its own.
    const raster = container.querySelector<HTMLElement>(".map-raster");
    expect(raster?.style.transform).toBe("");
    expect([raster?.style.left, raster?.style.top]).toEqual(["0px", "0px"]);
  });

  it("offers fit and true-size controls with the current zoom", () => {
    const { container } = renderCanvas(showWithSurface());
    const labels = Array.from(container.querySelectorAll(".map-zoom button")).map(
      (button) => button.textContent,
    );
    expect(labels).toEqual(["Snap", "X-ray", "Fit", "100%"]);
    expect(container.querySelector(".map-zoom-value")?.textContent).toMatch(/%$/);
  });

  it("keeps the canvas focusable so the keyboard shortcuts can reach it", () => {
    const { container } = renderCanvas(showWithSurface());
    expect(container.querySelector(".map-canvas-host")?.getAttribute("tabindex")).toBe("0");
  });

  it("hands a dragged rectangle over as a finished profile", () => {
    const added: Point[][] = [];
    const { container } = renderCanvas(showWithSurface(), {
      tool: "rect",
      onDrawShape: (shape) => added.push(shape),
    });
    const host = container.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(host, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(host, { clientX: 300, clientY: 220, pointerId: 1 });
    // The preview follows the pointer before release.
    expect(container.querySelector(".map-draft polygon")).not.toBeNull();
    fireEvent.pointerUp(host, { clientX: 300, clientY: 220, pointerId: 1 });
    expect(added).toHaveLength(1);
    expect(added[0]).toEqual([
      [100, 100],
      [300, 100],
      [300, 220],
      [100, 220],
    ]);
    expect(container.querySelector(".map-draft")).toBeNull();
  });

  it("ignores a drawing gesture that never became a shape", () => {
    const added: Point[][] = [];
    const { container } = renderCanvas(showWithSurface(), {
      tool: "ellipse",
      onDrawShape: (shape) => added.push(shape),
    });
    const host = container.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(host, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(host, { clientX: 51, clientY: 50, pointerId: 1 });
    expect(added).toHaveLength(0);
  });

  it("takes the overlay out of the pointer's way while a drawing tool is active", () => {
    const { container } = renderCanvas(showWithSurface(), { tool: "pen" });
    expect(container.querySelector(".map-canvas-host")?.classList.contains("is-drawing")).toBe(true);
  });

  it("unions several mask shapes through an SVG clipPath", () => {
    const two = showWithSurface({
      masks: [
        [
          [10, 10],
          [100, 10],
          [100, 100],
        ],
        [
          [500, 500],
          [600, 500],
          [600, 600],
        ],
      ],
    });
    const { container } = renderCanvas(two, { tool: "node" });
    const clip = container.querySelector<HTMLElement>(".map-surface")?.style.clipPath;
    expect(clip).toMatch(/^url\(/);
    expect(container.querySelectorAll("clipPath polygon")).toHaveLength(2);
    // Every editable outline gets its own handles.
    expect(container.querySelectorAll(".map-mask-handle")).toHaveLength(6);
  });

  it("draws a solid colour when a surface is filled rather than textured", () => {
    const filled = showWithSurface({
      source: { mediaId: null, rect: [0, 0, 400, 300], fill: "#ff0000" },
    });
    const { container } = renderCanvas(filled);
    const fill = container.querySelector<HTMLElement>(".map-fill");
    expect(fill).not.toBeNull();
    expect(fill?.style.background).toMatch(/rgb\(255, 0, 0\)|#ff0000/);
    expect(container.querySelector(".map-surface-grid")).toBeNull();
  });

  it("keeps dense handles out of Select mode", () => {
    const ellipse = Array.from({ length: 48 }, (_, i) => [
      Math.round(500 + 200 * Math.cos((i / 48) * Math.PI * 2)),
      Math.round(400 + 100 * Math.sin((i / 48) * Math.PI * 2)),
    ]) as Point[];
    const { container } = renderCanvas(showWithSurface({ masks: [ellipse] }));
    expect(container.querySelectorAll(".map-mask-outline")).toHaveLength(1);
    expect(container.querySelectorAll(".map-mask-handle")).toHaveLength(0);
    // Whole-layer resize remains available without dense point handles.
    expect(container.querySelectorAll(".map-resize-handle")).toHaveLength(8);
  });
});

describe("scene bounds and the output region", () => {
  const backdropShow = () => {
    const show = emptyShow();
    show.media = [{ id: "photo", name: "Wall", file: "wall.png", width: 4000, height: 3000, kind: "image", bytes: 1 }];
    show.scenes[0].setupBackground = { mediaId: "photo", visible: true, opacity: .6,
      corners: quadCorners([-600, -400, 4000, 3000]) };
    return show;
  };

  it("clips the setup photo to the scene unless the backdrop is selected", () => {
    // The photo is far larger than the scene: deselected it must not spill past
    // the raster, selected it must, so the whole frame can be aligned.
    const show = backdropShow();
    const deselected = renderCanvas(show, { mediaUrls: { photo: "/wall.png" }, selectedID: null });
    expect(deselected.container.querySelector(".map-scene-clip")).not.toBeNull();
    expect(deselected.container.querySelector(".map-scene-clip[data-unclipped]")).toBeNull();
    expect(deselected.container.querySelector(".map-outline")).toBeNull();
    expect(deselected.container.querySelector(".map-transform-box")).toBeNull();
    const selected = renderCanvas(show, { mediaUrls: { photo: "/wall.png" },
      selectedID: backgroundLayerID(show.scenes[0].id) });
    expect(selected.container.querySelector(".map-scene-clip[data-unclipped]")).not.toBeNull();
    expect(selected.container.querySelector(".map-outline.is-selected")).not.toBeNull();
    expect(selected.container.querySelector(".map-transform-box")).not.toBeNull();
  });

  it("clips every other layer the same way, exempting only the selected one", () => {
    const selected = renderCanvas(showWithSurface(), { selectedID: "s1" });
    expect(selected.container.querySelector(".map-surface[data-unclipped]")).not.toBeNull();
    const deselected = renderCanvas(showWithSurface(), { selectedID: null });
    expect(deselected.container.querySelector(".map-surface")).not.toBeNull();
    expect(deselected.container.querySelector(".map-surface[data-unclipped]")).toBeNull();
  });

  it("draws the assigned output region before its output window is open", () => {
    const outsideOutputEditing = renderCanvas(showWithSurface());
    expect(outsideOutputEditing.container.querySelector(".map-crop-overlay")).toBeNull();
    const assigned = renderCanvas(showWithSurface(), { onCrop: () => {} });
    expect(assigned.container.querySelector(".map-crop-overlay")).not.toBeNull();
    // With no crop saved the region is the whole scene, so nothing is dimmed away.
    expect(assigned.container.querySelector("[aria-label='Move output region']")).not.toBeNull();
    expect(assigned.container.querySelectorAll("[aria-label^='Resize output region']").length).toBe(4);
  });

  it("keeps an output region anchored to its assigned scene when another scene is active", () => {
    const show = showWithSurface();
    const firstScene = show.scenes[0];
    const secondScene = { ...structuredClone(firstScene), id: "scene-2", name: "Scene 2", surfaces: [] };
    show.scenes = [firstScene, secondScene];
    show.activeSceneId = secondScene.id;
    show.outputs[0] = { ...show.outputs[0], sceneId: firstScene.id,
      crop: { xPx: 10, yPx: 20, widthPx: 800, heightPx: 450, fit: "contain" } };

    const otherActive = renderCanvas(show, {
      outputID: show.outputs[0].id,
      onCrop: () => {},
    });
    const anchored = otherActive.container.querySelector(".map-crop-overlay");
    expect(anchored).not.toBeNull();
    expect(anchored?.closest(".map-artboard")?.getAttribute("data-scene-id")).toBe(firstScene.id);
    expect(anchored?.closest(".map-artboard")?.classList.contains("is-active")).toBe(false);
    expect(anchored?.querySelector("[role='button']")).toBeNull();

    otherActive.unmount();
    show.activeSceneId = firstScene.id;
    const assignedScene = renderCanvas(show, {
      outputID: show.outputs[0].id,
      onCrop: () => {},
    });
    const editable = assignedScene.container.querySelector(".map-crop-overlay");
    expect(editable?.closest(".map-artboard")?.getAttribute("data-scene-id")).toBe(firstScene.id);
    expect(editable?.closest(".map-artboard")?.classList.contains("is-active")).toBe(true);
    expect(editable?.querySelector("[role='button']")).not.toBeNull();
  });

  it("latches a dragged region to the scene centre and reports it in scene pixels", () => {
    const show = showWithSurface();
    // The region belongs to the output, not to the show's raster settings.
    show.outputs[0].crop = { xPx: 0, yPx: 0, widthPx: 960, heightPx: 540, fit: "contain" };
    const crops: OutputCrop[] = [];
    const { container } = renderCanvas(show, { onCrop: (crop) => crops.push(crop) });
    const grab = container.querySelector("[aria-label='Move output region']")!;
    fireEvent.pointerDown(grab, { pointerId: 1, clientX: 0, clientY: 0 });
    // Scale is identity in jsdom, so these deltas are scene pixels: just shy of
    // centring the region, which the latch completes.
    fireEvent.pointerMove(container.querySelector(".map-crop-overlay")!, { pointerId: 1, clientX: 476, clientY: 266 });
    expect(crops.at(-1)).toMatchObject({ xPx: 480, yPx: 270 });
    // Alt bypasses the latch, as it does everywhere else on this canvas.
    fireEvent.pointerMove(container.querySelector(".map-crop-overlay")!, { pointerId: 1, clientX: 476, clientY: 266, altKey: true });
    expect(crops.at(-1)).toMatchObject({ xPx: 476, yPx: 266 });
  });
});

/**
 * Every scene is on the canvas, side by side. Only the artboard being edited is
 * interactive — a press on any other focuses it instead — which is what lets
 * every hit test, overlay and tool below still deal with exactly one scene.
 */
describe("SurfaceCanvas artboards", () => {
  function showWithScenes(...scenes: Partial<MapShow["scenes"][number]>[]): MapShow {
    const base = showWithSurface();
    return {
      ...base,
      scenes: scenes.map((scene, index) => ({
        ...base.scenes[0], id: `sc${index + 1}`, name: `Scene ${index + 1}`, ...scene,
      })),
      activeSceneId: "sc1",
    };
  }

  it("draws an artboard for every scene, not just the selected one", () => {
    const { container } = renderCanvas(showWithScenes({}, {}, {}));
    expect(container.querySelectorAll(".map-artboard")).toHaveLength(3);
    expect(container.querySelectorAll(".map-artboard.is-active")).toHaveLength(1);
  });

  it("keeps moved surfaces off the old artboard even when a program crossfade targets the new scene", () => {
    const source = showWithScenes({}, { surfaces: [] });
    source.mix = { sceneId: "sc2", blend: .6 };
    const moved = moveSurfaceToScene(source, "s1", "sc2");
    const { container } = renderCanvas(moved);
    const boards = container.querySelectorAll(".map-artboard");
    expect(boards).toHaveLength(2);
    expect(container.querySelectorAll(".map-artboard.is-active .map-surface")).toHaveLength(0);
    expect(container.querySelectorAll(".map-artboard:not(.is-active) .map-surface")).toHaveLength(1);
  });

  it("lays them out in a row, so the second starts past the first", () => {
    const { container } = renderCanvas(showWithScenes({}, {}));
    const lefts = Array.from(container.querySelectorAll<HTMLElement>(".map-artboard"))
      .map((board) => parseFloat(board.style.left));
    expect(new Set(lefts).size).toBe(2);
    expect(Math.max(...lefts)).toBeGreaterThanOrEqual(1920);
  });

  it("names each artboard, and marks the one being edited", () => {
    const { container } = renderCanvas(showWithScenes({}, {}));
    const names = Array.from(container.querySelectorAll(".map-artboard-name"));
    expect(names.map((name) => name.textContent)).toEqual(["Scene 1", "Scene 2"]);
    expect(names.map((name) => name.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  });

  it("leaves a hidden scene off the canvas entirely", () => {
    const { container } = renderCanvas(showWithScenes({}, { hidden: true }, {}));
    expect(container.querySelectorAll(".map-artboard")).toHaveLength(2);
    expect(Array.from(container.querySelectorAll(".map-artboard-name"))
      .map((name) => name.textContent)).toEqual(["Scene 1", "Scene 3"]);
  });

  it("keeps a suppressed scene on the canvas, marked as out of the show", () => {
    const { container } = renderCanvas(showWithScenes({}, { suppressed: true }));
    expect(container.querySelectorAll(".map-artboard")).toHaveLength(2);
    expect(container.querySelectorAll(".map-artboard[data-suppressed]")).toHaveLength(1);
  });

  it("empties the canvas when the scene being edited is hidden — hiding is absolute", () => {
    const { container } = renderCanvas(showWithScenes({ hidden: true }, {}));
    expect(container.querySelector(".map-artboard.is-active")).toBeNull();
    // The other scene is still there to click back to.
    expect(container.querySelectorAll(".map-artboard")).toHaveLength(1);
  });

  it("focuses another artboard on press instead of editing through it", () => {
    const onSelectScene = vi.fn();
    const { container } = renderCanvas(showWithScenes({}, {}), { onSelectScene });
    const host = container.querySelector(".map-canvas-host")!;
    // Into the second artboard: past the first raster and the gutter.
    fireEvent.pointerDown(host, { button: 0, clientX: 2100, clientY: 100, pointerId: 1 });
    expect(onSelectScene).toHaveBeenCalledWith("sc2");
  });

  it("does not re-select the artboard already being edited", () => {
    const onSelectScene = vi.fn();
    const { container } = renderCanvas(showWithScenes({}, {}), { onSelectScene });
    const host = container.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(host, { button: 0, clientX: 200, clientY: 150, pointerId: 1 });
    expect(onSelectScene).not.toHaveBeenCalled();
  });

  it("reports a body drag released over another artboard with its coordinate correction", () => {
    const onMoveToScene = vi.fn();
    const { container } = renderCanvas(showWithScenes({}, { surfaces: [] }), { onMoveToScene });
    const host = container.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(host, { button: 0, clientX: 200, clientY: 120, pointerId: 7 });
    fireEvent.pointerMove(host, { clientX: 2216, clientY: 120, pointerId: 7 });
    fireEvent.pointerUp(host, { clientX: 2216, clientY: 120, pointerId: 7 });
    expect(onMoveToScene).toHaveBeenCalledWith("s1", "sc2", [-2016, 0]);
  });

  it("unassigns a surface when a drag ends in the workspace between artboards", () => {
    const onMoveToScene = vi.fn();
    const { container } = renderCanvas(showWithScenes({}, { surfaces: [] }), { onMoveToScene });
    const host = container.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(host, { button: 0, clientX: 200, clientY: 120, pointerId: 8 });
    fireEvent.pointerMove(host, { clientX: 1960, clientY: 120, pointerId: 8 });
    fireEvent.pointerUp(host, { clientX: 1960, clientY: 120, pointerId: 8 });
    expect(onMoveToScene).toHaveBeenCalledWith("s1", null, [0, 0]);
  });

  it("assigns a workspace-root surface when it is dropped onto an artboard", () => {
    const onMoveToScene = vi.fn();
    const show = showWithScenes({ surfaces: [] }, { surfaces: [] });
    const loose = { ...showWithSurface().scenes[0].surfaces[0],
      corners: [[1960, 80], [2010, 80], [2010, 160], [1960, 160]] as Quad };
    show.unassignedSurfaces = [loose];
    const { container } = renderCanvas(show, { onMoveToScene, selectedID: loose.id });
    const host = container.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(host, { button: 0, clientX: 1980, clientY: 120, pointerId: 10 });
    fireEvent.pointerMove(host, { clientX: 2200, clientY: 120, pointerId: 10 });
    fireEvent.pointerUp(host, { clientX: 2200, clientY: 120, pointerId: 10 });
    expect(onMoveToScene).toHaveBeenCalledWith("s1", "sc2", [-2016, 0]);
  });

  it("lets a tree-selected layer stranded over another artboard complete its transfer", () => {
    const onMoveToScene = vi.fn(), onSelectScene = vi.fn();
    const show = showWithScenes({
      surfaces: [{ ...showWithSurface().scenes[0].surfaces[0],
        corners: [[2100, 80], [2300, 80], [2300, 260], [2100, 260]] }],
    }, { surfaces: [] });
    const { container } = renderCanvas(show, { onMoveToScene, onSelectScene });
    const host = container.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(host, { button: 0, clientX: 2200, clientY: 150, pointerId: 9 });
    fireEvent.pointerMove(host, { clientX: 2240, clientY: 170, pointerId: 9 });
    fireEvent.pointerUp(host, { clientX: 2240, clientY: 170, pointerId: 9 });
    expect(onSelectScene).not.toHaveBeenCalled();
    expect(onMoveToScene).toHaveBeenCalledWith("s1", "sc2", [-2016, 0]);
  });

  it("does not draw a surface into a scene you are not editing", () => {
    const onSelectScene = vi.fn(), onDrawShape = vi.fn();
    const { container } = renderCanvas(showWithScenes({}, {}), { onSelectScene, onDrawShape, tool: "rect" });
    const host = container.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(host, { button: 0, clientX: 2100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(host, { clientX: 2400, clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(host, { clientX: 2400, clientY: 400, pointerId: 1 });
    expect(onSelectScene).toHaveBeenCalledWith("sc2");
    expect(onDrawShape).not.toHaveBeenCalled();
  });
});


it("Mapping renders checker geometry for timed, inactive and loose visuals without changing the document", () => {
  const show = showWithSurface({ sequence: true, opacity: 0, source: { mediaId: "picture", rect: [0, 0, 1920, 1080] } });
  show.media = [{ id: "picture", name: "Photo", file: "photo.png", kind: "image", width: 1920, height: 1080, bytes: 1 }];
  show.scenes[0].setupBackground = { mediaId: "picture", visible: true, opacity: .6 };
  const surface = show.scenes[0].surfaces[0];
  show.scenes.push({ ...show.scenes[0], id: "other", surfaces: [{ ...surface, id: "other-surface" }] });
  show.unassignedSurfaces = [{ ...surface, id: "loose" }];
  const before = JSON.stringify(show);
  // There is no visual clip at this playhead: Mapping must still show the surface.
  const resolved = { ...show, scenes: show.scenes.map(scene => ({ ...scene, surfaces: [] })) };
  const mapping = renderCanvas(show, { previewMode: "mapping", resolved, mediaUrls: { picture: "/photo.png" } });
  expect(mapping.container.querySelectorAll('.map-surface[data-preview="mapping"]')).toHaveLength(3);
  expect(mapping.container.querySelectorAll('.map-surface img, .map-surface video, .map-surface canvas')).toHaveLength(0);
  expect(mapping.container.querySelectorAll('.map-surface svg')).toHaveLength(3);
  expect(mapping.container.querySelector('.map-surface')?.getAttribute('style')).toContain('opacity: 1');
  expect(mapping.container.querySelector('img[src="/photo.png"]')).toBeTruthy(); // reference backdrop remains
  expect(JSON.stringify(show)).toBe(before);
  mapping.unmount();
  const visualization = renderCanvas(show, { previewMode: "visualization", mediaUrls: { picture: "/photo.png" } });
  expect(visualization.container.querySelectorAll('.map-surface img')).toHaveLength(0); // empty sequences stay empty on every artboard
  expect(JSON.stringify(show)).toBe(before);
  visualization.unmount();
});


describe("mapping scene consistency and mask editing", () => {
  it("keeps each backdrop DOM node, geometry, opacity and checker style across scene selection", () => {
    const show = showWithSurface();
    show.media = [{ id: "photo", name: "Wall", file: "wall.png", width: 100, height: 100, kind: "image", bytes: 1 }];
    show.scenes[0].setupBackground = { mediaId: "photo", visible: true, opacity: .4, corners: CORNERS };
    show.scenes.push({ ...show.scenes[0], id: "second", name: "Scene 2", surfaces: [],
      setupBackground: { mediaId: "photo", visible: true, opacity: .8 } });
    const props = { show, resolved: show, mediaUrls: { photo: "/wall.png" }, previewMode: "mapping" as const,
      selectedID: null, onSelect: () => {}, onSelectScene: () => {}, onGeometry: () => {}, onGroupGeometry: () => {},
      onCorners: () => {}, onMaskShape: () => {}, onDrawShape: () => {}, tool: "select" as const, timeS: 0, playing: false };
    const { container, rerender } = render(<SurfaceCanvas {...props} />);
    const images = [...container.querySelectorAll<HTMLImageElement>(".map-setup-background")];
    expect(images).toHaveLength(2);
    const styles = images.map(img => img.getAttribute("style"));
    const surface = container.querySelector(".map-surface");
    for (const activeSceneId of ["second", show.activeSceneId, "second"]) {
      const next = { ...show, activeSceneId };
      rerender(<SurfaceCanvas {...props} show={next} resolved={next} />);
      expect([...container.querySelectorAll(".map-setup-background")]).toEqual(images);
      expect(images.map(img => img.getAttribute("style"))).toEqual(styles);
      expect(container.querySelector(".map-surface")).toBe(surface);
    }
    const hidden = { ...show, scenes: show.scenes.map((s, i) => i ? { ...s, setupBackground: { ...s.setupBackground!, visible: false } } : s) };
    rerender(<SurfaceCanvas {...props} show={hidden} />);
    expect(container.querySelectorAll(".map-setup-background")).toHaveLength(1);
  });
  it("offers every point in Node mode, including dense and workspace-root masks", () => {
    const shape = Array.from({ length: 48 }, (_, i) => [500 + 200 * Math.cos(i / 48 * Math.PI * 2), 400 + 100 * Math.sin(i / 48 * Math.PI * 2)]) as Point[];
    const show = showWithSurface({ masks: [shape] });
    show.unassignedSurfaces = show.scenes[0].surfaces; show.scenes[0].surfaces = [];
    const { container } = renderCanvas(show, { tool: "node" });
    expect(container.querySelectorAll(".map-mask-handle")).toHaveLength(48);
  });
  it("inserts a point on the clicked edge without moving the projection corners", () => {
    const onMaskShape = vi.fn();
    const { container } = renderCanvas(showWithSurface(), { tool: "node", onMaskShape });
    fireEvent.doubleClick(container.querySelector(".map-canvas-host")!, { clientX: 510, clientY: 72 });
    expect(onMaskShape).toHaveBeenCalledWith("s1", 0, [CORNERS[0], [510, 72], ...CORNERS.slice(1)]);
  });
  it("Delete removes the selected mask point, never its surface; triangles retain three points", () => {
    const onMaskShape = vi.fn(), onDelete = vi.fn();
    const show = showWithSurface({ masks: [CORNERS] });
    const { container, unmount } = renderCanvas(show, { tool: "node", onMaskShape, onDelete });
    const host = container.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(container.querySelector(".map-mask-handle")!, { clientX: 120, clientY: 80, pointerId: 1, button: 0 });
    fireEvent.pointerUp(host, { clientX: 120, clientY: 80, pointerId: 1 });
    fireEvent.keyDown(host, { key: "Delete" });
    expect(onMaskShape).toHaveBeenCalledWith("s1", 0, CORNERS.slice(1));
    expect(onDelete).not.toHaveBeenCalled();
    unmount(); onMaskShape.mockClear();
    const triangle = renderCanvas(showWithSurface({ masks: [CORNERS.slice(1)] }), { tool: "node", onMaskShape, onDelete });
    const triHost = triangle.container.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(triangle.container.querySelector(".map-mask-handle")!, { clientX: 900, clientY: 64, pointerId: 2, button: 0 });
    fireEvent.pointerUp(triHost, { clientX: 900, clientY: 64, pointerId: 2 });
    fireEvent.keyDown(triHost, { key: "Delete" });
    expect(onMaskShape).not.toHaveBeenCalled(); expect(onDelete).not.toHaveBeenCalled();
  });
});

it('modulated preview handles and drag inversion agree while calibration stays fixed',()=>{
 const show=showWithSurface(),original=show.scenes[0].surfaces[0];
 const surface=editSurfaceAutomation(original,{modulation:{xPx:{source:'time',waveform:'square',amount:100},scaleX:{source:'time',waveform:'square',amount:1},rotationDeg:{source:'time',waveform:'square',amount:30}}});
 show.scenes[0].surfaces=[surface];const onCorners=vi.fn(),visible=evaluateSurface(surface,0);
 const view=renderCanvas(show,{previewMode:'visualization',tool:'node',onCorners});
 const host=view.container.querySelector('.map-canvas-host')!,handle=view.container.querySelector('.map-handle')!;
 expect(Number(handle.getAttribute('cx'))).toBeCloseTo(visible.corners[0][0]);
 expect(Number(handle.getAttribute('cy'))).toBeCloseTo(visible.corners[0][1]);
 fireEvent.pointerDown(handle,{button:0,pointerId:51,clientX:visible.corners[0][0],clientY:visible.corners[0][1]});
 fireEvent.pointerMove(host,{pointerId:51,clientX:visible.corners[0][0]+20,clientY:visible.corners[0][1]+10,altKey:true});
 const updated=evaluateSurface({...surface,corners:onCorners.mock.lastCall![1]},0);
 expect(updated.corners[0][0]).toBeCloseTo(visible.corners[0][0]+20);expect(updated.corners[0][1]).toBeCloseTo(visible.corners[0][1]+10);
 fireEvent.pointerUp(host,{pointerId:51});view.unmount();
 const mapping=renderCanvas(show,{previewMode:'mapping',tool:'node'});const fixed=mapping.container.querySelector('.map-handle')!;
 expect(Number(fixed.getAttribute('cx'))).toBe(original.corners[0][0]);expect(Number(fixed.getAttribute('cy'))).toBe(original.corners[0][1]);mapping.unmount();
});
