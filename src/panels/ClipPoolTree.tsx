import { useState, type DragEvent } from 'react';
import { AetherIcon, TreePanel, type MenuItem, type TreeControl, type TreeNode } from '@aether/ui';
import type { MapShow } from '../document';
import { clipUses, projectClips } from '../compound-clips';
import { TIMELINE_DRAG_PREFIX, timelineUses } from '../timelines';
import { POOL_DRAG_TYPE } from '../media-pool';
import { TreeContextArea } from './TreeContextArea';

const FOLDER = 'folder:';

/** The project's compound clips (the media pool), in folders. Each row says
 * where the clip plays; rows drag onto timeline tracks like media. */
export function ClipPoolTree({ show, selectedID, onSelect, onCreate, onRename, onDuplicate, onRemove, onFolder }: {
  show: MapShow; selectedID: string | null;
  onSelect: (id: string) => void; onCreate: () => void; onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void; onRemove: (id: string) => void;
  /** Moves a clip into a folder (undefined: out of any folder). */
  onFolder: (id: string, folder: string | undefined) => void;
}) {
  const [renamingID, setRenamingID] = useState<string | null>(null);
  const clips = projectClips(show);
  const folders = [...new Set(clips.flatMap(c => c.folder ? [c.folder] : []))];
  const row = (c: (typeof clips)[number]): TreeNode => {
    const n = clipUses(show, c.id).length;
    return { id: c.id, label: c.name, icon: <AetherIcon name="timeline-tracks" />, badge: n ? `${n} ${n === 1 ? 'surface' : 'surfaces'}` : 'unused' };
  };
  const nodes: TreeNode[] = [...folders.map(f => ({ id: `${FOLDER}${f}`, label: f, icon: <AetherIcon name="collection-folder" />, children: clips.filter(c => c.folder === f).map(row) })),
    ...clips.filter(c => !c.folder).map(row)];
  const inUse = (id: string) => timelineUses(show, id) > 0;
  const createItems: MenuItem[] = [
    { id: 'new', label: 'New clip', icon: <AetherIcon name="plus" />, separatorBefore: true },
    { id: 'folder', label: 'New folder', icon: <AetherIcon name="collection-folder" /> },
  ];
  const menu = (id: string): MenuItem[] => id.startsWith(FOLDER)
    ? [{ id: 'rename', label: 'Rename folder', shortcut: 'F2', icon: <AetherIcon name="notes" /> },
       { id: 'ungroup', label: 'Remove folder', icon: <AetherIcon name="delete" />, separatorBefore: true }]
    : [{ id: 'rename', label: 'Rename clip', shortcut: 'F2', icon: <AetherIcon name="notes" /> },
       { id: 'duplicate', label: 'Duplicate clip', icon: <AetherIcon name="copy" /> },
       ...(clips.find(c => c.id === id)?.folder ? [{ id: 'unfile', label: 'Move out of folder', icon: <AetherIcon name="collection-folder" /> }] : []),
       { id: 'delete', label: 'Delete clip', shortcut: 'Delete', icon: <AetherIcon name="delete" />, danger: true, separatorBefore: true, disabled: inUse(id) }];
  const newFolder = (id?: string) => {
    let n = folders.length + 1; while (folders.includes(`Folder ${n}`)) n++;
    const target = id && !id.startsWith(FOLDER) ? id : selectedID;
    if (target) onFolder(target, `Folder ${n}`);
  };
  const command = (id: string, action: string) => {
    if (action === 'new') onCreate();
    else if (action === 'folder') newFolder(id);
    else if (action === 'rename') setRenamingID(id);
    else if (action === 'duplicate') onDuplicate(id);
    else if (action === 'unfile') onFolder(id, undefined);
    else if (action === 'ungroup') clips.filter(c => `${FOLDER}${c.folder}` === id).forEach(c => onFolder(c.id, undefined));
    else if (action === 'delete' && !inUse(id)) onRemove(id);
  };
  const plus: TreeControl[] = [{ id: 'new', label: 'New clip', icon: <AetherIcon name="plus" />, onClick: onCreate }];
  // Rows carry their id as text; the pool's own drag type lets tracks take them.
  const drag = (event: DragEvent) => {
    const id = event.dataTransfer.getData('text/plain');
    if (clips.some(c => c.id === id)) { event.dataTransfer.setData(POOL_DRAG_TYPE, `${TIMELINE_DRAG_PREFIX}${id}`); event.dataTransfer.effectAllowed = 'copy'; }
  };
  return <div className="map-tree-context-area" onDragStart={drag}><TreeContextArea label="Media pool options" items={createItems} onSelect={id => command('', id)}
    shortcut={key => selectedID && command(selectedID, key === 'Delete' ? 'delete' : 'rename')}>
    <TreePanel ariaLabel="Media pool" rootInset={0} selectedIDs={new Set(selectedID ? [selectedID] : [])} nodes={nodes}
      onSelect={ids => { const id = ids.at(-1); if (id && !id.startsWith(FOLDER)) onSelect(id); }} onActivate={id => !id.startsWith(FOLDER) && onSelect(id)}
      controls={[]} headerControls={plus} controlsLabel="Media pool controls" menuLabel="Media pool options" menuItems={id => [...menu(id), ...createItems]}
      onCommand={command} onAction={command} renamingID={renamingID} onCancelRename={() => setRenamingID(null)}
      onRename={(id, name) => {
        const next = name.trim(); setRenamingID(null); if (!next) return;
        if (id.startsWith(FOLDER)) clips.filter(c => `${FOLDER}${c.folder}` === id).forEach(c => onFolder(c.id, next)); else onRename(id, next);
      }} />
  </TreeContextArea></div>;
}
