import { activeScene, DEFAULT_OUTPUT, type MapShow, type Scene } from './document';
export interface SceneSize { width: number; height: number }
/** Artboard coordinates are independent of the physical output device. */
export function sceneSize(show: MapShow, scene: Scene = activeScene(show)): SceneSize {
  return scene?.artboard ? { width: scene.artboard.widthPx, height: scene.artboard.heightPx } : { width: show.output.width, height: show.output.height };
}
export const ARTBOARD_PRESETS = [
  { value: 'hd', label: 'HD · 1280 × 720', width: 1280, height: 720 },
  { value: 'full-hd', label: 'Full HD · 1920 × 1080', ...DEFAULT_OUTPUT },
  { value: '4k', label: '4K · 3840 × 2160', width: 3840, height: 2160 },
  { value: 'square', label: 'Square · 1080 × 1080', width: 1080, height: 1080 },
  { value: 'portrait', label: 'Portrait · 1080 × 1920', width: 1080, height: 1920 },
];
export const ARTBOARD_RATIOS = [
  { value: '16:9', label: '16:9', ratio: 16 / 9 }, { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '1:1', label: '1:1', ratio: 1 }, { value: '21:9', label: '21:9', ratio: 21 / 9 },
  { value: '9:16', label: '9:16', ratio: 9 / 16 }, { value: '3:4', label: '3:4', ratio: 3 / 4 },
];
export const artboardOf = (size: SceneSize): NonNullable<Scene['artboard']> => ({ widthPx: size.width, heightPx: size.height });
