/**
 * What a row in the merged Scenes/Layers tree is, and how a layer moves
 * between scenes.
 *
 * The two trees were always one tree: `Scene.surfaces` means a layer is
 * literally nested under a scene, the way objects are nested under an artboard
 * in a drawing tool. Merging them left exactly two things that are not
 * presentation — deciding what an arbitrary row id refers to, and moving a
 * layer from one scene's list to another's — so both live here, pure and
 * tested, rather than inside a panel.
 */

import { backgroundLayerID } from "./background-layer";
import { groupSurfaces, surfaceCollection, type Clip, type MapShow, type Point, type Scene, type Surface } from "./document";
import { sourceID, sourceHasContent } from "./surface-assets";
import { translateSurface } from "./surface-interaction";

export type TreeTarget =
  | { kind: "scene"; scene: Scene }
  | { kind: "folder"; scene: Scene | null; folder: string }
  | { kind: "surface"; scene: Scene | null; surface: Surface }
  | { kind: "backdrop"; scene: Scene }
  | { kind: "asset"; scene: Scene | null; surface: Surface; clip: Clip | null };

const FOLDER = "folder/";

/**
 * Folder rows are tree-only and folders are named per scene, so two scenes may
 * each have a "Trim". The scene id has to be part of the row id or the tree
 * would give them one identity — and the name goes last, untouched, because a
 * folder may legitimately contain a slash.
 */
const ROOT = "~";
export const folderID = (sceneID: string | null, name: string) => `${FOLDER}${sceneID ?? ROOT}/${name}`;

function parseFolderID(id: string): { sceneID: string; folder: string } | undefined {
  if (!id.startsWith(FOLDER)) return undefined;
  const rest = id.slice(FOLDER.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return undefined;
  return { sceneID: rest.slice(0, slash), folder: rest.slice(slash + 1) };
}

/** The scene a layer lives in — not necessarily the active one. */
export function sceneOfSurface(show: MapShow, surfaceID: string): Scene | undefined {
  return show.scenes.find((scene) => scene.surfaces.some((surface) => surface.id === surfaceID));
}

/**
 * What the row with this id is. One lookup for every consumer, so the panel and
 * the app cannot disagree about whether a row is a scene, a folder, a layer,
 * a backdrop or an asset.
 */
export function resolveTreeID(show: MapShow, id: string): TreeTarget | undefined {
  const folder = parseFolderID(id);
  if (folder) {
    const scene: Scene | null = folder.sceneID === ROOT
      ? null
      : show.scenes.find((entry) => entry.id === folder.sceneID) ?? null;
    if (folder.sceneID !== ROOT && !scene) return undefined;
    const surfaces = scene ? scene.surfaces : show.unassignedSurfaces;
    const folders = scene ? scene.folders : show.unassignedFolders;
    if (!folders?.includes(folder.folder) && !surfaces.some((surface) => surface.folder === folder.folder)) return undefined;
    return { kind: "folder", scene, folder: folder.folder };
  }

  const scene = show.scenes.find((entry) => entry.id === id);
  if (scene) return { kind: "scene", scene };

  const backdrop = show.scenes.find((entry) => backgroundLayerID(entry.id) === id);
  if (backdrop?.setupBackground) return { kind: "backdrop", scene: backdrop };

  for (const entry of [null, ...show.scenes]) {
    const surfaces = entry?.surfaces ?? show.unassignedSurfaces;
    const surface = surfaces.find((item) => item.id === id);
    if (surface) return { kind: "surface", scene: entry, surface };
    for (const item of surfaces) {
      const clip = item.clips.find((entry2) => entry2.id === id);
      if (clip) return { kind: "asset", scene: entry, surface: item, clip };
      if (!item.sequence && !item.clips.length && sourceHasContent(item.source) && sourceID(item.id) === id) {
        return { kind: "asset", scene: entry, surface: item, clip: null };
      }
    }
  }
  return undefined;
}

/** Layer deletion never falls back to a scene, including stale selection ids. */
export function canDeleteLayer(show: MapShow, id: string): boolean {
  const target = resolveTreeID(show, id);
  if (target?.kind === "backdrop") return !target.scene.setupBackground?.locked;
  if (target?.kind === "surface") return !target.surface.locked;
  if (target?.kind !== "folder") return false;
  const members = (target.scene?.surfaces ?? show.unassignedSurfaces).filter(s => s.folder === target.folder);
  return members.every(s => !s.locked);
}

/** Delete a surface, whole compound/folder, or backdrop in one undoable edit. */
export function deleteTreeLayer(show: MapShow, id: string): MapShow {
  if (!canDeleteLayer(show, id)) return show;
  const target = resolveTreeID(show, id)!;
  if (target.kind === "backdrop") return {
    ...show, scenes: show.scenes.map(scene => scene.id === target.scene.id
      ? { ...scene, setupBackground: undefined } : scene),
  };
  if (target.kind !== "surface" && target.kind !== "folder") return show;
  const keep = (surface: Surface) => target.kind === "folder"
    ? surface.folder !== target.folder : surface.id !== target.surface.id;
  return {
    ...show,
    unassignedFolders: !target.scene && target.kind === "folder" ? show.unassignedFolders?.filter(name => name !== target.folder) : show.unassignedFolders,
    unassignedSurfaces: target.scene ? show.unassignedSurfaces : show.unassignedSurfaces.filter(keep),
    scenes: show.scenes.map(scene => scene.id === target.scene?.id
      ? { ...scene, surfaces: scene.surfaces.filter(keep), folders: target.kind === "folder" ? scene.folders?.filter(name => name !== target.folder) : scene.folders } : scene),
  };
}

export interface MoveToSceneOptions {
  /** Folder in the destination to join; absent drops the layer out of any folder. */
  folder?: string;
  /** Insert before this layer of the destination; absent lands it on top. */
  beforeID?: string;
  /** Canvas drop correction from the source artboard's coordinates to the destination's. */
  offset?: Point;
}

/**
 * Move a layer into another scene.
 *
 * A move, not a copy: the surface keeps its id, its cues and its clips, so
 * anything already pointing at it still does. Media needs no migration because
 * a show owns its media, not a scene.
 *
 * The old `folder` is dropped unless the drop named one — folders belong to the
 * scene whose layers named them, so carrying "Trim" into a scene that has no
 * Trim would conjure a folder nobody asked for.
 */
export function moveSurfaceToScene(
  show: MapShow,
  surfaceID: string,
  toSceneID: string,
  { folder, beforeID, offset }: MoveToSceneOptions = {},
): MapShow {
  const from = surfaceCollection(show, surfaceID);
  const to = show.scenes.find((scene) => scene.id === toSceneID);
  if (!from || !to || from.scene?.id === to.id) return show;
  const surface = from.surfaces.find((entry) => entry.id === surfaceID);
  if (!surface) return show;

  // A single face moved away from its source scene no longer belongs to the
  // source scene's compound shape, even if it joins a folder with the same name.
  const { groupShape: _groupShape, ...ungrouped } = surface;
  const geometry = translateSurface(surface, offset ?? [0, 0]);
  const moved: Surface = { ...ungrouped, ...geometry, folder, ...(folder ? { groupShape: null } : {}) };
  return {
    ...show,
    unassignedSurfaces: from.scene ? show.unassignedSurfaces
      : show.unassignedSurfaces.filter((entry) => entry.id !== surfaceID),
    scenes: show.scenes.map((scene) => {
      if (scene.id === from.scene?.id) {
        return { ...scene, surfaces: scene.surfaces.filter((entry) => entry.id !== surfaceID) };
      }
      if (scene.id !== to.id) return scene;
      const surfaces = [...scene.surfaces];
      const at = beforeID ? surfaces.findIndex((entry) => entry.id === beforeID) : -1;
      // Array order is paint order, so appending lands it on top — which is
      // where a drop onto the scene itself should put it.
      if (at < 0) surfaces.push(moved);
      else surfaces.splice(at, 0, moved);
      return { ...scene, surfaces: groupSurfaces(surfaces) };
    }),
  };
}

/** Move a layer out of every scene while preserving it as a workspace object. */
export function unassignSurface(
  show: MapShow,
  surfaceID: string,
  { offset = [0, 0] }: Pick<MoveToSceneOptions, "offset"> = {},
): MapShow {
  const from = surfaceCollection(show, surfaceID);
  if (!from?.scene) return show;
  const surface = from.surfaces.find((entry) => entry.id === surfaceID);
  if (!surface) return show;
  const { groupShape: _groupShape, folder: _folder, ...ungrouped } = surface;
  const moved: Surface = { ...ungrouped, ...translateSurface(surface, offset) };
  return {
    ...show,
    unassignedSurfaces: groupSurfaces([...show.unassignedSurfaces, moved]),
    scenes: show.scenes.map((scene) => scene.id === from.scene!.id
      ? { ...scene, surfaces: scene.surfaces.filter((entry) => entry.id !== surfaceID) }
      : scene),
  };
}

/** Keep a moved compound distinct from an unrelated folder with the same name. */
function destinationFolderName(to: Scene, requested: string): string {
  return destinationCollectionFolderName(to.surfaces, requested, to.folders);
}

function destinationCollectionFolderName(surfaces: Surface[], requested: string, folders: string[] = []): string {
  const used = new Set([...folders, ...surfaces.map((surface) => surface.folder).filter(Boolean)]);
  if (!used.has(requested)) return requested;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${requested} ${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** The row id that remains selected after a canvas transfer. */
export function canvasDestinationRowID(show: MapShow, rowID: string, toSceneID: string | null): string {
  const target = resolveTreeID(show, rowID);
  if (target?.kind !== "folder") return rowID;
  if (!toSceneID) return folderID(null,
    destinationCollectionFolderName(show.unassignedSurfaces, target.folder, show.unassignedFolders));
  const to = show.scenes.find((scene) => scene.id === toSceneID);
  return to ? folderID(toSceneID, destinationFolderName(to, target.folder)) : rowID;
}

/**
 * Move the object represented by a canvas selection into another scene.
 *
 * A face transfers by itself and leaves its former compound. A selected folder
 * transfers atomically, retaining its Cube/Box identity and every child row.
 * `offset` converts the live drag geometry from the source artboard's local
 * coordinates into the destination artboard's local coordinates.
 */
export function moveCanvasItemToScene(
  show: MapShow,
  rowID: string,
  toSceneID: string,
  offset: Point,
): MapShow {
  const target = resolveTreeID(show, rowID);
  if (!target || (target.kind !== "surface" && target.kind !== "folder")) return show;
  if (target.scene?.id === toSceneID) return show;
  if (target.kind === "surface") return moveSurfaceToScene(show, target.surface.id, toSceneID, { offset });

  const to = show.scenes.find((scene) => scene.id === toSceneID);
  if (!to) return show;
  const members = (target.scene?.surfaces ?? show.unassignedSurfaces)
    .filter((surface) => surface.folder === target.folder);
  if (!members.length) return show;
  const folder = destinationFolderName(to, target.folder);
  const memberIDs = new Set(members.map((surface) => surface.id));
  const moved = members.map((surface): Surface => ({
    ...surface,
    ...translateSurface(surface, offset),
    folder,
  }));
  return {
    ...show,
    unassignedFolders: target.scene ? show.unassignedFolders : show.unassignedFolders?.filter(name => name !== target.folder),
    unassignedSurfaces: target.scene ? show.unassignedSurfaces
      : show.unassignedSurfaces.filter((surface) => !memberIDs.has(surface.id)),
    scenes: show.scenes.map((scene) => {
      if (scene.id === target.scene?.id) {
        return { ...scene, folders: scene.folders?.filter(name => name !== target.folder), surfaces: scene.surfaces.filter((surface) => !memberIDs.has(surface.id)) };
      }
      if (scene.id === to.id) return { ...scene, folders: [...(scene.folders ?? []), folder], surfaces: groupSurfaces([...scene.surfaces, ...moved]) };
      return scene;
    }),
  };
}

/** Move a selected surface or compound to the workspace root. */
export function unassignCanvasItem(show: MapShow, rowID: string, offset: Point): MapShow {
  const target = resolveTreeID(show, rowID);
  if (!target || (target.kind !== "surface" && target.kind !== "folder") || !target.scene) return show;
  if (target.kind === "surface") return unassignSurface(show, target.surface.id, { offset });
  const members = target.scene.surfaces.filter((surface) => surface.folder === target.folder);
  if (!members.length) return show;
  const ids = new Set(members.map((surface) => surface.id));
  const folder = destinationCollectionFolderName(show.unassignedSurfaces, target.folder, show.unassignedFolders);
  const moved = members.map((surface) => ({ ...surface, ...translateSurface(surface, offset), folder }));
  return {
    ...show,
    unassignedFolders: [...(show.unassignedFolders ?? []), folder],
    unassignedSurfaces: groupSurfaces([...show.unassignedSurfaces, ...moved]),
    scenes: show.scenes.map((scene) => scene.id === target.scene!.id
      ? { ...scene, folders: scene.folders?.filter(name => name !== target.folder), surfaces: scene.surfaces.filter((surface) => !ids.has(surface.id)) }
      : scene),
  };
}
