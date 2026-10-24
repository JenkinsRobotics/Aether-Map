import { agentCanvasImage, agentToolContent } from '@aether/ui/AgentToolResult';
import { maskCanvas } from '../projection-export/raster';
import { sceneSize } from '../scene-size';
import type { AgentToolCall } from '@aether/ui/AgentServices';
import type { MapShow } from '../document';
import { runDocumentCommand, type Arguments } from './commands';
import { boundedMapReply, inspectMap, showCounts, validateMapCall } from './live-commands';
import { mapCommands } from '../ai/catalog';
import { sourcePreview } from '../ai/source-preview';

export interface MapAgentState {
  contextKey: string; show: MapShow; writable: boolean; available: boolean;
  canUndo: boolean; canRedo: boolean;
  selection: { surface_ids: readonly string[]; clip_id: string | null; asset_id: string | null };
  commit: (next: MapShow) => void;
  undo: () => void; redo: () => void;
}

/** The browser adapter commits once through ordinary show history/autosave. */
export class MapAgentEditor {
  constructor(private readonly current: () => MapAgentState) {}

  async execute(contextKey: string, call: AgentToolCall, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    const command = validateMapCall(call.name, call.arguments);
    const state = { ...this.current() };
    if (state.contextKey !== contextKey) throw Error('The active show or scene changed. Inspect the current editor.');
    if (!state.available) throw Error('Finish or cancel the active edit before using the agent.');
    if (call.name === 'aether_map_visual_preview') {
      const result = await sourcePreview(state.show, call.arguments.clip_id as string, call.arguments.time_s as number, signal);
      signal.throwIfAborted();
      const live = this.current();
      if (live.contextKey !== contextKey || live.show !== state.show || !live.available) throw Error('The show changed while rendering. Request a fresh preview.');
      return result;
    }
    if (call.name === 'aether_map_show_inspect') return boundedMapReply({ ...inspectMap(state.show, call.arguments),
      writable: state.writable, can_undo: state.canUndo, can_redo: state.canRedo,
      selection: { ...state.selection, surface_ids: state.selection.surface_ids.slice(0, 50), surface_count: state.selection.surface_ids.length },
    });
    if (command === 'map.show.evaluate') {
      const { offset: _offset, limit: _limit, ...evaluationArgs } = call.arguments;
      const evaluated = runDocumentCommand(command, state.show, evaluationArgs as Arguments).result;
      const offset = (call.arguments.offset as number | undefined) ?? 0, limit = (call.arguments.limit as number | undefined) ?? 15;
      const layers = evaluated.layers as Record<string, unknown>[], audio = evaluated.audio as unknown[];
      return boundedMapReply({ ...evaluated, offset, total_layers: layers.length, total_audio: audio.length,
        layers: layers.slice(offset, offset + limit).map(({ masks, ...layer }) => ({ ...layer, mask_count: (masks as unknown[]).length })),
        audio: audio.slice(offset, offset + limit), next_offset: offset + limit < Math.max(layers.length, audio.length) ? offset + limit : null,
      });
    }
    if (command && mapCommands.find(c => c.id === command)?.writes === false)
      return boundedMapReply(runDocumentCommand(command, state.show, call.arguments as Arguments).result);
    if (call.name === 'aether_map_mapping_preview') {
      const scene = state.show.scenes.find(scene => scene.id === call.arguments.scene_id);
      if (!scene) throw Error('Scene not found. Inspect the show first.');
      const canvas = await maskCanvas(state.show, scene, undefined, false, signal);
      signal.throwIfAborted();
      const live = this.current();
      if (live.contextKey !== contextKey || live.show !== state.show || !live.available)
        throw Error('The show changed while rendering. Request a fresh preview.');
      return agentToolContent({kind:'mapping_mask',scene_id:scene.id,time_s:0,
        artboard_px:sceneSize(state.show,scene), includes:'calibration surfaces and cutouts only',
        excludes:['shaders','media','text','audio','backdrop'], changed:false}, agentCanvasImage(canvas,signal));
    }
    if (!state.writable) throw Error('This show is read-only.');
    const assertCurrent = () => {
      signal.throwIfAborted();
      const live = this.current();
      if (live.contextKey !== contextKey || live.show !== state.show || !live.writable || !live.available)
        throw Error('The editor changed while preparing this action. Inspect again.');
    };
    if (call.name === 'aether_map_undo' || call.name === 'aether_map_redo') {
      const undo = call.name === 'aether_map_undo';
      if (!(undo ? state.canUndo : state.canRedo)) throw Error(`No edit is available to ${undo ? 'undo' : 'redo'}.`);
      assertCurrent();
      (undo ? state.undo : state.redo)();
      return { changed: true, counts: showCounts(this.current().show) };
    }
    if (!command) throw Error('Unknown Map command.');
    const prepared = runDocumentCommand(command, state.show, call.arguments as Arguments);
    if (!prepared.document) throw Error('The tool did not prepare an edit.');
    // Small receipt prepared before committing; a size error must never hide a successful edit.
    const reply = boundedMapReply({ changed: true, counts: showCounts(prepared.document),
      ...(prepared.result.created ? { created: prepared.result.created } : {}),
      ...(prepared.result.changed_surface_ids ? { changed_surface_ids: prepared.result.changed_surface_ids } : {}),
      ...(prepared.result.references ? { references: prepared.result.references, assertions: prepared.result.assertions, steps: prepared.result.steps } : {}),
    });
    assertCurrent();
    state.commit(prepared.document);
    return reply;
  }
}
