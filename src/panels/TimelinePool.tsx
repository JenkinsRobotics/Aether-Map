import { useState } from 'react';
import { AetherIcon, Button, Dialog, FieldRow, Menu, TextField } from '@aether/ui';
import { activeScene, type MapShow } from '../document';
import { canNestTimeline, currentTimelineID, MAIN_TIMELINE, TIMELINE_DRAG_PREFIX, timelineUses } from '../timelines';
import { POOL_DRAG_TYPE } from '../media-pool';

export interface TimelinePoolActions {
  onOpen: (id: string) => void;
  onSelect?: (id:string)=>void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onAppend: (id: string) => void;
}
/** Timeline entries use the same Media Pool cards and drag contract as media. */
export function TimelinePool({ show, query, actions }: { show: MapShow; query: string; actions: TimelinePoolActions }) {
  const [dialog, setDialog] = useState<{ kind: 'new' | 'rename' | 'delete'; id?: string; name: string } | null>(null);
  const [context, setContext] = useState<{ id: string; x: number; y: number } | null>(null);
  const advanced = show.timelineMode === 'advanced';
  const entries = [{ id: MAIN_TIMELINE, name: 'Main', durationS: activeScene(show).durationS }, ...(show.timelines ?? []).filter(t => t.sceneID === show.activeSceneId && (advanced || t.surfaceID))];
  const target = entries.find(t => t.id === context?.id);
  const boundSurface = show.timelines?.find(t => t.id === target?.id)?.surfaceID;
  const submit = () => {
    if (!dialog) return;
    if (dialog.kind === 'new') actions.onCreate(dialog.name.trim());
    else if (dialog.kind === 'rename') actions.onRename(dialog.id!, dialog.name.trim());
    else actions.onRemove(dialog.id!);
    setDialog(null);
  };
  return <>
    <div className="map-pool-timeline-heading"><strong>Timelines</strong>{advanced && <Button onClick={() => setDialog({ kind:'new', name:`Timeline ${(show.timelines?.length ?? 0) + 1}` })}><AetherIcon name="plus" />New timeline</Button>}</div>
    {entries.filter(t => t.name.toLowerCase().includes(query.toLowerCase())).map(t => <button type="button" key={t.id} className="map-pool-item" aria-label={`Timeline: ${t.name}`} aria-pressed={currentTimelineID(show) === t.id}
      draggable={advanced && canNestTimeline(show, t.id)}
      onDragStart={e => { e.dataTransfer.setData(POOL_DRAG_TYPE, `${TIMELINE_DRAG_PREFIX}${t.id}`); e.dataTransfer.effectAllowed = 'copy'; }}
      onClick={() => actions.onSelect?.(t.id)} onDoubleClick={() => actions.onOpen(t.id)} onKeyDown={e => { if (e.key === 'Enter') actions.onOpen(t.id); }}
      onContextMenu={e => { e.preventDefault(); setContext({ id:t.id, x:e.clientX, y:e.clientY }); }}
      title={`${t.name} · ${t.durationS}s · Double-click to open`}>
      <span className="map-pool-thumbnail"><AetherIcon name="timeline-tracks" /></span><span className="map-pool-name">{t.name}</span><small>{t.id === MAIN_TIMELINE ? 'Main timeline' : 'Timeline'}</small>
    </button>)}
    <Menu open={!!target} anchor={context} ariaLabel="Timeline asset actions" onClose={() => setContext(null)} items={target ? [
      { id:'open', label:'Open timeline', heading:target.name },
      ...(advanced ? [
      { id:'append', label:'Append timeline to current track', disabled:!advanced || !canNestTimeline(show, target.id) },
      { id:'rename', label:'Rename timeline', separatorBefore:true, disabled:target.id === MAIN_TIMELINE },
      { id:'delete', label:'Delete timeline', danger:true, disabled:target.id === MAIN_TIMELINE || !!boundSurface || timelineUses(show, target.id) > 0, disabledReason:boundSurface ? 'This timeline belongs to a mapped surface.' : 'Remove scheduled uses first.' },
      ] : []),
    ] : []} onSelect={id => {
      if (!target) return;
      if (id === 'open') actions.onOpen(target.id);
      else if (id === 'append') actions.onAppend(target.id);
      else setDialog({ kind:id === 'rename' ? 'rename' : 'delete', id:target.id, name:target.name });
      setContext(null);
    }} />
    <Dialog open={!!dialog} title={dialog?.kind === 'new' ? 'New timeline' : dialog?.kind === 'rename' ? 'Rename timeline' : 'Delete timeline'} onClose={() => setDialog(null)} actions={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button primary disabled={!dialog?.name.trim()} onClick={submit}>{dialog?.kind === 'delete' ? 'Delete' : dialog?.kind === 'new' ? 'Create' : 'Save'}</Button></>}>
      {dialog?.kind === 'delete' ? <p>Delete {dialog.name} and its tracks and clips? Media stays in the pool. You can undo this change.</p> : <FieldRow label="Name"><TextField aria-label="Timeline name" value={dialog?.name ?? ''} onChange={e => setDialog(d => d && ({ ...d, name:e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && dialog?.name.trim()) submit(); }} /></FieldRow>}
    </Dialog>
  </>;
}
