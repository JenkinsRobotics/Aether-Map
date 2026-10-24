import { sceneSize } from "./scene-size";
import { activeScene, activeSurfaces, quadCorners, type MapShow, type Surface } from "./document";

/** Tree identity for the scene's existing editor-only background, never a Surface. */
export const backgroundLayerID = (sceneID: string) => `background/${sceneID}`;

export function backgroundLayer(show: MapShow) {
  const scene = activeScene(show);
  if (!scene?.setupBackground) return null;
  const media = show.media.find((item) => item.id === scene.setupBackground?.mediaId);
  return {
    id: backgroundLayerID(scene.id),
    label: `Backdrop — ${media?.name ?? "Image"}`,
    background: scene.setupBackground,
    media,
  };
}

/** Editor projection onto the common geometry controls; never enters rendered surfaces. */
export function backdropSurface(show: MapShow): Surface | null {
  const layer = backgroundLayer(show);
  if (!layer) return null;
  const { background, media } = layer;
  const size = sceneSize(show);
  const width = media?.width || size.width, height = media?.height || size.height;
  const scale = Math.min(size.width / width, size.height / height);
  return { id: layer.id, name: layer.label, enabled: background.visible, locked: background.locked,
    lockAspectRatio: background.lockAspectRatio ?? true, color: '#a6b5c9',
    corners: background.corners ?? quadCorners([(size.width - width * scale) / 2, (size.height - height * scale) / 2, width * scale, height * scale]),
    masks: [], source: { mediaId: background.mediaId, rect: [0, 0, width, height] }, opacity: background.opacity, cues: [], clips: [] };
}
export function editableLayers(show: MapShow): Surface[] {
  const backdrop = backdropSurface(show);
  return [...(backdrop ? [backdrop] : []), ...activeSurfaces(show)];
}
