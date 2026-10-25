import { useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { AetherIcon, IconButton, Menu, MenuButton, SegmentedControl, TextField, type MenuItem } from '@aether/ui';
import type { MapShow } from '../document';
import { projectClips } from '../compound-clips';
import { POOL_DRAG_TYPE, poolUses, removePoolAsset } from '../media-pool';
import { addBin, duplicatePoolAsset, moveToBin, poolBins, removeBin, renameBin, type PoolRef } from '../media-bins';
import { TIMELINE_DRAG_PREFIX, timelineUses } from '../timelines';
import { sourceKind } from '../surface-assets';
import { formatBytes } from '../format';
import { duplicateClip } from '../compound-clips';
import { VisualThumbnail } from './SimpleVisualWorkspace';

type View = 'list' | 'gallery';
type Sort = 'added' | 'name' | 'type';
interface Entry extends PoolRef { key: string; name: string; folder?: string; type: string; detail: string; uses: number; thumb: ReactNode }
const read = <T extends string>(key: string, fallback: T, ok: readonly T[]): T => { try { const v = localStorage.getItem(key) as T; return ok.includes(v) ? v : fallback; } catch { return fallback; } };
const keep = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* per-device convenience */ } };

/**
 * The project's Media pool (Resolve): everything already in this document —
 * imported files, generated sources and compound clips — in bins, as a list or
 * thumbnails. The gallery is where new things come from; this is what you have.
 */
// ponytail: borrows the shared Files browser's classes (aui-tab-browser*) so both side panels look alike.
export function ProjectMediaPool({ show, urls, edit, onPick, onOpenClip, onNewClip, onImport, onGallery, onRemoveClip, add, cleanup, browse }: {
  show: MapShow; urls: Record<string, string>; edit: (change: (show: MapShow) => MapShow) => void;
  /** A single pick: an asset shows its properties; a clip is picked to place. */
  onPick: (ref: PoolRef) => void; onOpenClip: (id: string) => void;
  onNewClip: (bin?: string) => void; onImport: (bin?: string) => void; onGallery: () => void; onRemoveClip: (id: string) => void;
  /** Puts an asset into what is open: "Add to clip" or "Add to scene". */
  add?: { label: string; run: (assetID: string) => void };
  /** Deletes stored files no saved show uses (hosted); ready once saved. */
  cleanup?: { ready: boolean; run: () => void };
  /** The Browse tab: what can be imported (online library, own files). */
  browse?: ReactNode;
}) {
  const [tab, setTab] = useState<'pool' | 'browse'>('pool');
  const [view, setView] = useState<View>(() => read('aether-map.media-pool.view', 'list', ['list', 'gallery']));
  const [sort, setSort] = useState<Sort>(() => read('aether-map.media-pool.sort', 'added', ['added', 'name', 'type']));
  const [bin, setBin] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [context, setContext] = useState<{ key: string | null; x: number; y: number } | null>(null);
  const bins = poolBins(show);
  const open = bin !== null && bins.includes(bin) ? bin : null;

  const entries: Entry[] = [
    ...(show.pool ?? []).map(a => {
      const media = show.media.find(m => m.id === a.source.mediaId);
      const type = media ? media.kind === 'audio' ? 'Audio' : media.kind === 'image' ? 'Image' : 'Video' : sourceKind(a.source);
      const uses = poolUses(show, a.id);
      return { kind: 'asset' as const, id: a.id, key: `asset:${a.id}`, name: a.name, folder: a.folder, type, uses,
        detail: [type, media && media.kind !== 'audio' ? `${media.width}×${media.height}` : '', media?.duration ? `${media.duration.toFixed(1)} s` : '', media ? formatBytes(media.bytes) : '', uses ? `${uses} use${uses === 1 ? '' : 's'}` : 'unused'].filter(Boolean).join(' · '),
        thumb: media?.kind === 'audio' ? <AetherIcon name="file-audio" /> : <VisualThumbnail source={a.source} show={show} urls={urls} /> };
    }),
    ...projectClips(show).map(c => {
      const uses = timelineUses(show, c.id);
      return { kind: 'clip' as const, id: c.id, key: `clip:${c.id}`, name: c.name, folder: c.folder, type: 'Clip', uses,
        detail: ['Clip', `${c.board.widthPx}×${c.board.heightPx}`, uses ? `${uses} use${uses === 1 ? '' : 's'}` : 'unused'].join(' · '), thumb: <AetherIcon name="timeline-tracks" /> };
    }),
  ];
  const q = query.trim().toLowerCase();
  const shown = entries.filter(e => q ? e.name.toLowerCase().includes(q) : (e.folder ?? null) === open)
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'type' ? a.type.localeCompare(b.type) || a.name.localeCompare(b.name) : 0);
  const byKey = (key: string) => entries.find(e => e.key === key);
  const refs = (keys: readonly string[]) => keys.flatMap(k => { const e = byKey(k); return e ? [{ kind: e.kind, id: e.id }] : []; });

  const freshBin = () => { let n = 1; while (bins.includes(`Bin ${n}`)) n++; return `Bin ${n}`; };
  const chooseView = (next: View) => { setView(next); keep('aether-map.media-pool.view', next); };
  const remove = (keys: readonly string[]) => {
    const gone = keys.map(byKey).filter((e): e is Entry => !!e && !e.uses);
    const assets = gone.filter(e => e.kind === 'asset');
    if (assets.length) edit(s => assets.reduce((next, e) => removePoolAsset(next, e.id), s));
    gone.filter(e => e.kind === 'clip').forEach(e => onRemoveClip(e.id));
    setChosen([]);
  };
  const pick = (entry: Entry, event: MouseEvent) => {
    if (event.ctrlKey || event.metaKey) { setChosen(c => c.includes(entry.key) ? c.filter(k => k !== entry.key) : [...c, entry.key]); return; }
    if (event.shiftKey && chosen.length) {
      const keys = shown.map(e => e.key), from = keys.indexOf(chosen.at(-1)!), to = keys.indexOf(entry.key);
      if (from >= 0) { setChosen(keys.slice(Math.min(from, to), Math.max(from, to) + 1)); return; }
    }
    setChosen([entry.key]); onPick(entry);
  };

  const viewItems: MenuItem[] = [
    { id: 'view', label: 'View', icon: <AetherIcon name="grid-2" />, separatorBefore: true, children: [
      { id: 'view:list', label: 'List', kind: 'radio', checked: view === 'list' },
      { id: 'view:gallery', label: 'Thumbnails', kind: 'radio', checked: view === 'gallery' }] },
    { id: 'sort', label: 'Sort by', icon: <AetherIcon name="list" />, children: [
      { id: 'sort:added', label: 'Date added', kind: 'radio', checked: sort === 'added' },
      { id: 'sort:name', label: 'Name', kind: 'radio', checked: sort === 'name' },
      { id: 'sort:type', label: 'Type', kind: 'radio', checked: sort === 'type' }] },
  ];
  const createItems: MenuItem[] = [
    { id: 'new-clip', label: 'New clip', icon: <AetherIcon name="timeline-tracks" /> },
    { id: 'new-bin', label: 'New bin', icon: <AetherIcon name="collection-folder" /> },
    { id: 'import', label: 'Import media…', icon: <AetherIcon name="import" />, separatorBefore: true },
    { id: 'gallery', label: 'Open gallery…', icon: <AetherIcon name="palette" /> },
    ...(cleanup ? [{ id: 'cleanup', label: 'Delete unused stored files', icon: <AetherIcon name="delete" />, separatorBefore: true, disabled: !cleanup.ready, disabledReason: 'Save the show first.' }] : []),
  ];
  const binMenu = (keys: readonly string[]): MenuItem => ({ id: 'move', label: keys.length > 1 ? `Move ${keys.length} items to bin` : 'Move to bin', icon: <AetherIcon name="collection-folder" />, children: [
    { id: 'bin:', label: 'Master', disabled: open === null },
    ...bins.map(b => ({ id: `bin:${b}`, label: b, disabled: b === open })),
    { id: 'bin-new', label: 'New bin', icon: <AetherIcon name="plus" />, separatorBefore: true }] });
  const itemMenu = (key: string): MenuItem[] => {
    if (key.startsWith('bin:')) return [{ id: 'open-bin', label: 'Open bin', icon: <AetherIcon name="file-folder" /> },
      { id: 'rename', label: 'Rename bin', shortcut: 'F2', icon: <AetherIcon name="notes" /> },
      { id: 'delete-bin', label: 'Delete bin', icon: <AetherIcon name="delete" />, danger: true, separatorBefore: true }];
    const keys = chosen.includes(key) ? chosen : [key];
    if (keys.length > 1) {
      const unused = keys.filter(k => !byKey(k)?.uses).length;
      return [binMenu(keys), { id: 'delete', label: `Delete ${unused} unused item${unused === 1 ? '' : 's'}`, icon: <AetherIcon name="delete" />, danger: true, separatorBefore: true, disabled: !unused }];
    }
    const e = byKey(key)!;
    return [...(e.kind === 'clip' ? [{ id: 'open-clip', label: 'Open in Content', icon: <AetherIcon name="timeline-tracks" /> }] : add ? [{ id: 'add', label: add.label, icon: <AetherIcon name="plus" /> }] : []),
      { id: 'rename', label: e.kind === 'clip' ? 'Rename clip' : 'Rename', shortcut: 'F2', icon: <AetherIcon name="notes" /> },
      { id: 'duplicate', label: 'Duplicate', icon: <AetherIcon name="copy" /> },
      binMenu(keys),
      { id: 'delete', label: 'Delete', shortcut: 'Delete', icon: <AetherIcon name="delete" />, danger: true, separatorBefore: true, disabled: e.uses > 0,
        disabledReason: e.uses ? 'Remove it from its timelines first.' : undefined }];
  };
  const run = (key: string | null, action: string) => {
    const keys = key && !key.startsWith('bin:') ? (chosen.includes(key) ? chosen : [key]) : [];
    const e = key ? byKey(key) : undefined;
    if (action === 'new-clip') onNewClip(open ?? undefined);
    else if (action === 'new-bin') edit(s => addBin(s, freshBin()));
    else if (action === 'import') onImport(open ?? undefined);
    else if (action === 'gallery') onGallery();
    else if (action === 'cleanup') cleanup?.run();
    else if (action === 'add' && e) add?.run(e.id);
    else if (action.startsWith('view:')) chooseView(action.slice(5) as View);
    else if (action.startsWith('sort:')) { setSort(action.slice(5) as Sort); keep('aether-map.media-pool.sort', action.slice(5)); }
    else if (action === 'open-bin' && key) setBin(key.slice(4));
    else if (action === 'delete-bin' && key) edit(s => removeBin(s, key.slice(4)));
    else if (action === 'rename' && key) setRenaming(key);
    else if (action === 'open-clip' && e) onOpenClip(e.id);
    else if (action === 'duplicate' && e) edit(s => e.kind === 'clip' ? duplicateClip(s, e.id) : duplicatePoolAsset(s, e.id));
    else if (action === 'bin-new') { const name = freshBin(); edit(s => moveToBin(s, refs(keys), name)); }
    else if (action.startsWith('bin:')) edit(s => moveToBin(s, refs(keys), action.slice(4) || undefined));
    else if (action === 'delete') remove(keys);
  };
  const rename = (key: string, value: string) => {
    const name = value.trim(); setRenaming(null);
    if (!name) return;
    if (key.startsWith('bin:')) { if (open === key.slice(4)) setBin(name); edit(s => renameBin(s, key.slice(4), name)); return; }
    const e = byKey(key);
    if (e?.kind === 'asset') edit(s => ({ ...s, pool: s.pool?.map(a => a.id === e.id ? { ...a, name } : a) }));
    else if (e) edit(s => ({ ...s, timelines: s.timelines?.map(t => t.id === e.id ? { ...t, name } : t) }));
  };
  const menuAt = (key: string | null) => (event: MouseEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (key && !key.startsWith('bin:') && !chosen.includes(key)) setChosen([key]);
    setContext({ key, x: event.clientX, y: event.clientY });
  };
  // Rows drag onto timeline tracks (the pool's drag type) and onto bins.
  const dragStart = (entry: Entry) => (event: DragEvent) => {
    const keys = chosen.includes(entry.key) ? chosen : [entry.key];
    event.dataTransfer.setData('application/x-aether-pool-refs', JSON.stringify(keys));
    event.dataTransfer.setData(POOL_DRAG_TYPE, entry.kind === 'clip' ? `${TIMELINE_DRAG_PREFIX}${entry.id}` : entry.id);
    event.dataTransfer.effectAllowed = 'copyMove';
  };
  const dropInto = (target: string | undefined) => ({
    onDragOver: (event: DragEvent) => { if (event.dataTransfer.types.includes('application/x-aether-pool-refs')) event.preventDefault(); },
    onDrop: (event: DragEvent) => {
      const keys = JSON.parse(event.dataTransfer.getData('application/x-aether-pool-refs') || '[]') as string[];
      if (!keys.length) return;
      event.preventDefault(); edit(s => moveToBin(s, refs(keys), target));
    },
  });
  const label = (key: string, name: string) => renaming === key
    ? <TextField aria-label={`Rename ${name}`} defaultValue={name} autoFocus onClick={e => e.stopPropagation()}
        onBlur={e => rename(key, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') rename(key, e.currentTarget.value); if (e.key === 'Escape') setRenaming(null); e.stopPropagation(); }} />
    : <strong>{name}</strong>;

  const pool = <section className="aui-tab-browser map-project-pool" data-view={view} aria-label="Media pool"
    onKeyDown={event => {
      if (event.target instanceof HTMLInputElement || !chosen.length) return;
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(chosen); }
      if (event.key === 'F2' && chosen.length === 1) { event.preventDefault(); setRenaming(chosen[0]); }
    }}>
    <header className="aui-tab-browser-head">
      <TextField aria-label="Search media pool" placeholder="Search the media pool" value={query} onChange={e => setQuery(e.target.value)} />
      <MenuButton className="aui-tab-browser-add" label="Add to the media pool" items={createItems} onSelect={id => run(null, id)}><AetherIcon name="plus" /></MenuButton>
      <span className="aui-tab-browser-views" role="group" aria-label="View">
        <IconButton label="List view" aria-pressed={view === 'list'} onClick={() => chooseView('list')}><AetherIcon name="list" /></IconButton>
        <IconButton label="Thumbnail view" aria-pressed={view === 'gallery'} onClick={() => chooseView('gallery')}><AetherIcon name="grid-2" /></IconButton>
      </span>
    </header>
    <nav className="aui-tab-browser-path" aria-label="Bin path">
      <button type="button" aria-label="Back to Master" disabled={!open} {...dropInto(undefined)} onClick={() => setBin(null)}><AetherIcon name="home" /></button>
      <AetherIcon name="chevron-right" aria-hidden="true" />
      <button type="button" disabled={!open} {...dropInto(undefined)} onClick={() => setBin(null)}>Master</button>
      {open && <><AetherIcon name="chevron-right" aria-hidden="true" /><span aria-current="page">{open}</span></>}
    </nav>
    <ul className="aui-tab-browser-items" aria-label="Media pool items" onContextMenu={menuAt(null)} onClick={event => { if (event.target === event.currentTarget) setChosen([]); }}>
      {!open && !q && bins.map(b => <li key={b} data-tab-folder={b} {...dropInto(b)} onContextMenu={menuAt(`bin:${b}`)}>
        <button type="button" className="aui-tab-browser-row" onClick={() => renaming !== `bin:${b}` && setBin(b)}>
          <span className="aui-tab-browser-thumb" data-kind="folder"><AetherIcon name="file-folder" /></span>
          <span className="aui-tab-browser-text">{label(`bin:${b}`, b)}<small>{entries.filter(e => e.folder === b).length} items</small></span>
        </button>
      </li>)}
      {shown.map(e => <li key={e.key} data-current={chosen.includes(e.key) || undefined} draggable={renaming !== e.key} onDragStart={dragStart(e)} onContextMenu={menuAt(e.key)}>
        <button type="button" className="aui-tab-browser-row" aria-pressed={chosen.includes(e.key)} title={e.detail}
          onClick={event => pick(e, event)} onDoubleClick={() => e.kind === 'clip' ? onOpenClip(e.id) : setRenaming(e.key)}>
          <span className="aui-tab-browser-thumb">{e.thumb}</span>
          <span className="aui-tab-browser-text">{label(e.key, e.name)}<small>{e.detail}</small></span>
        </button>
        <MenuButton className="aui-tab-browser-menu" label={`Options for ${e.name}`} placement="bottom-end" items={itemMenu(e.key)} onSelect={action => run(e.key, action)}><AetherIcon name="more" /></MenuButton>
      </li>)}
      {!shown.length && !(bins.length && !open && !q) && <li className="aui-tab-browser-empty">{q ? 'Nothing matches.' : open ? 'This bin is empty. Drag items here, or import into it.' : 'Import media, or right-click to make a clip or a bin.'}</li>}
    </ul>
    <Menu open={Boolean(context)} anchor={context} applicationCommands={false} ariaLabel="Media pool options"
      items={context?.key ? [...itemMenu(context.key), ...viewItems] : [...createItems, ...viewItems]}
      onSelect={action => { if (context) run(context.key, action); }} onClose={() => setContext(null)} />
  </section>;
  if (!browse) return pool;
  // The Comments widget's header: the same control, the same full-width tabs.
  return <section className="ps-review-conversation map-media" aria-label="Media">
    <SegmentedControl className="ps-review-conversation-tabs" ariaLabel="Media tabs" value={tab} onChange={value => setTab(value as 'pool' | 'browse')}
      options={[{ id: 'pool', label: 'Media pool', icon: <AetherIcon name="collection-folder" /> }, { id: 'browse', label: 'Browse', icon: <AetherIcon name="search" /> }]} />
    {tab === 'pool' ? pool : <div className="map-media-browse">{browse}</div>}
  </section>;
}
