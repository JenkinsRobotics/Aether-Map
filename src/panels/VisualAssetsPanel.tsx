import { useState } from 'react';
import { AetherIcon, TreePanel, type TreeNode, type MenuItem, type TreeControl } from '@aether/ui';
import type { Clip, MapShow, Surface } from '../document';
import { visualAssets } from '../visual-assets';

const ICONS = { Shader: 'palette', Text: 'text', Webcam: 'webcam', Tracker: 'tracker', Drawing: 'draw', Colour: 'palette', Media: 'file-clip', 'Test pattern': 'surface-map' } as const;

export function VisualAssetsPanel({ show, selectedID, onSelect, onChange, onRemove, onDuplicate, onMove, onDrop, onAdd }: {
  show: MapShow; selectedID: string | null;
  onSelect: (surfaceID: string, clipID: string) => void;
  onChange: (surfaceID: string, clip: Clip) => void;
  onRemove: (surfaceID: string, clipID: string) => void;
  onDuplicate: (surface: Surface, clip: Clip) => void;
  onMove: (surfaceID: string, clipID: string, direction: -1 | 1) => void;
  onDrop: (surfaceID: string, clipID: string, targetID: string, targetClipID: string | null, after: boolean) => void;
  onAdd: () => void;
}) {
  const [renamingID, setRenamingID] = useState<string | null>(null);
  const assets = visualAssets(show), selected = assets.find(asset => asset.id === selectedID);
  const locked = (asset: typeof selected) => !asset || asset.clip?.locked;
  const icon = (kind: string) => <AetherIcon name={ICONS[kind as keyof typeof ICONS] ?? 'file-clip'} />;
  const nodes: TreeNode[] = [...assets].reverse().map(asset => ({
    id: asset.id, label: asset.name, category: asset.kind,
    icon: icon(asset.kind), dimmed: !asset.surface.enabled || asset.clip?.enabled === false,
    status: [{ id: 'target', label: asset.target, icon: <AetherIcon name="link" /> },
      ...(!asset.clip ? [{ id: 'continuous', label: 'Continuous', icon: <AetherIcon name="history" /> }] : [])],
    actions: [
      ...(asset.clip ? [{ id: 'visibility', label: `${asset.clip.enabled === false ? 'Show' : 'Hide'} ${asset.name}`, icon: <AetherIcon name={asset.clip.enabled === false ? 'hidden' : 'visible'} />, pinned: true }] : []),
      ...(asset.clip?.locked ? [{ id: 'lock', label: `Unlock ${asset.name}`, icon: <AetherIcon name="pin_slot" />, pinned: true }] : []),
    ],
  }));
  const select = (id: string) => { const asset = assets.find(a => a.id === id); if (asset) onSelect(asset.surface.id, asset.id); };
  const command = (id: string, action: string) => {
    const asset = assets.find(a => a.id === id); if (!asset) return;
    if (action === 'properties') select(id);
    else if (action === 'delete' && !locked(asset)) onRemove(asset.surface.id, id);
    else if (asset.clip) {
      if (action === 'lock') onChange(asset.surface.id, { ...asset.clip, locked: !asset.clip.locked });
      else if (action === 'visibility' && !asset.clip.locked) onChange(asset.surface.id, { ...asset.clip, enabled: asset.clip.enabled === false });
      else if ((action === 'forward' || action === 'backward') && !asset.clip.locked) onMove(asset.surface.id, id, action === 'forward' ? 1 : -1);
      else if (action === 'rename' && !asset.clip.locked) setRenamingID(id);
      else if (action === 'duplicate' && !asset.clip.locked) onDuplicate(asset.surface, asset.clip);
    }
  };
  const menu = (id: string): MenuItem[] => {
    const asset = assets.find(a => a.id === id);
    const index = show.visuals?.findIndex(v => v.id === id) ?? -1;
    return [
      { id: 'properties', label: 'Properties', icon: <AetherIcon name="properties" /> },
      { id: 'visibility', label: asset?.clip?.enabled === false ? 'Show asset' : 'Hide asset', icon: <AetherIcon name={asset?.clip?.enabled === false ? 'hidden' : 'visible'} />, disabled: locked(asset) || !asset?.clip },
      { id: 'rename', label: 'Rename asset', shortcut: 'F2', icon: <AetherIcon name="notes" />, disabled: locked(asset) || !asset?.clip },
      { id: 'duplicate', label: 'Duplicate asset', icon: <AetherIcon name="copy" />, disabled: locked(asset) || !asset?.clip },
      { id: 'forward', label: 'Move forward', icon: <AetherIcon name="arrow-up" />, disabled: locked(asset) || index < 0 || index === (show.visuals?.length ?? 0) - 1 },
      { id: 'backward', label: 'Move backward', icon: <AetherIcon name="arrow-down" />, disabled: locked(asset) || index <= 0 },
      { id: 'lock', label: asset?.clip?.locked ? 'Unlock asset' : 'Lock asset', icon: <AetherIcon name="pin_slot" />, disabled: !asset?.clip },
      { id: 'delete', label: 'Delete asset', shortcut: 'Delete', icon: <AetherIcon name="delete" />, disabled: locked(asset) },
    ];
  };
  const controls: TreeControl[] = [
    { id: 'add', label: 'Add shader', icon: <AetherIcon name="new" />, onClick: onAdd },
    ...menu(selectedID ?? '').map(item => ({ id: item.id, label: item.label, icon: item.icon, disabled: !selected || item.disabled,
      shortcut: item.id === 'rename' ? 'F2' as const : item.id === 'delete' ? 'Delete' as const : undefined,
      onClick: () => selected && command(selected.id, item.id) })),
  ];
  return <TreePanel ariaLabel="Clip index" nodes={nodes} rootInset={0} revealSelection
    filterOptions={Object.keys(ICONS).map(kind => ({ id: kind, label: kind }))}
    selectedIDs={new Set(selected ? [selected.id] : [])}
    canMove={(id, targetID, position) => id !== targetID && position !== 'inside'
      && !locked(assets.find(a => a.id === id)) && assets.some(a => a.id === targetID)}
    onMove={(id, targetID, position) => {
      const asset = assets.find(a => a.id === id);
      if (!asset || locked(asset) || position === 'inside' || id === targetID || !assets.some(a => a.id === targetID)) return;
      // The tree is front-to-back; the saved/rendered array is back-to-front.
      onDrop(asset.surface.id, id, targetID, targetID, position === 'before');
    }}
    onSelect={ids => { const id = ids.at(-1); if (id) select(id); }} onActivate={select}
    controls={controls} controlsLabel="Asset controls" menuLabel="Asset options" menuItems={menu}
    onCommand={command} onAction={command} renamingID={renamingID} onCancelRename={() => setRenamingID(null)}
    onRename={(id, name) => { const asset = assets.find(a => a.id === id); if (asset?.clip && !locked(asset)) onChange(asset.surface.id, { ...asset.clip, name }); setRenamingID(null); }} />;
}
