import { newVisual } from './visual-document';
import { activeScene, newSurface, type MapShow, type Surface, type Scene } from './document';
import { sceneSize } from './scene-size';
import { remapLayerBetweenBounds } from './layer-transform';
import { activeAsset, appendContent, patchAssetSource } from './surface-assets';
export type ContentTarget = 'surface' | 'surfaces' | 'scene';
export type ContentPlacement = 'replace' | 'append' | 'layer';
export interface PlaceContent { sceneID: string; target: ContentTarget; surfaceID?: string | null; clipID?: string | null; placement: ContentPlacement; timeS: number }
/** Full-scene extent does not imply a background: array order alone composites it. */
export function newSceneVisual(show: MapShow, scene: Scene): Surface {
  const size = sceneSize(show, scene), canvas = newSurface(size, scene.surfaces.length);
  return { ...canvas, name: `${scene.name} visual ${scene.surfaces.filter(s => s.sceneCanvas).length + 1}`, sceneCanvas: true,
    corners: [[0, 0], [size.width, 0], [size.width, size.height], [0, size.height]] };
}

/** Explicit replace/append uses the selected scene track, otherwise the topmost.
 * New visual creates an independent layer, just like adding any other asset. */
export function placeContent(show: MapShow, source: Surface['source'], options: PlaceContent): MapShow {
  const scene = show.scenes.find(s => s.id === options.sceneID);
  if (!scene) return show;
  if (show.visuals) {
    const selected = show.visuals.find(v => v.id === options.clipID || v.id === options.surfaceID);
    if (selected && options.placement === 'replace') return selected.locked ? show : { ...show, visuals: show.visuals.map(v => v.id === selected.id ? { ...v, source: structuredClone(source) } : v) };
    const targets = options.target === 'scene' ? [{ sceneID: scene.id }] : options.target === 'surfaces'
      ? scene.surfaces.filter(s => !s.sceneCanvas && s.kind !== 'mask' && !s.locked).map(s => ({ sceneID: scene.id, surfaceID: s.id }))
      : selected ? selected.targets : scene.surfaces.filter(s => s.id === options.surfaceID && s.kind !== 'mask' && !s.locked).map(s => ({ sceneID: scene.id, surfaceID: s.id }));
    if (!targets.length) return show;
    const end = options.placement === 'append' ? Math.max(options.timeS, ...show.visuals.filter(v => !v.continuous && v.targets.some(t => targets.some(target => t.sceneID === target.sceneID && t.surfaceID === target.surfaceID))).map(v => v.startS + v.durationS)) : options.timeS;
    return { ...show, visuals: [...show.visuals, newVisual(show, structuredClone(source), targets, end)] };
  }
  let surfaces = scene.surfaces;
  if (options.placement === 'layer' && options.target !== 'scene') return show;
  let canvas = surfaces.find(s => s.sceneCanvas && s.id === options.surfaceID)
    ?? [...surfaces].reverse().find(s => s.sceneCanvas);
  if (options.target === 'scene' && (options.placement === 'layer' || !canvas)) {
    canvas = newSceneVisual(show, scene);
    surfaces = [...surfaces, canvas];
  }
  const ids = options.target === 'surface' ? [options.surfaceID]
    : options.target === 'scene' ? [canvas?.id]
    : surfaces.filter(s => s.kind !== 'mask' && !s.sceneCanvas).map(s => s.id);
  let changed = surfaces !== scene.surfaces;
  surfaces = surfaces.map(s => {
    if (!ids.includes(s.id) || s.locked || s.kind === 'mask') return s;
    const clip = activeAsset(s, s.id === options.surfaceID ? options.clipID ?? null : null, options.timeS);
    if (options.placement !== 'append' && clip?.locked) return s;
    changed = true;
    return options.placement === 'append' ? appendContent(s, source, show.media, options.timeS).surface
      : patchAssetSource(s, structuredClone(source), clip?.id ?? null, show.media, options.timeS);
  });
  return changed ? { ...show, scenes: show.scenes.map(s => s.id === scene.id ? { ...s, surfaces } : s) } : show;
}
export function canPlaceContent(show: MapShow, target: ContentTarget, surfaceID?: string | null, placement: ContentPlacement = 'replace') {
  const visual = show.visuals?.find(v => v.id === surfaceID);
  if (visual && target === 'surface') return !visual.locked;
  const scene = activeScene(show);
  if (target === 'scene') return placement === 'layer' || !(scene.surfaces.find(s => s.sceneCanvas && s.id === surfaceID)
    ?? [...scene.surfaces].reverse().find(s => s.sceneCanvas))?.locked;
  return scene.surfaces.some(s => !s.locked && s.kind !== 'mask' && (target === 'surface' ? s.id === surfaceID : !s.sceneCanvas));
}

/** Scene visuals follow an artboard resize; ordinary mapped surfaces stay put. */
export function resizeSceneContent(show: MapShow, scene: Scene, next: Scene): Scene {
  const before = sceneSize(show, scene), after = sceneSize(show, next);
  if (before.width === after.width && before.height === after.height) return next;
  return { ...next, surfaces: next.surfaces.map(s => s.sceneCanvas ? {
    ...s, ...remapLayerBetweenBounds(s, { x: 0, y: 0, ...before }, { x: 0, y: 0, ...after }, 0),
  } : s) };
}
