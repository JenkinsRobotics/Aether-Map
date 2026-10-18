import { BackdropImage } from './BackdropImage';
import { backdropSurface } from './background-layer';
import type { MapShow, Scene } from './document';

/** A scene's reference image is independent of which artboard owns the tools. */
export function SceneBackdrop({ show, scene, mediaUrls, selectedID }: {
  show: MapShow; scene: Scene; mediaUrls: Record<string, string>; selectedID: string | null;
}) {
  if (!scene.setupBackground?.visible) return null;
  const surface = backdropSurface({ ...show, activeSceneId: scene.id });
  const media = show.media.find(m => m.id === scene.setupBackground?.mediaId && m.kind === 'image');
  const url = media && mediaUrls[media.id];
  if (!surface || !media || !url) return null;
  return <div className="map-scene-clip" data-unclipped={selectedID === surface.id || undefined}>
    <BackdropImage surface={surface} media={media} url={url} />
  </div>;
}
