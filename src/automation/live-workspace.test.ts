import { describe, expect, it, vi } from 'vitest';
import { maskCanvas } from '../projection-export/raster';
vi.mock('../projection-export/raster', () => ({maskCanvas:vi.fn()}));
vi.mock('@aether/ui/AgentToolResult', async importOriginal => ({...await importOriginal<object>(),agentCanvasImage:()=>({mimeType:'image/png',data:'fixture',width:1,height:1})}));
import { emptyShow, newSurface } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addPoolAsset } from '../media-pool';
import { initialHistory, pushHistory, redoHistory, undoHistory } from '../history';
import { parseShow, serializeShow } from '../show-file';
import { runCommand } from './commands';
import { mapAgentTools } from './live-commands';
import { MapAgentEditor, type MapAgentState } from './live-workspace';

function fixture() {
  const base = emptyShow();
  base.scenes[0].surfaces = [newSurface(base.output, 0)];
  let history = initialHistory(addPoolAsset(normalizeDocument(base), { mediaId: null, rect: [0, 0, 1920, 1080], fill: '#ff0000' }, 'Red'));
  let commits = 0;
  const state: MapAgentState = { contextKey: 'editor:Main', get show() { return history.present; }, writable: true, available: true,
    get canUndo() { return history.past.length > 0; }, get canRedo() { return history.future.length > 0; },
    selection: { surface_ids: [base.scenes[0].surfaces[0].id], clip_id: null, asset_id: null },
    commit: next => { commits++; history = pushHistory(history, next, null, 1); },
    undo: () => { history = undoHistory(history); }, redo: () => { history = redoHistory(history); },
  };
  const editor = new MapAgentEditor(() => state);
  const call = (name: string, args: Record<string, unknown> = {}, signal = new AbortController().signal) =>
    editor.execute('editor:Main', { id: 'call', name: 'aether_map_' + name, arguments: args }, signal);
  const scene = state.show.scenes[0], surface = scene.surfaces[0];
  const track = state.show.tracks!.find(t => !t.timelineID && t.kind === 'video')!;
  return { state, editor, call, scene, surface, track, commits: () => commits, history: () => history };
}

describe('live Map agent operations', () => {
  it('lists only implemented tools, removing saved-file authority arguments', () => {
    expect(mapAgentTools).toHaveLength(23);
    expect(new Set(mapAgentTools.map(t => t.name)).size).toBe(23);
    for (const tool of mapAgentTools) {
      expect(tool.description).toBeTruthy();
      for (const key of ['app', 'id', 'expected_revision']) expect(tool.inputSchema.properties).not.toHaveProperty(key);
    }
    expect(JSON.stringify(mapAgentTools).length).toBeLessThan(64000);
  });
  it('sets a scene hotkey in the open editor', async () => {
    const f = fixture();
    await f.call('scene_hotkey', { scene_id: f.scene.id, hotkey: 'F3' });
    expect(f.state.show.scenes.find(s => s.id === f.scene.id)?.hotkey).toBe('F3');
  });
  it('inspects unsaved content and selection in bounded pages without writing', async () => {
    const f = fixture();
    await f.call('scene_create', { name: 'Unsaved scene', width_px: 1000, height_px: 600 });
    const before = f.commits();
    expect(await f.call('show_inspect', { limit: 1 })).toMatchObject({ total: 2, next_offset: 1, counts: { scenes: 2 }, writable: true, can_undo: true });
    expect(await f.call('show_inspect', { offset: 1, limit: 1 })).toMatchObject({ items: [{ name: 'Unsaved scene' }], next_offset: null });
    expect(await f.call('show_inspect', { section: 'surfaces', scene_id: f.scene.id })).toMatchObject({ items: [{ id: f.surface.id }], selection: { surface_ids: [f.surface.id] } });
    expect(f.commits()).toBe(before);
  });
  it('creates a surface (on Main, no own timeline) as one undo step without changing output/focus', async () => {
    const f = fixture(), before = f.state.show;
    const result = await f.call('surface_create', { scene_id: f.scene.id, name: 'Front wall' }) as { created: { surface_id: string } };
    const next = f.state.show;
    expect(next.scenes[0].surfaces.at(-1)?.id).toBe(result.created.surface_id);
    // New surfaces join Main; no per-surface timeline is created.
    expect(next.timelines?.some(t => t.surfaceID === result.created.surface_id) ?? false).toBe(false);
    expect(next.outputs).toEqual(before.outputs);
    expect(next.activeSceneId).toBe(before.activeSceneId);
    expect(f.history().past).toHaveLength(1);
    await f.call('undo'); expect(f.state.show).toBe(before);
    await f.call('redo'); expect(f.state.show).toBe(next);
  });
  it('matches saved-worker bounds/rotation edits and preserves ordinary save/reopen', async () => {
    const f = fixture();
    for (const [command, args] of [
      ['surface.bounds', { scene_id: f.scene.id, surface_id: f.surface.id, x_px: 100, y_px: 200, width_px: 800, height_px: 400 }],
      ['surface.rotate', { scene_id: f.scene.id, surface_id: f.surface.id, delta_degrees: 15 }],
    ] as const) {
      const saved = runCommand('map.' + command, new TextDecoder().decode(serializeShow(f.state.show)), args);
      await f.call(command.replaceAll('.', '_'), args);
      expect(parseShow(serializeShow(f.state.show))).toEqual(parseShow(saved.content!));
    }
    expect(f.history().past).toHaveLength(2);
  });
  it('places an asset, evaluates actual composition, moves and splits its clip with normal undo', async () => {
    const f = fixture();
    const placement = await f.call('asset_place', { asset_id: f.state.show.pool![0].id, track_id: f.track.id, start_s: 2 }) as { created: { clip_id: string } };
    const clip = placement.created.clip_id;
    expect(await f.call('show_evaluate', { scene_id: f.scene.id, time_s: 3 })).toMatchObject({ pixel_preview: false, total_layers: 1, layers: [{ kind: 'fill' }] });
    await f.call('clip_move', { clip_id: clip, track_id: f.track.id, start_s: 4 });
    const beforeSplit = f.state.show;
    await f.call('clip_edit', { clip_id: clip, action: 'split', time_s: 6 });
    expect(f.state.show.visuals!.filter(v => v.assetID === f.state.show.pool![0].id)).toHaveLength(2);
    await f.call('undo'); expect(f.state.show).toBe(beforeSplit);
    await f.call('redo'); expect(f.state.show.visuals!.find(v => v.id === clip)?.durationS).toBe(2);
  });
  it.each([
    ['surface_create', { scene_id: 'x', name: 'Name', id: 'other-file' }],
    ['scene_create', { name: 'Scene', width_px: NaN, height_px: 100 }],
    ['scene_create', { name: 'Scene', width_px: 1.5, height_px: 100 }],
    ['surface_bounds', { x_px: 0 }],
    ['show_inspect', { limit: 26 }],
    ['show_inspect', { offset: -1 }],
    ['undo', { ignored: true }],
    ['play', {}],
  ])('rejects malformed or unavailable %s calls before mutation', async (name, args) => {
    const f = fixture(), before = f.state.show;
    await expect(f.call(name as string, args as Record<string, unknown>)).rejects.toThrow();
    expect(f.state.show).toBe(before); expect(f.commits()).toBe(0);
  });
  it('allows read-only inspection/evaluation but refuses editing and history', async () => {
    const f = fixture(); f.state.writable = false;
    expect(await f.call('show_inspect')).toMatchObject({ writable: false });
    await f.call('show_evaluate', { scene_id: f.scene.id, time_s: 0 });
    for (const [name, args] of [['undo', {}], ['scene_create', { name: 'Test', width_px: 100, height_px: 100 }]] as const)
      await expect(f.call(name, args)).rejects.toThrow('read-only');
    expect(f.commits()).toBe(0);
  });
  it('refuses a locked surface, locked placement track and locked clip', async () => {
    const f = fixture(); f.surface.locked = true;
    await expect(f.call('surface_rotate', { scene_id: f.scene.id, surface_id: f.surface.id, delta_degrees: 10 })).rejects.toThrow('locked');
    f.track.locked = true;
    await expect(f.call('asset_place', { asset_id: f.state.show.pool![0].id, track_id: f.track.id, start_s: 0 })).rejects.toThrow('refused');
    f.track.locked = false;
    await f.call('asset_place', { asset_id: f.state.show.pool![0].id, track_id: f.track.id, start_s: 0 });
    const clip = f.state.show.visuals!.at(-1)!; clip.locked = true;
    await expect(f.call('clip_edit', { clip_id: clip.id, action: 'delete' })).rejects.toThrow('locked');
    expect(f.commits()).toBe(1);
  });
  it('rejects cancelled, stale-document/branch, active-gesture and unavailable-history calls', async () => {
    const f = fixture(), abort = new AbortController(); abort.abort();
    await expect(f.call('show_inspect', {}, abort.signal)).rejects.toThrow();
    f.state.contextKey = 'editor:Other branch';
    await expect(f.call('show_inspect')).rejects.toThrow('changed');
    f.state.contextKey = 'editor:Main'; f.state.available = false;
    await expect(f.call('undo')).rejects.toThrow('Finish');
    f.state.available = true;
    await expect(f.call('undo')).rejects.toThrow('No edit');
    expect(f.commits()).toBe(0);
  });
  it('checks current authority again immediately before committing', async () => {
    const f = fixture(); let reads = 0;
    const editor = new MapAgentEditor(() => { if (++reads === 2) f.state.writable = false; return f.state; });
    await expect(editor.execute(f.state.contextKey, { id: 'x', name: 'aether_map_surface_create', arguments: { scene_id: f.scene.id, name: 'Test' } }, new AbortController().signal)).rejects.toThrow('changed');
    expect(f.commits()).toBe(0);
  });
});

it('preview is explicitly a calibration mask and is available in read-only shows without edits', async () => {
  const f=fixture();f.state.writable=false;
  vi.mocked(maskCanvas).mockResolvedValue({} as HTMLCanvasElement);
  const before=f.state.show;
  expect(await f.call('mapping_preview',{scene_id:f.scene.id})).toMatchObject({type:'aether.tool-content',value:{kind:'mapping_mask',changed:false,excludes:['shaders','media','text','audio','backdrop']}});
  expect(f.state.show).toBe(before);expect(f.commits()).toBe(0);
  await expect(f.call('mapping_preview',{scene_id:'missing'})).rejects.toThrow('Scene not found');
  await expect(f.call('mapping_preview',{scene_id:f.scene.id,url:'https://example.test'})).rejects.toThrow('Unknown argument');
});
it('a pending mask from a changed document or cancelled turn is never delivered', async () => {
  for(const cancel of [false,true]) {
    const f=fixture(),controller=new AbortController();let finish!:(canvas:HTMLCanvasElement)=>void;
    vi.mocked(maskCanvas).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=f.call('mapping_preview',{scene_id:f.scene.id},controller.signal);
    if(cancel)controller.abort();else f.state.contextKey='other';
    finish({} as HTMLCanvasElement);
    await expect(pending).rejects.toThrow();expect(f.commits()).toBe(0);
  }
});

it('creates all cube faces, poses and turns inside-out through the same saved/live path with undo',async()=>{
 const f=fixture();const created=await f.call('surface_create',{scene_id:f.scene.id,name:'Sculpture',shape:'cube'}) as {created:{surface_id:string;surface_ids:string[]}};
 expect(created.created.surface_ids).toHaveLength(3);expect(f.history().past).toHaveLength(1);
 expect(await f.call('show_inspect',{section:'surfaces',scene_id:f.scene.id})).toMatchObject({items:[{},...Array.from({length:3},()=>({folder:'Sculpture',group_shape:'cube'}))]});
 for(const delta of [{mode:'rotate',x_degrees:12,z_degrees:3},{mode:'inside-out'}] as const){
  const before=f.state.show,args={scene_id:f.scene.id,surface_id:created.created.surface_id,...delta};
  const saved=runCommand('map.cube.pose',new TextDecoder().decode(serializeShow(before)),args);
  const result=await f.call('cube_pose',args) as {changed_surface_ids:string[]};
  expect(result.changed_surface_ids).toEqual(created.created.surface_ids);
  const after=f.state.show;expect(parseShow(serializeShow(after))).toEqual(parseShow(saved.content!));
  await f.call('undo');expect(f.state.show).toBe(before);await f.call('redo');expect(f.state.show).toBe(after);
 }
 f.state.writable=false;await expect(f.call('cube_pose',{scene_id:f.scene.id,surface_id:created.created.surface_id,mode:'inside-out'})).rejects.toThrow('read-only');
});
it('refuses invalid compound edits and discovery exposes the exact validated schema',async()=>{
 const f=fixture();await f.call('surface_create',{scene_id:f.scene.id,name:'Unique cube',shape:'cube'});
 const cube=f.state.show.scenes[0].surfaces.find(s=>s.groupShape==='cube')!,before=f.state.show;
 await expect(f.call('surface_create',{scene_id:f.scene.id,name:'Unique cube',shape:'cube'})).rejects.toThrow('unique name');
 for(const delta of [{mode:'rotate'}, {mode:'inside-out',x_degrees:0},{mode:'rotate',y_degrees:Infinity},{mode:'rotate',z_degrees:181},{mode:'invalid'}])
  await expect(f.call('cube_pose',{scene_id:f.scene.id,surface_id:cube.id,...delta})).rejects.toThrow();
 expect(f.state.show).toBe(before);expect(await f.call('agent_docs',{name:'map.cube.pose'})).toMatchObject({items:[{id:'map.cube.pose',inputSchema:{required:['scene_id','surface_id','mode']}}]});
});

it('surface automation uses the saved operation and keeps one ordinary Undo step', async()=>{
 const f=fixture(),before=f.state.show,args={scene_id:f.scene.id,surface_id:f.surface.id,changes_json:JSON.stringify({animation:{radiusPx:[{timeS:0,value:0},{timeS:4,value:100}]},modulation:{opacity:{source:'audio',range:{min:.1,max:1}}}})};
 const saved=runCommand('map.surface.animate',new TextDecoder().decode(serializeShow(before)),args);
 await f.call('surface_animate',args);expect(parseShow(serializeShow(f.state.show))).toEqual(parseShow(saved.content!));
 expect(f.history().past).toHaveLength(1);expect(await f.call('show_inspect',{section:'surfaces'})).toMatchObject({items:[{animation:{radiusPx:[{timeS:0},{timeS:4}]}}]});
 await f.call('undo');expect(f.state.show).toBe(before);await f.call('redo');expect(f.state.show.version).toBe(12);
 f.state.show.scenes[0].surfaces[0].locked=true;await expect(f.call('surface_animate',args)).rejects.toThrow('locked');
});
