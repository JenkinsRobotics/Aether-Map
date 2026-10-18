import { expect, test } from "vitest";
import { boxSurfaces, compoundFolderName, compoundSurfaces, cubeSurfaces, linkedFaceCorners } from "./shape-groups";
import { emptyShow, groupSurfaces, surfaceFolders } from "../document";
import { parseShow, serializeShow } from "../show-file";
import { renameSurfaceFolder, setSurfaceFolder } from "../surface-interaction";

const output = { width: 1920, height: 1080 };
const spans = (surface: { corners: [number, number][] | readonly [number, number][] }) => {
  const xs = surface.corners.map((c) => c[0]), ys = surface.corners.map((c) => c[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

test("a cube arrives as three faces in one folder", () => {
  const faces = cubeSurfaces(output, 0);
  expect(faces).toHaveLength(3);
  // Grouped, so they move, hide and reorder as the one object they represent.
  expect(new Set(faces.map((f) => f.folder))).toEqual(new Set(["Cube"]));
  expect(faces.every((f) => f.groupShape === "cube")).toBe(true);
  expect(faces.map((f) => f.name)).toEqual(["Cube top", "Cube left", "Cube right"]);
  // Distinct ids, or selecting one would select them all.
  expect(new Set(faces.map((f) => f.id)).size).toBe(3);
  for (const f of faces) {
    expect(f.corners).toHaveLength(4);
    // A degenerate face cannot be warped onto anything.
    expect(spans(f).w).toBeGreaterThan(0);
    expect(spans(f).h).toBeGreaterThan(0);
  }
  // Inside the scene, not off the edge of it where you would have to hunt.
  for (const f of faces) for (const [x, y] of f.corners) {
    expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(output.width);
    expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(output.height);
  }
});

test("a box is a back panel inside four walls", () => {
  const faces = boxSurfaces(output, 0);
  expect(faces.map((f) => f.name)).toEqual(["Box back", "Box top", "Box right", "Box bottom", "Box left"]);
  expect(new Set(faces.map((f) => f.folder))).toEqual(new Set(["Box"]));
  expect(faces.every((f) => f.groupShape === "box")).toBe(true);
  // The back sits inside the opening the four walls describe.
  const back = spans(faces[0]);
  const opening = Math.min(output.width, output.height) * 0.6;
  expect(back.w).toBeLessThan(opening);
  expect(back.h).toBeLessThan(opening);
  for (const f of faces) { expect(spans(f).w).toBeGreaterThan(0); expect(spans(f).h).toBeGreaterThan(0); }
});

test("a compound shape survives a save as a grouped run", () => {
  const show = emptyShow();
  show.scenes[0].surfaces = groupSurfaces(compoundSurfaces("cube", show.output, 0));
  const saved = parseShow(serializeShow(show)).scenes[0].surfaces;
  expect(saved).toHaveLength(3);
  expect(surfaceFolders(saved)).toEqual(["Cube"]);
  // Contiguous, because a folder's members are a run in paint order.
  expect(saved.every((s) => s.folder === "Cube")).toBe(true);
  expect(saved.every((s) => s.groupShape === "cube")).toBe(true);
});

test("legacy solids regain their icon identity, while deliberate regrouping stays ordinary", () => {
  const show = emptyShow();
  show.scenes[0].surfaces = [...cubeSurfaces(show.output, 0), ...boxSurfaces(show.output, 3)]
    .map(({ groupShape: _old, ...surface }) => surface);
  const restored = parseShow(serializeShow(show)).scenes[0].surfaces;
  expect(restored.filter((surface) => surface.folder === "Cube").every((surface) => surface.groupShape === "cube")).toBe(true);
  expect(restored.filter((surface) => surface.folder === "Box").every((surface) => surface.groupShape === "box")).toBe(true);

  const renamed = renameSurfaceFolder(restored, "Cube", "Front sculpture");
  expect(renamed.filter((surface) => surface.folder === "Front sculpture").every((surface) => surface.groupShape === "cube")).toBe(true);
  const regrouped = setSurfaceFolder(renamed, renamed.find((surface) => surface.folder === "Front sculpture")!.id, "Reference pieces");
  expect(regrouped.find((surface) => surface.folder === "Reference pieces")?.groupShape).toBeNull();
  show.scenes[0].surfaces = regrouped;
  expect(parseShow(serializeShow(show)).scenes[0].surfaces.find((surface) => surface.folder === "Reference pieces")?.groupShape).toBeNull();
});

test("a portrait scene gets a shape sized to it, not to a default", () => {
  const tall = compoundSurfaces("box", { width: 1080, height: 1920 }, 0);
  for (const f of tall) for (const [x, y] of f.corners) {
    expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1080);
    expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1920);
  }
});

test("each placed solid owns its own folder and three or five selectable faces", () => {
  const first = compoundSurfaces("cube", output, 0);
  const secondName = compoundFolderName("cube", first);
  const second = compoundSurfaces("cube", output, 3, secondName);
  const box = compoundSurfaces("box", output, 6, compoundFolderName("box", [...first, ...second]));
  expect(secondName).toBe("Cube 2");
  expect(new Set([...first, ...second, ...box].map(s => s.folder))).toEqual(new Set(["Cube", "Cube 2", "Box"]));
  expect(new Set([...first, ...second, ...box].map(s => s.id)).size).toBe(11);
  expect(groupSurfaces([...first, ...second, ...box]).map(s => s.folder)).toEqual([
    ...Array(3).fill("Cube"), ...Array(3).fill("Cube 2"), ...Array(5).fill("Box"),
  ]);
});

test("dragging a shared cube vertex moves both adjoining faces and respects locks", () => {
  const first = cubeSurfaces(output, 0);
  const other = cubeSurfaces(output, 3, "Cube 2");
  const front = first[0].corners[2];
  const next = first[0].corners.map(p => [...p] as [number, number]) as typeof first[0]["corners"];
  next[2] = [front[0] + 31, front[1] - 17];
  const linked = linkedFaceCorners([...first, ...other], first[0].id, next)!;
  expect(linked[0].corners[2]).toEqual(next[2]);
  expect(linked[1].corners[1]).toEqual(next[2]);
  expect(linked[2].corners[0]).toEqual(next[2]);
  expect(linked[1].corners[0]).toEqual(first[1].corners[0]);
  expect(linked.slice(3)).toEqual(other);
  expect(linkedFaceCorners([first[0], { ...first[1], locked: true }, first[2]], first[0].id, next)).toBeNull();
});

test("a box back corner stays joined to its top and left walls", () => {
  const faces = boxSurfaces(output, 0);
  const before = faces[0].corners[0];
  const corners = faces[0].corners.map(p => [...p] as [number, number]) as typeof faces[0]["corners"];
  corners[0] = [before[0] - 20, before[1] + 15];
  const linked = linkedFaceCorners(faces, faces[0].id, corners)!;
  expect(linked[0].corners[0]).toEqual(corners[0]);
  expect(linked[1].corners[3]).toEqual(corners[0]);
  expect(linked[4].corners[1]).toEqual(corners[0]);
  expect(linked[2].corners).toEqual(faces[2].corners);
});
