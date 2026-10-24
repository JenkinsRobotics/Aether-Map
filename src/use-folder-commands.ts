import { useCallback } from 'react';
import { surfaceCollection, withSurfaceCollection, type MapShow } from './document';
import { setSurfaceFolder } from './surface-interaction';
import { createLayerFolder, renameLayerFolder, unusedFolderName } from './layer-tree-commands';

/** Folder commands are document transactions, including empty folders. */
export function useFolderCommands(show: MapShow,
  edit: (next: MapShow | ((current: MapShow) => MapShow), coalesceKey?: string) => void) {
  const setFolder = useCallback((id: string, folder: string | undefined) =>
    edit(current => withSurfaceCollection(current, id, list => setSurfaceFolder(list, id, folder))), [edit]);
  const renameFolder = useCallback((from: string, to: string, sceneID: string | null) =>
    edit(current => renameLayerFolder(current, sceneID, from, to)), [edit]);
  const dissolveFolder = useCallback((folder: string, sceneID: string | null) =>
    edit(current => renameLayerFolder(current, sceneID, folder, '')), [edit]);
  const newFolder = useCallback((id: string) => {
    const owner = surfaceCollection(show, id)?.scene?.id ?? null;
    const name = unusedFolderName(show, owner);
    edit(current => createLayerFolder(current, owner, name, [id]));
    return name;
  }, [show, edit]);
  return { setFolder, renameFolder, dissolveFolder, newFolder };
}
