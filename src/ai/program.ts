import type { MapShow } from '../document';
import { jsonObject, object, mapCommands } from './catalog';

type Run = (command: string, show: MapShow, args: Record<string, unknown>) => { document?: MapShow; result: Record<string, unknown> };
const editable = new Set(mapCommands.filter(c => c.writes && c.id !== 'map.show.runprogram').map(c => c.id));

/** Orchestration only: the same product commands prepare an isolated candidate.
 * No editor/host write occurs until every command and assertion succeeds. */
export function runProgram(show: MapShow, encoded: unknown, run: Run) {
  const program = object(jsonObject(encoded), ['version','steps','assertions']);
  if (program.version !== 1 || !Array.isArray(program.steps) || !program.steps.length || program.steps.length > 32) throw Error('Use version 1 with 1–32 steps.');
  if (program.assertions !== undefined && (!Array.isArray(program.assertions) || program.assertions.length > 16)) throw Error('Use at most 16 assertions.');
  const references: Record<string, Record<string, unknown>> = Object.create(null);
  const ids = new Set<string>();
  function resolve(value: unknown, depth = 0): unknown {
    if (depth > 12) throw Error('Program arguments are nested too deeply.');
    if (Array.isArray(value)) return value.map(item => resolve(item, depth + 1));
    if (!value || typeof value !== 'object') return value;
    const record = object(value);
    if ('$ref' in record) {
      object(record, ['$ref']);
      const match = typeof record.$ref === 'string' && /^([a-zA-Z][a-zA-Z0-9_-]{0,39})\.(scene_id|surface_id|clip_id|asset_id|track_id)$/.exec(record.$ref);
      if (!match || !Object.hasOwn(references, match[1]) || !Object.hasOwn(references[match[1]], match[2])) throw Error('Reference must name an earlier created ID.');
      return references[match[1]][match[2]];
    }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, resolve(item, depth + 1)]));
  }
  let candidate = structuredClone(show);
  for (const value of program.steps) {
    const step = object(value, ['id','command','arguments']);
    if (typeof step.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(step.id) || ids.has(step.id)) throw Error('Use unique step IDs, starting with a letter, at most 40 characters.');
    ids.add(step.id);
    if (typeof step.command !== 'string' || !editable.has(step.command)) throw Error('Choose an editing command from agent docs; nested programs are not allowed.');
    const args = object(resolve(step.arguments));
    if (['app','id','expected_revision'].some(key => Object.hasOwn(args, key))) throw Error('Program steps cannot choose file authority.');
    // Structured source/changes objects are convenient for nested ID references.
    for (const key of ['source_json','changes_json']) if (args[key] && typeof args[key] === 'object') args[key] = JSON.stringify(args[key]);
    try {
      const result = run(step.command, candidate, args);
      if (!result.document) throw Error('Step did not produce an edit.');
      candidate = result.document;
      references[step.id] = result.result.created ? object(result.result.created) : {};
    } catch (error) { throw Error(`Step ${step.id}: ${(error as Error).message}`); }
  }
  const assertions = ((program.assertions ?? []) as unknown[]).map(value => {
    const check = object(resolve(value), ['scene_id','time_s','layer_count']);
    if (typeof check.layer_count !== 'number' || !Number.isInteger(check.layer_count) || check.layer_count < 0 || check.layer_count > 10000) throw Error('Assertion layer_count must be an integer from 0 to 10000.');
    const verification = run('map.show.verify', candidate, { scene_id: check.scene_id, time_s: check.time_s }).result;
    if (verification.layer_count !== check.layer_count || !(verification.valid as boolean)) throw Error(`Composition assertion failed: expected ${check.layer_count} layers, got ${verification.layer_count}.`);
    return { ...check, passed: true };
  });
  return { document: candidate, result: { steps: program.steps.length, references, assertions } };
}

export const mappedVisualRecipe = { version: 1, steps: [
  { id: 'scene', command: 'map.scene.create', arguments: { name: 'Agent light show', width_px: 1280, height_px: 720 } },
  { id: 'wall', command: 'map.surface.create', arguments: { scene_id: { $ref: 'scene.scene_id' }, name: 'Front wall' } },
  { id: 'bounds', command: 'map.surface.bounds', arguments: { scene_id: { $ref: 'scene.scene_id' }, surface_id: { $ref: 'wall.surface_id' }, x_px: 80, y_px: 60, width_px: 1120, height_px: 600 } },
  { id: 'visual', command: 'map.visual.create', arguments: { scene_id: { $ref: 'scene.scene_id' }, name: 'Neon wash', source_json: { kind: 'gallery', id: 'neon-beams:0' } } },
], assertions: [{ scene_id: { $ref: 'scene.scene_id' }, time_s: 5, layer_count: 1 }] };
