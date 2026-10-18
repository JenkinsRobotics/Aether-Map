import type { CSSProperties } from 'react';
import type { MediaRef, Surface } from './document';
import { sourcePictureStyle } from './source-picture';
/** Same projection geometry as assets, rendered only by the editor. */
export function BackdropImage({ surface, media, url }: { surface: Surface; media: MediaRef; url: string }) {
  let style: CSSProperties;
  try { style = sourcePictureStyle(surface, media); }
  catch { return null; } // A node may pass through a degenerate quad during a drag.
  return <img className="map-setup-background" alt="Backdrop" src={url} draggable={false} style={{ ...style, opacity: surface.opacity }} />;
}
