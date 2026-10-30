/** Bounded saved-show creation using the editor's constructors. No IO or playback. */
import { newScene, type MapShow } from '../document';
import { compoundSurfaces } from '../features/shape-groups';
import { newFeature } from '../features/new-feature';
import { sceneSize } from '../scene-size';
import { isHotkey } from '../scene-hotkeys';

export interface CreationArguments {
  name?: string;
  shape?: 'rectangle' | 'cube' | 'box';
  scene_id?: string;
  width_px?: number;
  height_px?: number;
  hotkey?: string;
}
function nameOf(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    throw new Error('Name must contain 1–200 characters without control characters.');
  return value.trim();
}
function dimension(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 16384)
    throw new Error('Artboard dimensions must be whole pixels between 1 and 16384.');
  return value;
}

export function createInShow(command: string, show: MapShow, args: CreationArguments) {
  const name = nameOf(args.name);
  if (command === 'map.scene.create') {
    if (show.scenes.length >= 256) throw new Error('Scene creation exceeds the 256-scene automation limit.');
    if (args.hotkey !== undefined && !isHotkey(args.hotkey)) throw new Error('Hotkey must be F1–F12.');
    const scene = { ...newScene(name, { widthPx: dimension(args.width_px), heightPx: dimension(args.height_px) }), ...(args.hotkey ? { hotkey: args.hotkey } : {}) };
    // Saved editor focus and physical output bindings must not change implicitly.
    return { show: { ...show, scenes: [...show.scenes, scene] }, created: { scene_id: scene.id } };
  }
  if (command !== 'map.surface.create') throw new Error('Unknown creation command.');
  const scene = show.scenes.find(item => item.id === args.scene_id);
  if (!scene) throw new Error('Scene not found. Inspect the show first.');
  const shape = args.shape ?? 'rectangle';
  if (!['rectangle', 'cube', 'box'].includes(shape)) throw Error('Unsupported mapping shape.');
  if (shape !== 'rectangle' && scene.surfaces.some(s => s.folder === name)) throw Error('A surface folder with that name already exists. Choose a unique name.');
  const count = shape === 'cube' ? 3 : shape === 'box' ? 5 : 1;
  if (scene.surfaces.length + count > 1024) throw new Error('Surface creation exceeds the 1024-surface per-scene automation limit.');
  const surfaces = shape === 'rectangle'
    ? [{ ...newFeature('surface', sceneSize(show, scene), scene.surfaces.length), name }]
    : compoundSurfaces(shape, sceneSize(show, scene), scene.surfaces.length, name);
  return {
    show: { ...show, scenes: show.scenes.map(item => item.id === scene.id ? { ...item, surfaces: [...item.surfaces, ...surfaces] } : item) },
    created: { scene_id: scene.id, surface_id: surfaces[0].id, surface_ids: surfaces.map(s => s.id) },
  };
}
