import { groupSurfaces, surfaceFolders, type MapShow, type Surface } from './document';
import { folderID, resolveTreeID } from './scene-tree';
import { renameSurfaceFolder } from './surface-interaction';

/** Folder names and geometry share one document owner, including the pasteboard. */
export function folderNames(show: MapShow, sceneID: string | null): string[] {
  const scene = show.scenes.find(s => s.id === sceneID);
  return [...new Set([...(sceneID === null ? show.unassignedFolders ?? [] : scene?.folders ?? []),
    ...surfaceFolders(sceneID === null ? show.unassignedSurfaces : scene?.surfaces ?? [])])];
}
export function editLayerOwner(show: MapShow, sceneID: string | null,
  change: (surfaces: Surface[], folders: string[]) => { surfaces: Surface[]; folders: string[] }): MapShow {
  if (sceneID === null) {
    const next = change(show.unassignedSurfaces, show.unassignedFolders ?? []);
    return { ...show, unassignedSurfaces: groupSurfaces(next.surfaces), unassignedFolders: next.folders };
  }
  return { ...show, scenes: show.scenes.map(scene => {
    if (scene.id !== sceneID) return scene;
    const next = change(scene.surfaces, scene.folders ?? []);
    return { ...scene, ...next, surfaces: groupSurfaces(next.surfaces) };
  }) };
}
export function unusedFolderName(show: MapShow, sceneID: string | null, base = 'Folder'): string {
  const used = new Set(folderNames(show, sceneID));
  if (base !== 'Folder' && !used.has(base)) return base;
  for (let n = base === 'Folder' ? 1 : 2; ; n++) if (!used.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** A single history transaction groups selected surfaces; an empty selection creates a real folder. */
export function createLayerFolder(show: MapShow, sceneID: string | null, name: string, ids: readonly string[] = []): MapShow {
  const selected = new Set(ids);
  const targets = ids.map(id => resolveTreeID(show, id));
  if (!name.trim() || folderNames(show, sceneID).includes(name) || targets.some(t =>
    t?.kind !== 'surface' || (t.scene?.id ?? null) !== sceneID || t.surface.locked)) return show;
  return editLayerOwner(show, sceneID, (surfaces, folders) => ({ folders: [...folders, name],
    surfaces: surfaces.map(s => selected.has(s.id) ? { ...s, folder: name, groupShape: null } : s) }));
}
export function renameLayerFolder(show: MapShow, sceneID: string | null, from: string, to: string): MapShow {
  const name = to.trim();
  // A rename must never merge two unrelated groups.
  if (name === from || (name && folderNames(show, sceneID).includes(name))) return show;
  const target = resolveTreeID(show, folderID(sceneID, from));
  if (target?.kind !== 'folder') return show;
  const members = (target.scene?.surfaces ?? show.unassignedSurfaces).filter(s => s.folder === from);
  if (members.some(s => s.locked)) return show;
  return editLayerOwner(show, sceneID, (surfaces, folders) => ({
    surfaces: renameSurfaceFolder(surfaces, from, name),
    folders: folders.flatMap(folder => folder === from ? name ? [name] : [] : [folder]),
  }));
}
export function patchLayerFolder(show: MapShow, id: string, patch: Pick<Partial<Surface>, 'enabled' | 'locked'>): MapShow {
  const target = resolveTreeID(show, id);
  if (target?.kind !== 'folder') return show;
  return editLayerOwner(show, target.scene?.id ?? null, (surfaces, folders) => ({ folders,
    surfaces: surfaces.map(s => s.folder === target.folder ? { ...s, ...patch } : s) }));
}

/** Move a surface or entire group, preserving ids, content and relative face order. Tree order is reverse paint order. */
export function moveTreeLayer(show: MapShow, id: string, targetID: string, position: 'before' | 'after' | 'inside'): MapShow {
  const from = resolveTreeID(show, id), to = resolveTreeID(show, targetID);
  if (!from || !to || id === targetID || !['surface', 'folder'].includes(from.kind)
    || !['scene', 'surface', 'folder'].includes(to.kind)) return show;
  if (from.kind !== 'surface' && from.kind !== 'folder') return show;
  const owner = from.scene?.id ?? null, destination = to.scene?.id ?? null;
  const source = from.scene?.surfaces ?? show.unassignedSurfaces;
  const members = from.kind === 'folder' ? source.filter(s => s.folder === from.folder) : [from.surface];
  if (members.some(s => s.locked) || (to.kind === 'surface' && members.some(s => s.id === to.surface.id))) return show;
  if (from.kind === 'folder' && to.kind === 'folder' && position === 'inside') return show; // one folder level; no silent flattening
  if (to.kind === 'surface' && position === 'inside') return show;
  const memberIDs = new Set(members.map(s => s.id));
  const movingFolder = from.kind === 'folder' ? owner === destination ? from.folder : unusedFolderName(show, destination, from.folder) : undefined;
  const folder = movingFolder ?? (to.kind === 'folder' && position === 'inside' ? to.folder : to.kind === 'surface' ? to.surface.folder : undefined);
  const moved = members.map(s => from.kind === 'folder' ? { ...s, folder } : { ...s, folder, groupShape: null });
  let next = editLayerOwner(show, owner, (surfaces, folders) => ({
    surfaces: surfaces.filter(s => !memberIDs.has(s.id)),
    folders: from.kind === 'folder' ? folders.filter(name => name !== from.folder) : folders,
  }));
  next = editLayerOwner(next, destination, (surfaces, folders) => {
    let index = surfaces.length;
    if (to.kind === 'surface') {
      const indices = surfaces.flatMap((s, i) => s.id === to.surface.id || (from.kind === 'folder' && to.surface.folder && s.folder === to.surface.folder) ? [i] : []);
      if (indices.length) index = position === 'before' ? indices.at(-1)! + 1 : indices[0];
    }
    if (to.kind === 'folder') {
      const indices = surfaces.flatMap((s, i) => s.folder === to.folder ? [i] : []);
      if (indices.length) index = position === 'after' ? indices[0] : indices.at(-1)! + 1;
    }
    const reordered = [...surfaces]; reordered.splice(Math.max(0, index), 0, ...moved);
    return { surfaces: reordered, folders: movingFolder ? [...new Set([...folders, movingFolder])] : folders };
  });
  return next;
}
export function stepLayerFolder(show: MapShow, id: string, direction: -1 | 1): MapShow {
  const target = resolveTreeID(show, id);
  if (target?.kind !== 'folder') return show;
  const list = target.scene?.surfaces ?? show.unassignedSurfaces;
  const members = list.flatMap((s, i) => s.folder === target.folder ? [i] : []);
  if (!members.length) return show;
  const neighbor = list[direction === 1 ? members.at(-1)! + 1 : members[0] - 1];
  if (!neighbor) return show;
  return moveTreeLayer(show, id, neighbor.folder ? folderID(target.scene?.id ?? null, neighbor.folder) : neighbor.id, direction === 1 ? 'before' : 'after');
}
