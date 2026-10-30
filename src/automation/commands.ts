import { newOutput } from '../document';
import { isHotkey, type Hotkey } from '../scene-hotkeys';
import { editSurfaceAutomation } from '../features/surface-automation';
import { SURFACE_PARAMETERS, surfaceParameterBase } from '../features/surface-parameters';
import { jsonObject } from '../ai/catalog';
import { VISUAL_LOOK_SLOTS,hasVisualLook } from '../visual-looks';
import { sourceParameters } from '../source-motion';
import { poseCube } from '../cube-pose';
import { shaderAt, shaderTimeS } from '../features/shader-motion';
import { effectValueAt } from '../features/effect-motion';
/** Saved-document automation. UI and agents use the same parser, edits and evaluator. */
import { placeAsset, type PlacementArguments } from './placement';
import { editGeometry, type GeometryArguments } from './geometry';
import { createInShow, type CreationArguments } from './authoring';
import { addShowClip, addShowCue, describeShowTimeline } from './show-commands';
import { activeShow } from '../show-timeline';
import { sceneLayers, type MapShow, type MediaRef, type Surface } from '../document';
import { parseShow, serializeShow } from '../show-file';
import { clipEditable, editTimelineClip, moveTimelineClip, type ClipAction } from '../timeline-edit';
import { sceneVisuals } from '../visual-render';
import { timelineAudio } from '../timeline-audio';
import { MAIN_TIMELINE } from '../timelines';
import { visualSource } from '../media-pool';
import { normalizeDocument as normalize } from '../normalize-document';
import { validateCommand } from '../ai/catalog';
import { mapKnowledge } from '../ai/knowledge';
import { runProgram } from '../ai/program';
import { verifyShow } from '../ai/proof';
import { createAgentVisual, editAgentVisual } from '../ai/visuals';

export interface Arguments extends CreationArguments, GeometryArguments, PlacementArguments {
  [key: string]: unknown;
  scene_id?: string; time_s?: number; clip_id?: string; track_id?: string;
  start_s?: number; action?: ClipAction;
  mode?: 'rotate' | 'inside-out' | 'loop' | 'once' | 'continuous' | string; x_degrees?: number; y_degrees?: number; z_degrees?: number;
}
export function sourceSummary(source: Surface['source'],media?:MediaRef) {
  return { kind: source.text ? 'text' : source.shader ? 'shader' : source.webcam ? 'webcam'
    : source.tracker ? 'tracker' : source.drawing ? 'drawing' : source.mediaId ? 'media' : 'fill',
  media_id: source.mediaId, fill: source.fill,
  source_parameters:Object.fromEntries(sourceParameters(source,media).map(p=>[p.key,p.base])),
  source_parameter_specs:sourceParameters(source,media).map(({key,label,min,max,step,unit,options})=>({key,label,min,max,step,unit,...(options?{options,interpolation:'hold'}:{})})), source_motion:source.motion,
  ...(source.shader ? { shader: structuredClone(source.shader) } : {}),
  ...(source.text ? { text: source.text.text.slice(0, 500), text_size_px: source.text.sizePx } : {}) };
}
export function surfaceAutomationSummary(surface: Surface) {
  return { surface_parameters: Object.fromEntries(SURFACE_PARAMETERS.map(p=>[p.key,surfaceParameterBase(surface,p.key)])),
    surface_parameter_specs: SURFACE_PARAMETERS, animation: surface.animation, modulation: surface.modulation, bend_axis: surface.bend?.axis ?? 'horizontal' };
}
function describe(show: MapShow) {
  return {
    version: show.version, active_scene_id: show.activeSceneId,
    scenes: show.scenes.map(s => ({ id: s.id, name: s.name, duration_s: s.durationS,
      suppressed: !!s.suppressed, artboard: s.artboard, hotkey: s.hotkey ?? null,
      surfaces: s.surfaces.map(p => ({ id: p.id, name: p.name, enabled: p.enabled, locked: !!p.locked, corners: p.corners, folder: p.folder, group_shape: p.groupShape, ...surfaceAutomationSummary(p) })) })),
    timelines: show.timelines ?? [], tracks: show.tracks ?? [],
    show: describeShowTimeline(show),
    assets: (show.pool ?? []).map(a => ({ id: a.id, name: a.name, ...sourceSummary(a.source,show.media.find(m=>m.id===a.source.mediaId)) })),
    clips: (show.visuals ?? []).map(v => ({ id: v.id, name: v.name, track_id: v.trackID,
      asset_id: v.assetID, timeline_id: v.timelineRefID, targets: v.targets,
      start_s: v.startS, duration_s: v.durationS, in_s: v.inS, loop: v.loop,
      continuous: !!v.continuous, enabled: v.enabled !== false, locked: !!v.locked,
      opacity: v.opacity, mapping: v.mapping, presets:VISUAL_LOOK_SLOTS.filter(slot=>hasVisualLook(show,v,slot)).map(slot=>({slot,kind:v.looks?.[slot]&&!v.looks[slot]!.shaderOnly?'visual':'legacy_shader',media_id:v.looks?.[slot]?.source.mediaId??null})), effects: v.effects, placement: v.placement, motion: v.motion,
      ...sourceSummary(visualSource(show, v),show.media.find(m=>m.id===visualSource(show,v).mediaId)) })),
  };
}
function finiteTime(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 604800)
    throw new Error('Time must be between zero and 604800 seconds.');
}

export function runCommand(command: string, content: string, args: Arguments) {
  // Match opening a file in Map. Inspection never saves these migrations.
  const show = normalize(parseShow(content));
  const { document, result } = runDocumentCommand(command, show, args);
  return { result, ...(document ? { content: new TextDecoder().decode(serializeShow(document)) } : {}) };
}

/** One mutation/evaluation path for saved workers and the live editor. No IO or history. */
export function runDocumentCommand(command: string, show: MapShow, args: Arguments): {
  result: Record<string, unknown>; document?: MapShow;
} {
  validateCommand(command, args);
  if (command === 'map.agent.docs') return { result: mapKnowledge(args) };
  if (command === 'map.show.runprogram') return runProgram(show, args.program_json, runDocumentCommand);
  if (command === 'map.show.verify') return { result: verifyShow(show, runDocumentCommand('map.show.evaluate', show, args).result) };
  if (command === 'map.visual.create' || command === 'map.visual.edit') {
    const created = command === 'map.visual.create' ? createAgentVisual(show, args) : undefined;
    const next = normalize(created?.show ?? editAgentVisual(show, args));
    parseShow(serializeShow(next));
    return { document: next, result: { ...(created ? { created: created.created } : { clip_id: args.clip_id }), ...describe(next) } };
  }
  if (command === 'map.surface.animate') {
    const scene = show.scenes.find(s=>s.id===args.scene_id);
    const surface = scene?.surfaces.find(s=>s.id===args.surface_id);
    if (!surface) throw Error('Surface not found. Inspect the show first.');
    const edited = editSurfaceAutomation(surface,jsonObject(args.changes_json));
    const next = normalize({...show,scenes:show.scenes.map(s=>s===scene?{...s,surfaces:s.surfaces.map(p=>p===surface?edited:p)}:s)});
    parseShow(serializeShow(next));
    return { document:next, result:{surface_id:surface.id,...surfaceAutomationSummary(edited)} };
  }
  if (command === 'map.show.inspect') return { result: describe(show) };
  if (command === 'map.output.player') {
    if (!show.scenes.some(s => s.id === args.scene_id)) throw Error('Scene not found. Inspect the show first.');
    const deviceID = String(args.device_id ?? ''), name = String(args.name ?? '').trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(deviceID)) throw Error('device_id must be a paired player ID.');
    if (!name || name.length > 80) throw Error('Name the output in 1–80 characters.');
    // One output per player: a second routing moves it rather than adding another.
    const existing = show.outputs.find(o => o.kind === 'edge' && o.deviceId === deviceID);
    const outputs = existing
      ? show.outputs.map(o => o === existing ? { ...o, name, sceneId: args.scene_id as string } : o)
      : [...show.outputs, { ...newOutput(name, args.scene_id as string, 'edge'), deviceId: deviceID }];
    const next = normalize({ ...show, outputs });
    parseShow(serializeShow(next));
    return { result: describe(next), document: next };
  }
  if (command === 'map.show.playback') {
    if (!['loop', 'once', 'continuous'].includes(args.mode as string)) throw Error('Playback must be loop, once or continuous.');
    const next = normalize({ ...show, playback: { mode: args.mode as MapShow['playback']['mode'] } });
    return { result: describe(next), document: next };
  }
  if (command === 'map.show.clip.add' || command === 'map.show.cue.add') {
    const next = normalize(command === 'map.show.clip.add' ? addShowClip(show, args) : addShowCue(show, args));
    parseShow(serializeShow(next));
    const timeline = activeShow(next)!;
    const created = command === 'map.show.clip.add' ? { clip_id: timeline.tracks.flatMap(t => t.clips).at(-1)!.id } : { cue_id: timeline.cues.at(-1)!.id };
    return { document: next, result: { created, show: describeShowTimeline(next) } };
  }
  if (command === 'map.show.evaluate') {
    finiteTime(args.time_s);
    if (!show.scenes.some(s => s.id === args.scene_id)) throw new Error('Scene not found.');
    // A saved editor tab is not an output selection: evaluate Main for the requested scene.
    const output = { ...show, activeSceneId: args.scene_id!, activeTimelineID: MAIN_TIMELINE, mix: undefined };
    const layers = sceneLayers(output).flatMap(({ scene, opacity }) => sceneVisuals(output, scene, args.time_s!)
      .map(s => ({ id: s.id, name: s.name, opacity: opacity * s.opacity, corners: s.corners,
        masks: s.masks, radius_px:s.radiusPx, bend:s.bend, media_time_s: s.mediaTimeS, placement: s.visualPlacement, ...sourceSummary(s.source,show.media.find(m=>m.id===s.source.mediaId)),
        ...(s.source.shader ? { evaluated_shader:shaderAt(s.source.shader,shaderTimeS(s.source.shader.time,s.mediaTimeS),undefined,undefined,show.lfos,args.time_s).parameters } : {}),
        effects:(s.source.effects ?? []).filter(e=>e.enabled).map(e=>({id:e.id,kind:e.kind,amount:effectValueAt(e,s.mediaTimeS,args.time_s,undefined,undefined,show.lfos)})) })));
    return { result: { scene_id: args.scene_id, time_s: args.time_s, evaluation: 'scene-composition',
      pixel_preview: false, live_inputs:'Audio, MIDI and body tracking are zero in saved evaluation.', blackout: !!show.output.blackout, layers, audio: timelineAudio(output, args.time_s) } };
  }
  if (command === 'map.scene.create' || command === 'map.surface.create' || command === 'map.asset.place') {
    const created = command === 'map.asset.place' ? placeAsset(show, args) : createInShow(command, show, args);
    const next = normalize(created.show);
    const serialized = new TextDecoder().decode(serializeShow(next));
    parseShow(serialized);
    return { result: { ...describe(next), created: created.created }, document: next };
  }
  if (command === 'map.scene.hotkey') {
    if (!show.scenes.some(s => s.id === args.scene_id)) throw Error('Scene not found. Inspect the show first.');
    if (args.hotkey !== 'none' && !isHotkey(args.hotkey)) throw Error('Hotkey must be F1–F12 or none.');
    // One key, one scene: assigning it here takes it from any other scene.
    const next = normalize({ ...show, scenes: show.scenes.map(({ hotkey, ...s }) =>
      s.id === args.scene_id ? (args.hotkey === 'none' ? s : { ...s, hotkey: args.hotkey as Hotkey }) : hotkey && hotkey !== args.hotkey ? { ...s, hotkey } : s) });
    parseShow(serializeShow(next));
    return { result: describe(next), document: next };
  }
  if (command === 'map.cube.pose') {
    const scene = show.scenes.find(s => s.id === args.scene_id);
    if (!scene?.surfaces.some(s => s.id === args.surface_id)) throw Error('Cube face not found in the specified scene.');
    const angles = [args.x_degrees, args.y_degrees, args.z_degrees];
    if (args.mode === 'inside-out' && angles.some(v => v !== undefined)) throw Error('Inside-out takes no rotation angles.');
    if (args.mode === 'rotate' && !angles.some(v => v)) throw Error('Supply at least one nonzero angle in degrees.');
    const next = normalize(poseCube(show, args.surface_id!, { insideOut: args.mode === 'inside-out', xDegrees: args.x_degrees, yDegrees: args.y_degrees, zDegrees: args.z_degrees }));
    parseShow(serializeShow(next));
    const changedIDs = next.scenes.flatMap(s => s.surfaces.filter(surface => {
      const before = show.scenes.find(old => old.id === s.id)?.surfaces.find(old => old.id === surface.id);
      return JSON.stringify(surface) !== JSON.stringify(before);
    }).map(s => s.id));
    return { result: { ...describe(next), changed_surface_ids: changedIDs }, document: next };
  }
  if (command === 'map.surface.bounds' || command === 'map.surface.rotate') {
    const changed = editGeometry(command, show, args);
    const next = normalize(changed.show);
    const serialized = new TextDecoder().decode(serializeShow(next));
    parseShow(serialized);
    return { result: { ...describe(next), changed_surface_ids: changed.changedIDs }, document: next };
  }
  if (!['map.clip.move', 'map.clip.edit'].includes(command)) throw new Error('Unknown Map command.');
  const clip = show.visuals?.find(v => v.id === args.clip_id);
  if (!clip) throw new Error('Clip not found. Inspect the show first.');
  if (!clipEditable(show, clip.id)) throw new Error('The clip or its track is locked.');
  let next: MapShow;
  if (command === 'map.clip.move') {
    finiteTime(args.start_s);
    if (!show.tracks?.some(t => t.id === args.track_id)) throw new Error('Track not found.');
    // Nesting checks depend on the owning scene, not the saved editor tab.
    const track = show.tracks.find(t => t.id === args.track_id)!;
    const sceneID = track.targets[0]?.sceneID ?? show.activeSceneId;
    const context = { ...show, activeSceneId: sceneID };
    const moved = moveTimelineClip(context, clip.id, track.id, args.start_s);
    if (moved === context) throw new Error('Move refused: check track locks, media type and timeline nesting.');
    next = { ...moved, activeSceneId: show.activeSceneId };
  } else {
    const action = args.action;
    if (!action || !['duplicate', 'split', 'delete', 'trim-start', 'trim-end'].includes(action))
      throw new Error('Unsupported clip action.');
    if (['split', 'trim-start', 'trim-end'].includes(action)) finiteTime(args.time_s);
    next = editTimelineClip(show, clip.id, action, args.time_s ?? 0);
    if (next === show) throw new Error('Edit refused: check clip boundaries and continuous playback.');
  }
  next = normalize(next);
  const serialized = new TextDecoder().decode(serializeShow(next));
  // Same round-trip contract as a file that will be reopened in the editor/player.
  parseShow(serialized);
  return { result: describe(next), document: next };
}
