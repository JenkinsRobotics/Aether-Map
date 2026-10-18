import type { AgentTool } from '@aether/ui/AgentServices';
import catalogText from '../../service/aether_map_service/automation-commands.json?raw';
import type { MapShow } from '../document';
import { visualSource } from '../media-pool';
import { sourceSummary, surfaceAutomationSummary } from './commands';

type ScalarSchema = {
  type: 'string' | 'number' | 'integer'; enum?: unknown[];
  minimum?: number; maximum?: number; minLength?: number; maxLength?: number;
};
type Schema = { type: 'object'; properties: Record<string, ScalarSchema>; required: string[]; additionalProperties: false };
type Descriptor = { id: string; description: string; inputSchema: Schema; writes: boolean };
// The product's saved CLI/MCP catalogue is authoritative for editing arguments.
// File authority is supplied by the open editor rather than model-selected IDs.
const catalog = JSON.parse(catalogText) as Descriptor[];
const fileArguments = new Set(['app', 'id', 'expected_revision']);
const descriptions: Record<string, string> = {
  'map.show.evaluate': 'Evaluate Main at time_s for a scene in the open show. Returns composition geometry/audio summaries, not pixels. Does not start playback.',
  'map.scene.create': 'Add a named scene with explicit pixel artboard dimensions. Preserves active scene and output bindings. Undoable.',
  'map.surface.create': 'Add a rectangle (default), three-face cube or five-face box to a scene. Returns created IDs; inspect tracks afterward to find its surface timeline. Undoable.',
  'map.surface.bounds': 'Set visible surface bounds at mapping time zero in scene pixels. Preserves warp/masks/animation and respects aspect locks and welded neighbours. Undoable.',
  'map.cube.pose': 'Turn the three joined cube faces in 3D by relative degree angles or turn inside-out for a room corner. Use any member surface_id. Preserves face identities, visuals and masks. Refuses locks or hidden/folded faces. Undoable.',
  'map.surface.rotate': 'Rotate a surface by delta_degrees about its bounds center at time zero. Respects locks/welds. Undoable.',
  'map.asset.place': 'Place an existing pool asset on an existing compatible track at start_s. Inherits track surface targets. Returns created clip ID. Undoable.',
  'map.clip.move': 'Move a clip to an existing compatible track and start_s. Preserves its source, duration and surface targets; respects locks/nesting. Undoable.',
  'map.clip.edit': 'Duplicate/delete/split/trim a clip. Split and trim need time_s in timeline seconds; respects locks and boundaries. Undoable.',
};
const inspectSchema: Schema = { type: 'object', additionalProperties: false, required: [], properties: {
  section: { type: 'string', enum: ['scenes', 'surfaces', 'timelines', 'tracks', 'assets', 'clips'] },
  scene_id: { type: 'string', minLength: 1, maxLength: 128 },
  offset: { type: 'integer', minimum: 0, maximum: 1000000 },
  limit: { type: 'integer', minimum: 1, maximum: 25 },
} };
export const mapAgentTools: AgentTool[] = [
  { name: 'aether_map_visual_preview', description: 'Render the actual gallery/shader source for clip_id at time_s as PNG. Source only: excludes mapping, clip effects, other layers and live modulation. Read-only. Use show_verify for target composition and mapping_preview for geometry.',
    inputSchema: {type:'object',properties:{clip_id:{type:'string',minLength:1,maxLength:128},time_s:{type:'number',minimum:0,maximum:604800}},required:['clip_id','time_s'],additionalProperties:false} },
  { name: 'aether_map_mapping_preview', description: 'Render a read-only calibration mask at time zero: white projection surfaces and black outside/cutouts. Includes warp, curves and alpha masks. This is NOT the composed show: no shaders, text, media, audio or backdrop. Use show_evaluate for timing and composition data.',
    inputSchema: {type:'object',properties:{scene_id:{type:'string',minLength:1,maxLength:128}},required:['scene_id'],additionalProperties:false} },
  { name: 'aether_map_show_inspect', description: 'Inspect the open show, including unsaved edits. Page section (default scenes) using offset/limit; scene_id filters scenes/surfaces/timelines. Surface coordinates are pixels, top-left origin. Times are seconds.', inputSchema: inspectSchema },
  ...catalog.filter(item => item.id !== 'map.show.inspect').map(item => ({
    name: 'aether_' + item.id.replaceAll('.', '_'), description: descriptions[item.id] ?? item.description,
    inputSchema: { ...item.inputSchema,
      properties: Object.fromEntries(Object.entries(item.inputSchema.properties).filter(([key]) => !fileArguments.has(key))),
      required: item.inputSchema.required.filter(key => !fileArguments.has(key)),
    },
  })),
  ...['undo', 'redo'].map(action => ({ name: 'aether_map_' + action,
    description: `${action === 'undo' ? 'Undo' : 'Redo'} the most recent editor change, including manual edits. Inspect first; this uses the ordinary show history.`,
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  })),
];
const evaluationSchema = mapAgentTools.find(t => t.name === 'aether_map_show_evaluate')!.inputSchema as Schema;
evaluationSchema.properties = { ...evaluationSchema.properties, offset: inspectSchema.properties.offset, limit: inspectSchema.properties.limit };

/** Provider schemas are guidance; the editor validates every call independently. */
export function validateMapCall(name: string, args: Record<string, unknown>) {
  const definition = mapAgentTools.find(tool => tool.name === name);
  if (!definition) throw Error('Unknown Map tool.');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('Expected an argument object.');
  const schema = definition.inputSchema as Schema;
  for (const key of Object.keys(args)) {
    if (!Object.hasOwn(schema.properties, key)) throw Error(`Unknown argument: ${key}.`);
    const value = args[key], field = schema.properties[key];
    if (field.type === 'string') {
      if (typeof value !== 'string' || value.length < (field.minLength ?? 0) || value.length > (field.maxLength ?? 10000)) throw Error(`Invalid ${key}.`);
    } else if (typeof value !== 'number' || !Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value)) ||
      value < (field.minimum ?? -Infinity) || value > (field.maximum ?? Infinity)) throw Error(`Invalid ${key}.`);
    if (field.enum && !field.enum.includes(value)) throw Error(`Invalid ${key}.`);
  }
  for (const key of schema.required) if (!Object.hasOwn(args, key)) throw Error(`Missing argument: ${key}.`);
  return catalog.find(item => 'aether_' + item.id.replaceAll('.', '_') === name)?.id;
}

export function showCounts(show: MapShow) {
  return { scenes: show.scenes.length, surfaces: show.scenes.reduce((n, scene) => n + scene.surfaces.length, 0),
    timelines: show.timelines?.length ?? 0, tracks: show.tracks?.length ?? 0, assets: show.pool?.length ?? 0, clips: show.visuals?.length ?? 0 };
}
/** Keep tool replies below the host's 32KiB receipt limit; never truncate silently. */
export function boundedMapReply<T>(value: T): T {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 28000)
    throw Error('This page exceeds the agent response limit. Use a smaller limit.');
  return value;
}
export function inspectMap(show: MapShow, args: Record<string, unknown>) {
  const section = args.section ?? 'scenes', offset = (args.offset as number | undefined) ?? 0, limit = (args.limit as number | undefined) ?? 15;
  const scenes = args.scene_id ? show.scenes.filter(s => s.id === args.scene_id) : show.scenes;
  if (args.scene_id && !scenes.length) throw Error('Scene not found.');
  const page = <T,>(values: T[], describe: (value: T) => unknown) => ({
    total: values.length, items: values.slice(offset, offset + limit).map(describe),
    next_offset: offset + limit < values.length ? offset + limit : null,
  });
  let listing;
  switch (section) {
    case 'scenes': listing = page(scenes, s => ({ id: s.id, name: s.name, duration_s: s.durationS,
      artboard: s.artboard, suppressed: !!s.suppressed, surface_count: s.surfaces.length })); break;
    case 'surfaces': listing = page(scenes.flatMap(s => s.surfaces.map(surface => ({ scene_id: s.id, surface }))), ({ scene_id, surface: s }) => ({
      scene_id, id: s.id, name: s.name, enabled: s.enabled, locked: !!s.locked, corners: s.corners, kind: s.kind, folder: s.folder, group_shape: s.groupShape, ...surfaceAutomationSummary(s),
    })); break;
    case 'timelines': listing = page((show.timelines ?? []).filter(t => !args.scene_id || t.sceneID === args.scene_id), t => ({
      id: t.id, name: t.name, scene_id: t.sceneID, surface_id: t.surfaceID, duration_s: t.durationS,
    })); break;
    case 'tracks': listing = page(show.tracks ?? [], t => ({ id: t.id, name: t.name, kind: t.kind, timeline_id: t.timelineID ?? 'main',
      locked: !!t.locked, enabled: t.enabled, targets: t.targets })); break;
    case 'assets': listing = page(show.pool ?? [], a => ({ id: a.id, name: a.name, ...sourceSummary(a.source) })); break;
    case 'clips': listing = page(show.visuals ?? [], v => ({ id: v.id, name: v.name, track_id: v.trackID,
      timeline_id: v.timelineRefID, asset_id: v.assetID, start_s: v.startS, duration_s: v.durationS,
      in_s: v.inS, loop: v.loop, continuous: !!v.continuous, locked: !!v.locked, enabled: v.enabled !== false,
      targets: v.targets, opacity: v.opacity, mapping: v.mapping, effects: v.effects, placement: v.placement, motion: v.motion, ...sourceSummary(visualSource(show, v)) })); break;
    default: throw Error('Unknown inspection section.');
  }
  return boundedMapReply({ active_scene_id: show.activeSceneId, active_timeline_id: show.activeTimelineID ?? 'main',
    counts: showCounts(show), section, offset, ...listing });
}
