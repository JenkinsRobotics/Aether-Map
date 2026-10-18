import { expect, test } from "vitest";
import { groupSurfaces, surfaceFolders, type MapShow, type Surface } from "./document";
import { dissolveSurfaceFolder, moveSurface, nextFolderName, renameSurfaceFolder, setSurfaceFolder } from "./surface-interaction";
import { newFeature } from "./features/new-feature";
import { parseShow, serializeShow } from "./show-file";

/** Named layers, bottom-up: the array is paint order. */
const scene = (...names: string[]): Surface[] =>
  names.map((name, index) => ({ ...newFeature("surface", { width: 1920, height: 1080 }, index), id: name, name }));
const order = (list: readonly Surface[]) => list.map((s) => `${s.folder ?? "-"}/${s.id}`);

test("a folder is one contiguous run, and loose layers keep their own places", () => {
  const list = scene("a", "b", "c", "d");
  list[0].folder = "Set"; list[2].folder = "Set";
  // b sits between the two members; grouping pulls the run together at a's slot
  // and leaves b and d where they were relative to it.
  expect(order(groupSurfaces(list))).toEqual(["Set/a", "Set/c", "-/b", "-/d"]);
  expect(groupSurfaces(groupSurfaces(list))).toEqual(groupSurfaces(list));
  expect(surfaceFolders(groupSurfaces(list))).toEqual(["Set"]);
});

test("layers move in, between and back out of folders", () => {
  let list = setSurfaceFolder(scene("a", "b", "c"), "a", "Set");
  expect(order(list)).toEqual(["Set/a", "-/b", "-/c"]);
  // Into an existing folder: the layer joins the top of that run.
  list = setSurfaceFolder(list, "c", "Set");
  expect(order(list)).toEqual(["Set/a", "Set/c", "-/b"]);
  // Out again: the grouping goes and the layer keeps painting where it did.
  list = setSurfaceFolder(list, "a", undefined);
  expect(list.find((s) => s.id === "a")).not.toHaveProperty("folder");
  expect(order(list)).toEqual(["-/a", "Set/c", "-/b"]);
  // A locked layer refuses both directions.
  const locked = setSurfaceFolder(list.map((s) => s.id === "b" ? { ...s, locked: true } : s), "b", "Set");
  expect(locked.find((s) => s.id === "b")?.folder).toBeUndefined();
});

test("dropping beside a layer adopts that layer's folder", () => {
  const list = setSurfaceFolder(scene("a", "b", "c"), "b", "Set");
  // c lands next to b, so it joins Set rather than stranding itself mid-run.
  expect(order(moveSurface(list, "c", "b", "after"))).toEqual(["-/a", "Set/c", "Set/b"]);
  // And moving next to a loose layer takes it back out.
  const grouped = setSurfaceFolder(list, "c", "Set");
  expect(order(moveSurface(grouped, "c", "a", "after"))).toEqual(["-/c", "-/a", "Set/b"]);
});

test("renaming carries every member; dissolving keeps the layers and their order", () => {
  let list = setSurfaceFolder(setSurfaceFolder(scene("a", "b", "c"), "a", "Set"), "b", "Set");
  list = renameSurfaceFolder(list, "Set", "Stage left");
  expect(surfaceFolders(list)).toEqual(["Stage left"]);
  expect(nextFolderName(list)).toBe("Folder 1");
  expect(nextFolderName(renameSurfaceFolder(list, "Stage left", "Folder 1"))).toBe("Folder 2");
  const flat = dissolveSurfaceFolder(list, "Stage left");
  expect(surfaceFolders(flat)).toEqual([]);
  expect(flat.map((s) => s.id)).toEqual(list.map((s) => s.id));
});

test("folders survive a save and reopen, and a hand-edited file is regrouped on read", () => {
  // Deliberately the legacy shape: no `outputs`, the way a file on disk is.
  const show = parseShow(serializeShow({
    version: 2, output: { width: 1920, height: 1080 }, media: [], activeSceneId: "s1",
    playback: { mode: "continuous" },
    scenes: [{ id: "s1", name: "Scene 1", durationS: 10, surfaces: scene("a", "b", "c").map(
      (s) => s.id === "b" ? s : { ...s, folder: "Set" }) }],
  } as unknown as MapShow));
  expect(order(show.scenes[0].surfaces)).toEqual(["Set/a", "Set/c", "-/b"]);
});
