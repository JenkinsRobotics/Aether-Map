import { describe, expect, it } from "vitest";
import { canDeleteLayer, deleteTreeLayer, canvasDestinationRowID, folderID, moveCanvasItemToScene, moveSurfaceToScene, resolveTreeID, sceneOfSurface, unassignCanvasItem } from "./scene-tree";
import { backgroundLayerID } from "./background-layer";
import { emptyShow, newScene, newSurface, type MapShow, type Surface } from "./document";
import { surfaceFromShape } from "./mask/shape-surface";
import { regularPolygon } from "./mask/geometry";
import { sceneLayers, showForOutput } from "./document";
import { cubeSurfaces } from "./features/shape-groups";

function twoScenes(): MapShow {
  const base = emptyShow();
  const a = { ...newScene("Front"), id: "sa" };
  const b = { ...newScene("Lobby"), id: "sb" };
  a.surfaces = [
    { ...newSurface(base.output, 0), id: "s1", name: "Door" },
    { ...newSurface(base.output, 1), id: "s2", name: "Window", folder: "Trim" },
  ];
  b.surfaces = [{ ...newSurface(base.output, 0), id: "s3", name: "Sign" }];
  return { ...base, scenes: [a, b], activeSceneId: "sa" };
}

describe("resolveTreeID", () => {
  const show = twoScenes();

  it("knows a scene row", () => {
    expect(resolveTreeID(show, "sb")).toMatchObject({ kind: "scene", scene: { name: "Lobby" } });
  });

  it("knows a surface row, and which scene it is in", () => {
    expect(resolveTreeID(show, "s3")).toMatchObject({
      kind: "surface", scene: { id: "sb" }, surface: { name: "Sign" },
    });
  });

  it("resolves a workspace-root layer without inventing a scene parent", () => {
    const loose = twoScenes();
    loose.unassignedSurfaces = [{ ...loose.scenes[0].surfaces[0], id: "loose" }];
    expect(resolveTreeID(loose, "loose")).toMatchObject({ kind: "surface", scene: null, surface: { id: "loose" } });
  });

  it("scopes folder rows to their scene, so two scenes can both have a Trim folder", () => {
    const both = { ...show, scenes: [show.scenes[0], { ...show.scenes[1],
      surfaces: [{ ...show.scenes[1].surfaces[0], folder: "Trim" }] }] };
    expect(resolveTreeID(both, folderID("sa", "Trim"))).toMatchObject({ kind: "folder", scene: { id: "sa" }, folder: "Trim" });
    expect(resolveTreeID(both, folderID("sb", "Trim"))).toMatchObject({ kind: "folder", scene: { id: "sb" }, folder: "Trim" });
  });

  it("survives a folder name containing a slash", () => {
    const named = { ...show, scenes: [{ ...show.scenes[0],
      surfaces: [{ ...show.scenes[0].surfaces[0], folder: "Left/Right" }] }, show.scenes[1]] };
    expect(resolveTreeID(named, folderID("sa", "Left/Right")))
      .toMatchObject({ kind: "folder", folder: "Left/Right" });
  });

  it("knows a scene's backdrop row", () => {
    const withBackdrop = { ...show, scenes: [{ ...show.scenes[0],
      setupBackground: { mediaId: "m1", visible: true, opacity: 0.6 } }, show.scenes[1]] };
    expect(resolveTreeID(withBackdrop, backgroundLayerID("sa")))
      .toMatchObject({ kind: "backdrop", scene: { id: "sa" } });
  });

  it("answers nothing for an id that is not in the tree", () => {
    expect(resolveTreeID(show, "no-such-row")).toBeUndefined();
    expect(resolveTreeID(show, folderID("sa", "Missing"))).toBeUndefined();
  });
});

describe("sceneOfSurface", () => {
  it("finds the scene a layer lives in, whichever scene is active", () => {
    expect(sceneOfSurface(twoScenes(), "s3")?.id).toBe("sb");
  });
});

describe("moveSurfaceToScene", () => {
  it("assigns a workspace-root layer to a scene and converts its coordinates", () => {
    const show = twoScenes();
    show.unassignedSurfaces = [{ ...show.scenes[0].surfaces[0], id: "loose",
      corners: [[2100, 20], [2200, 20], [2200, 120], [2100, 120]] }];
    const next = moveSurfaceToScene(show, "loose", "sb", { offset: [-2016, 0] });
    expect(next.unassignedSurfaces).toHaveLength(0);
    expect(next.scenes[1].surfaces.at(-1)).toMatchObject({ id: "loose", corners: [[84, 20], [184, 20], [184, 120], [84, 120]] });
  });
  it("moves a layer out of one scene and into another", () => {
    const next = moveSurfaceToScene(twoScenes(), "s1", "sb");
    expect(next.scenes[0].surfaces.map((s: Surface) => s.id)).toEqual(["s2"]);
    expect(next.scenes[1].surfaces.map((s: Surface) => s.id)).toEqual(["s3", "s1"]);
  });

  it("stops projecting a moved polygon in its old scene and projects it in the new one", () => {
    const show = twoScenes();
    const polygon = { ...surfaceFromShape(regularPolygon([200, 200], [260, 200], 6), show.output, 2, false), id: "poly", polygonSides: 6 };
    show.scenes[0].surfaces.push(polygon);
    const moved = moveSurfaceToScene(show, "poly", "sb");
    expect(sceneLayers(moved, { editor: true })[0].scene.surfaces.some((surface) => surface.id === "poly")).toBe(false);
    expect(sceneLayers(showForOutput(moved, { ...show.outputs[0], sceneId: "sa" }))[0].scene.surfaces.some((surface) => surface.id === "poly")).toBe(false);
    expect(sceneLayers(showForOutput(moved, { ...show.outputs[0], sceneId: "sb" }))[0].scene.surfaces.some((surface) => surface.id === "poly")).toBe(true);
  });

  it("keeps the layer's identity, cues and clips — it is a move, not a copy", () => {
    const show = twoScenes();
    show.scenes[0].surfaces[0].cues = [{ id: "c1", timeS: 2, action: "hide" }];
    const moved = moveSurfaceToScene(show, "s1", "sb").scenes[1].surfaces.at(-1)!;
    expect(moved.id).toBe("s1");
    expect(moved.cues).toEqual([{ id: "c1", timeS: 2, action: "hide" }]);
  });

  it("lands on top by default, because that is where the tree drops it", () => {
    const next = moveSurfaceToScene(twoScenes(), "s1", "sb");
    // Array order is paint order: last paints on top.
    expect(next.scenes[1].surfaces.at(-1)!.id).toBe("s1");
  });

  it("inserts before a named layer when the drop said so", () => {
    const next = moveSurfaceToScene(twoScenes(), "s1", "sb", { beforeID: "s3" });
    expect(next.scenes[1].surfaces.map((s: Surface) => s.id)).toEqual(["s1", "s3"]);
  });

  it("drops the layer's old folder, which belonged to the scene it left", () => {
    const next = moveSurfaceToScene(twoScenes(), "s2", "sb");
    expect(next.scenes[1].surfaces.find((s: Surface) => s.id === "s2")!.folder).toBeUndefined();
  });

  it("joins a folder in the destination when dropped on one", () => {
    const next = moveSurfaceToScene(twoScenes(), "s1", "sb", { folder: "Signs" });
    expect(next.scenes[1].surfaces.find((s: Surface) => s.id === "s1")!.folder).toBe("Signs");
  });

  it("keeps each folder's members one contiguous run in the destination", () => {
    const show = twoScenes();
    show.scenes[1].surfaces = [
      { ...show.scenes[1].surfaces[0], id: "x1", folder: "Set" },
      { ...show.scenes[1].surfaces[0], id: "x2" },
      { ...show.scenes[1].surfaces[0], id: "x3", folder: "Set" },
    ];
    const next = moveSurfaceToScene(show, "s1", "sb", { folder: "Set" });
    const ids = next.scenes[1].surfaces.map((s: Surface) => s.id);
    const members = ids.filter((id: string) =>
      next.scenes[1].surfaces.find((s: Surface) => s.id === id)!.folder === "Set");
    const first = ids.indexOf(members[0]);
    expect(ids.slice(first, first + members.length)).toEqual(members);
  });

  it("refuses to move a layer into the scene it is already in", () => {
    const show = twoScenes();
    expect(moveSurfaceToScene(show, "s1", "sa")).toBe(show);
  });

  it("leaves the show alone when the layer or the target scene is unknown", () => {
    const show = twoScenes();
    expect(moveSurfaceToScene(show, "nope", "sb")).toBe(show);
    expect(moveSurfaceToScene(show, "s1", "nope")).toBe(show);
  });
});

describe("workspace-root ownership", () => {
  it("unassigns a surface without changing its identity and keeps it out of scene output", () => {
    const show = twoScenes();
    const next = unassignCanvasItem(show, "s1", [1920, 40]);
    expect(next.scenes[0].surfaces.some(surface => surface.id === "s1")).toBe(false);
    expect(next.unassignedSurfaces[0].id).toBe("s1");
    expect(next.unassignedSurfaces[0].corners[0]).toEqual([
      show.scenes[0].surfaces[0].corners[0][0] + 1920,
      show.scenes[0].surfaces[0].corners[0][1] + 40,
    ]);
    expect(sceneLayers(showForOutput(next, { ...show.outputs[0], sceneId: "sa" }))[0].scene.surfaces
      .some(surface => surface.id === "s1")).toBe(false);
  });

  it("parks a selected compound at root and assigns all of its faces together later", () => {
    const show = twoScenes();
    show.scenes[0].surfaces = cubeSurfaces(show.output, 0);
    const ids = show.scenes[0].surfaces.map(surface => surface.id);
    const loose = unassignCanvasItem(show, folderID("sa", "Cube"), [1920, 0]);
    expect(loose.unassignedSurfaces.map(surface => surface.id)).toEqual(ids);
    expect(resolveTreeID(loose, folderID(null, "Cube"))).toMatchObject({ kind: "folder", scene: null });
    const assigned = moveCanvasItemToScene(loose, folderID(null, "Cube"), "sb", [-2016, 0]);
    expect(assigned.unassignedSurfaces).toHaveLength(0);
    expect(assigned.scenes[1].surfaces.filter(surface => ids.includes(surface.id))).toHaveLength(3);
  });

  it("keeps unrelated root compounds separate when their folder names collide", () => {
    const show = twoScenes();
    show.scenes[0].surfaces = cubeSurfaces(show.output, 0);
    show.unassignedSurfaces = [{ ...newSurface(show.output, 8), id: "existing", folder: "Cube" }];
    const sourceID = folderID("sa", "Cube");
    expect(canvasDestinationRowID(show, sourceID, null)).toBe(folderID(null, "Cube 2"));
    const loose = unassignCanvasItem(show, sourceID, [1920, 0]);
    expect(loose.unassignedSurfaces.filter(surface => surface.folder === "Cube 2")).toHaveLength(3);
  });
});

describe("moveCanvasItemToScene", () => {
  it("reparents one surface and converts its geometry to destination-artboard coordinates", () => {
    const show = twoScenes();
    const before = structuredClone(show.scenes[0].surfaces[0]);
    const next = moveCanvasItemToScene(show, "s1", "sb", [-2016, 30]);
    expect(next.scenes[0].surfaces.some((surface) => surface.id === "s1")).toBe(false);
    const moved = next.scenes[1].surfaces.find((surface) => surface.id === "s1")!;
    expect(moved.corners).toEqual(before.corners.map(([x, y]) => [x - 2016, y + 30]));
    expect(moved.masks).toEqual(before.masks.map((shape) => shape.map(([x, y]) => [x - 2016, y + 30])));
  });

  it("detaches one transferred face from its former compound", () => {
    const show = twoScenes();
    show.scenes[0].surfaces = cubeSurfaces(show.output, 0);
    const face = show.scenes[0].surfaces[0];
    const next = moveCanvasItemToScene(show, face.id, "sb", [0, 0]);
    const moved = next.scenes[1].surfaces.find((surface) => surface.id === face.id)!;
    expect(moved.folder).toBeUndefined();
    expect(moved.groupShape).toBeUndefined();
  });

  it("moves a selected cube as one folder and keeps all three face identities", () => {
    const show = twoScenes();
    show.scenes[0].surfaces = cubeSurfaces(show.output, 0);
    const ids = show.scenes[0].surfaces.map((surface) => surface.id);
    const rowID = folderID("sa", "Cube");
    const next = moveCanvasItemToScene(show, rowID, "sb", [-100, 25]);
    expect(next.scenes[0].surfaces).toHaveLength(0);
    const moved = next.scenes[1].surfaces.filter((surface) => ids.includes(surface.id));
    expect(moved).toHaveLength(3);
    expect(moved.every((surface) => surface.folder === "Cube" && surface.groupShape === "cube")).toBe(true);
    expect(resolveTreeID(next, folderID("sb", "Cube"))).toMatchObject({ kind: "folder", scene: { id: "sb" } });
  });

  it("keeps a compound separate and selects its renamed destination row when its folder name is occupied", () => {
    const show = twoScenes();
    show.scenes[0].surfaces = cubeSurfaces(show.output, 0);
    show.scenes[1].surfaces[0].folder = "Cube";
    const sourceID = folderID("sa", "Cube");
    expect(canvasDestinationRowID(show, sourceID, "sb")).toBe(folderID("sb", "Cube 2"));
    const next = moveCanvasItemToScene(show, sourceID, "sb", [0, 0]);
    expect(resolveTreeID(next, folderID("sb", "Cube 2"))).toMatchObject({ kind: "folder" });
    expect(next.scenes[1].surfaces.filter((surface) => surface.folder === "Cube 2")).toHaveLength(3);
  });
});


describe("deleteTreeLayer", () => {
  it("deletes a compound from its own scene without touching scenes, other groups or same-named groups elsewhere", () => {
    const show = twoScenes();
    const faces = cubeSurfaces(show.output, 0, "Cube");
    show.scenes[0].surfaces.push(...faces);
    show.scenes[1].surfaces[0].folder = "Cube";
    show.activeSceneId = "sb";
    const next = deleteTreeLayer(show, folderID("sa", "Cube"));
    expect(next.scenes.map(s => s.id)).toEqual(["sa", "sb"]);
    expect(next.scenes[0].surfaces.map(s => s.id)).toEqual(["s1", "s2"]);
    expect(next.scenes[1]).toBe(show.scenes[1]);
    expect(show.scenes[0].surfaces).toHaveLength(5);
  });
  it("deletes just an individual selected face", () => {
    const show = twoScenes();
    const faces = cubeSurfaces(show.output, 0, "Cube");
    show.scenes[0].surfaces = faces;
    expect(deleteTreeLayer(show, faces[0].id).scenes[0].surfaces).toEqual(faces.slice(1));
  });
  it("blocks whole-group deletion when a member is locked", () => {
    const show = twoScenes();
    show.scenes[0].surfaces = cubeSurfaces(show.output, 0, "Cube");
    show.scenes[0].surfaces[1].locked = true;
    expect(canDeleteLayer(show, folderID("sa", "Cube"))).toBe(false);
    expect(deleteTreeLayer(show, folderID("sa", "Cube"))).toBe(show);
  });
  it("deletes unassigned groups but never resolves a stale scene group to the workspace root", () => {
    const show = twoScenes();
    show.unassignedSurfaces = cubeSurfaces(show.output, 0, "Cube");
    expect(deleteTreeLayer(show, folderID(null, "Cube")).unassignedSurfaces).toEqual([]);
    expect(deleteTreeLayer(show, folderID("gone", "Cube"))).toBe(show);
    expect(deleteTreeLayer(show, "missing")).toBe(show);
    expect(deleteTreeLayer(show, "sa")).toBe(show);
  });
});


it('a materialized source child resolves its clip, and stale source IDs do not resolve another input', () => {
  const show = emptyShow();
  const surface = newSurface(show.output, 0);
  surface.source.fill = '#ff0000';
  show.scenes[0].surfaces = [surface];
  const id = `source:${surface.id}`;
  expect(resolveTreeID(show, id)).toMatchObject({ kind: 'asset', clip: null });
  surface.clips = [{ id, startS: 0, durationS: 10, inS: 0, loop: false, source: surface.source }];
  surface.sequence = true;
  expect(resolveTreeID(show, id)).toMatchObject({ kind: 'asset', clip: { id } });
  surface.clips = [];
  expect(resolveTreeID(show, id)).toBeUndefined();
});
