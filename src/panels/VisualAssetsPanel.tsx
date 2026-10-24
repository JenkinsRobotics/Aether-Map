import { useState } from 'react';
import { AetherIcon, MenuButton, TreePanel, type TreeNode, type MenuItem, type TreeControl } from '@aether/ui';
import type { Clip, MapShow, Surface } from '../document';
import type { Visual } from '../visual-model';
import { visualAssets } from '../visual-assets';
import { visualSource } from '../media-pool';
import { VisualThumbnail } from './SimpleVisualWorkspace';
import './VisualAssetsPanel.css';
import { TreeContextArea } from './TreeContextArea';

const ICONS = { Shader: 'palette', Text: 'text', Webcam: 'webcam', Tracker: 'tracker', Drawing: 'draw', Colour: 'palette', Media: 'file-clip', 'Test pattern': 'surface-map', Timeline: 'timeline-tracks' } as const;
const GROUP = 'group:';
const duration = (clip: Clip & { continuous?: boolean }) => {
  if (clip.continuous) return 'Loop';
  const s = Math.max(0, Math.round(clip.durationS));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** The visual list tree: front-to-back visuals with thumbnails, drag reorder,
 * hide, lock, rename, duplicate, delete and list groups. `thumbnails` gives the
 * Visual layers tab its card-like rows; the compact Clip index omits it. */
export function VisualAssetsPanel({ show, selectedID, onSelect, onChange, onRemove, onDuplicate, onMove, onDrop, onAdd, urls, thumbnails = false, ariaLabel = 'Clip index', addLabel = 'Add shader', view = 'tree', sceneID }: {
  show: MapShow; selectedID: string | null;
  onSelect: (surfaceID: string, clipID: string) => void;
  onChange: (surfaceID: string, clip: Clip) => void;
  onRemove: (surfaceID: string, clipID: string) => void;
  onDuplicate: (surface: Surface, clip: Clip) => void;
  onMove: (surfaceID: string, clipID: string, direction: -1 | 1) => void;
  onDrop: (surfaceID: string, clipID: string, targetID: string, targetClipID: string | null, after: boolean) => void;
  onAdd: () => void;
  urls?: Record<string, string>;
  thumbnails?: boolean;
  ariaLabel?: string;
  addLabel?: string;
  /** 'cards' is the Visuals tab's visual card list; 'tree' is the list tree. */
  view?: 'tree' | 'cards';
  /** Working scene: show only visuals targeting it (or untargeted ones). */
  sceneID?: string;
}) {
  const [renamingID, setRenamingID] = useState<string | null>(null);
  const targets = (asset: ReturnType<typeof visualAssets>[number]) => (asset.clip as Visual).targets ?? [];
  // Every asset of the selected timeline, treated alike: media, generators
  // and a timeline nested as an asset. Same list in both editors.
  const assets = visualAssets(show).filter(asset => !sceneID || !targets(asset).length || targets(asset).some(t => t.sceneID === sceneID));
  const selected = assets.find(asset => asset.id === selectedID);
  const folderOf = (asset: typeof selected) => (asset?.clip as Visual | undefined)?.folder;
  const locked = (asset: typeof selected) => !asset || asset.clip?.locked;
  const icon = (kind: string) => <AetherIcon name={ICONS[kind as keyof typeof ICONS] ?? 'file-clip'} />;
  const leaf = (asset: (typeof assets)[number]): TreeNode => ({
    id: asset.id, label: asset.name, category: asset.kind,
    icon: thumbnails && urls ? <VisualThumbnail source={visualSource(show, asset.clip as Visual)} show={show} urls={urls} /> : icon(asset.kind),
    badge: thumbnails ? duration(asset.clip as Visual) : undefined,
    className: thumbnails ? 'map-visual-tree-row' : undefined,
    dimmed: !asset.surface.enabled || asset.clip?.enabled === false,
    actions: [
      ...(asset.clip ? [{ id: 'visibility', label: `${asset.clip.enabled === false ? 'Show' : 'Hide'} ${asset.name}`, icon: <AetherIcon name={asset.clip.enabled === false ? 'hidden' : 'visible'} />, pinned: true }] : []),
      ...(asset.clip?.locked ? [{ id: 'lock', label: `Unlock ${asset.name}`, icon: <AetherIcon name="pin_slot" />, pinned: true }] : []),
    ],
  });
  // Groups sit where their front-most member sits. ponytail: grouping is a
  // list view only; members need not be contiguous in paint order.
  const nodes: TreeNode[] = [];
  const front = [...assets].reverse();
  for (const asset of front) {
    const folder = folderOf(asset);
    if (!folder) { nodes.push(leaf(asset)); continue; }
    if (nodes.some(node => node.id === GROUP + folder)) continue;
    const members = front.filter(a => folderOf(a) === folder);
    nodes.push({ id: GROUP + folder, label: folder, category: 'Group', icon: <AetherIcon name="folder" />,
      dimmed: members.every(a => a.clip?.enabled === false), children: members.map(leaf) });
  }
  const members = (group: string) => assets.filter(a => folderOf(a) === group.slice(GROUP.length));
  const setFolder = (asset: (typeof assets)[number], folder: string | undefined) => {
    if (!asset.clip || locked(asset)) return;
    const { folder: _old, ...rest } = asset.clip as Visual;
    onChange(asset.surface.id, (folder ? { ...rest, folder } : rest) as Clip);
  };
  const nextGroup = () => { let n = 1; while (assets.some(a => folderOf(a) === `Group ${n}`)) n++; return `Group ${n}`; };
  const select = (id: string) => { const asset = assets.find(a => a.id === id); if (asset) onSelect(asset.surface.id, asset.id); };
  const command = (id: string, action: string) => {
    if (id.startsWith(GROUP)) {
      const list = members(id);
      if (action === 'rename') setRenamingID(id);
      else if (action === 'ungroup') list.forEach(a => setFolder(a, undefined));
      else if (action === 'visibility') { const show_ = list.every(a => a.clip?.enabled === false); list.forEach(a => a.clip && !locked(a) && onChange(a.surface.id, { ...a.clip, enabled: show_ })); }
      return;
    }
    const asset = assets.find(a => a.id === id); if (!asset) return;
    if (action === 'properties') select(id);
    else if (action === 'delete' && !locked(asset)) onRemove(asset.surface.id, id);
    else if (action === 'group') { const name = nextGroup(); setFolder(asset, name); setRenamingID(GROUP + name); }
    else if (action === 'ungroup') setFolder(asset, undefined);
    else if (asset.clip) {
      if (action === 'lock') onChange(asset.surface.id, { ...asset.clip, locked: !asset.clip.locked });
      else if (action === 'visibility' && !asset.clip.locked) onChange(asset.surface.id, { ...asset.clip, enabled: asset.clip.enabled === false });
      else if ((action === 'forward' || action === 'backward') && !asset.clip.locked) onMove(asset.surface.id, id, action === 'forward' ? 1 : -1);
      else if (action === 'rename' && !asset.clip.locked) setRenamingID(id);
      else if (action === 'duplicate' && !asset.clip.locked) onDuplicate(asset.surface, asset.clip);
    }
  };
  const menu = (id: string): MenuItem[] => {
    if (id.startsWith(GROUP)) return [
      { id: 'visibility', label: members(id).every(a => a.clip?.enabled === false) ? 'Show group' : 'Hide group', icon: <AetherIcon name="visible" /> },
      { id: 'rename', label: 'Rename group', shortcut: 'F2', icon: <AetherIcon name="notes" /> },
      { id: 'ungroup', label: 'Ungroup', icon: <AetherIcon name="folder" /> },
    ];
    const asset = assets.find(a => a.id === id);
    const index = show.visuals?.findIndex(v => v.id === id) ?? -1;
    return [
      { id: 'properties', label: 'Properties', icon: <AetherIcon name="properties" /> },
      { id: 'visibility', label: asset?.clip?.enabled === false ? 'Show asset' : 'Hide asset', icon: <AetherIcon name={asset?.clip?.enabled === false ? 'hidden' : 'visible'} />, disabled: locked(asset) || !asset?.clip },
      { id: 'rename', label: 'Rename asset', shortcut: 'F2', icon: <AetherIcon name="notes" />, disabled: locked(asset) || !asset?.clip },
      { id: 'duplicate', label: 'Duplicate asset', icon: <AetherIcon name="copy" />, disabled: locked(asset) || !asset?.clip },
      folderOf(asset)
        ? { id: 'ungroup', label: 'Remove from group', icon: <AetherIcon name="folder" />, disabled: locked(asset) }
        : { id: 'group', label: 'Group', icon: <AetherIcon name="folder" />, disabled: locked(asset) || !asset?.clip },
      { id: 'forward', label: 'Move forward', icon: <AetherIcon name="arrow-up" />, disabled: locked(asset) || index < 0 || index === (show.visuals?.length ?? 0) - 1 },
      { id: 'backward', label: 'Move backward', icon: <AetherIcon name="arrow-down" />, disabled: locked(asset) || index <= 0 },
      { id: 'lock', label: asset?.clip?.locked ? 'Unlock asset' : 'Lock asset', icon: <AetherIcon name="pin_slot" />, disabled: !asset?.clip },
      { id: 'delete', label: 'Delete asset', shortcut: 'Delete', icon: <AetherIcon name="delete" />, disabled: locked(asset) },
    ];
  };
  // Header: a name and "+"; the rest is right-click (or Delete/F2 on a row).
  const controls: TreeControl[] = [{ id: 'add', label: addLabel, icon: <AetherIcon name="plus" />, onClick: onAdd }];
  const createItems = [{ id: 'list-add', label: addLabel, icon: <AetherIcon name="plus" />, separatorBefore: true }];
  const runShortcut = (key: 'Delete' | 'F2') => { const item = selected && menu(selected.id).find(entry => entry.id === (key === 'Delete' ? 'delete' : 'rename') && !entry.disabled); if (selected && item) command(selected.id, item.id); };
  if (view === 'cards') return <VisualCards ariaLabel={ariaLabel} assets={[...assets].reverse()} selectedID={selectedID}
    menu={menu} command={command} onSelect={select} locked={id => locked(assets.find(a => a.id === id))}
    detail={asset => duration(asset.clip as Visual)}
    thumbnail={asset => urls ? <VisualThumbnail source={visualSource(show, asset.clip as Visual)} show={show} urls={urls} /> : icon(asset.kind)}
    onDrop={(id, targetID, before) => { const asset = assets.find(a => a.id === id); if (asset && !locked(asset) && id !== targetID) onDrop(asset.surface.id, id, targetID, targetID, before); }} />;
  return <TreeContextArea label="Asset options" items={createItems} onSelect={onAdd} shortcut={runShortcut}><TreePanel ariaLabel={ariaLabel} nodes={nodes} rootInset={0} revealSelection
    filterOptions={Object.keys(ICONS).map(kind => ({ id: kind, label: kind }))}
    selectedIDs={new Set(selected ? [selected.id] : [])}
    canMove={(id, targetID, position) => {
      const asset = assets.find(a => a.id === id);
      if (!asset || locked(asset) || id === targetID) return false;
      if (targetID.startsWith(GROUP)) return position === 'inside';
      return position !== 'inside' && assets.some(a => a.id === targetID);
    }}
    onMove={(id, targetID, position) => {
      const asset = assets.find(a => a.id === id);
      if (!asset || locked(asset) || id === targetID) return;
      // Dropping onto a group joins it; dropping beside a visual reorders and
      // adopts that visual's group. The tree is front-to-back; the saved
      // array is back-to-front.
      if (targetID.startsWith(GROUP)) { if (position === 'inside') setFolder(asset, targetID.slice(GROUP.length)); return; }
      const target = assets.find(a => a.id === targetID);
      if (!target || position === 'inside') return;
      onDrop(asset.surface.id, id, targetID, targetID, position === 'before');
      if (folderOf(target) !== folderOf(asset)) setFolder(asset, folderOf(target));
    }}
    onSelect={ids => { const id = ids.at(-1); if (id && !id.startsWith(GROUP)) select(id); }} onActivate={id => { if (!id.startsWith(GROUP)) select(id); }}
    controls={[]} headerControls={controls} controlsLabel="Asset controls" menuLabel="Asset options" menuItems={id => [...menu(id), ...createItems]}
    onCommand={(id, action) => action === 'list-add' ? onAdd() : command(id, action)} onAction={command} renamingID={renamingID} onCancelRename={() => setRenamingID(null)}
    onRename={(id, name) => {
      const trimmed = name.trim();
      if (id.startsWith(GROUP)) { if (trimmed) members(id).forEach(a => setFolder(a, trimmed)); }
      else { const asset = assets.find(a => a.id === id); if (asset?.clip && !locked(asset)) onChange(asset.surface.id, { ...asset.clip, name }); }
      setRenamingID(null);
    }} /></TreeContextArea>;
}

type Asset = ReturnType<typeof visualAssets>[number];
/** The concept's visual card list: grip, thumbnail, name and duration, and the
 * same menu as the list tree. Drag a card onto another to reorder. */
function VisualCards({ ariaLabel, assets, selectedID, menu, command, onSelect, locked, thumbnail, detail, onDrop }: {
  ariaLabel: string; assets: Asset[]; selectedID: string | null;
  menu: (id: string) => MenuItem[]; command: (id: string, action: string) => void;
  onSelect: (id: string) => void; locked: (id: string) => boolean | undefined;
  thumbnail: (asset: Asset) => React.ReactNode;
  detail: (asset: Asset) => string;
  onDrop: (id: string, targetID: string, before: boolean) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  return <ul className="map-visual-cards" aria-label={ariaLabel}>
    {assets.map(asset => <li key={asset.id}
      className={`map-visual-card${asset.id === selectedID ? ' is-selected' : ''}${asset.clip?.enabled === false ? ' is-hidden' : ''}`}
      draggable={!locked(asset.id)} onDragStart={event => { setDragging(asset.id); event.dataTransfer.effectAllowed = 'move'; }}
      onDragEnd={() => setDragging(null)} onDragOver={event => { if (dragging && dragging !== asset.id) event.preventDefault(); }}
      onDrop={event => { event.preventDefault(); if (!dragging) return;
        const box = event.currentTarget.getBoundingClientRect(); onDrop(dragging, asset.id, event.clientY < box.top + box.height / 2); setDragging(null); }}>
      <span className="map-visual-card-grip" aria-hidden="true">⠿</span>
      <button type="button" className="map-visual-card-select" aria-label={`Select ${asset.name}`} aria-pressed={asset.id === selectedID} onClick={() => onSelect(asset.id)}>
        <span className="map-visual-card-thumb">{thumbnail(asset)}</span>
        <span className="map-visual-card-text"><strong>{asset.name}</strong><small>{detail(asset)}</small></span>
      </button>
      <MenuButton className="map-visual-card-menu" label={`Options for ${asset.name}`} items={menu(asset.id)} onSelect={action => command(asset.id, action)}>
        <AetherIcon name="more" style={{ transform: 'rotate(90deg)' }} />
      </MenuButton>
    </li>)}
  </ul>;
}
