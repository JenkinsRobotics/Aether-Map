import { nextId, type Clip, type MediaRef, type Surface } from './document';
import { clipAt, clipEnd, IMAGE_HOLD_S } from './clips';
import { DEFAULT_VISUAL_DURATION_S } from './features/types';

export type SurfaceSource = Surface['source'];
export const sourceHasContent = (source: SurfaceSource) => Boolean(source.drawing || source.mediaId || source.text || source.fill || source.fillGradient || source.shader || source.webcam || source.tracker || source.testPattern);
export function clipSource(surface: Surface, clip: Clip, media: readonly MediaRef[]): SurfaceSource {
  if (clip.source) return clip.source;
  const asset = media.find(m => m.id === clip.mediaId);
  return { mediaId: clip.mediaId ?? null, rect: asset && asset.id !== surface.source.mediaId ? [0, 0, asset.width, asset.height] : surface.source.rect };
}
export const clipMediaID = (clip: Clip) => clip.source?.mediaId ?? clip.mediaId;
export function sourceKind(source: SurfaceSource) {
  return source.drawing ? 'Drawing' : source.tracker ? 'Tracker' : source.webcam ? 'Webcam' : source.shader ? 'Shader' : source.text ? 'Text' : (source.fill || source.fillGradient) ? 'Colour' : source.testPattern ? 'Test pattern' : 'Media';
}
export function sourceName(source: SurfaceSource, media: readonly MediaRef[]) {
  return source.mediaId && sourceKind(source) === 'Media' ? media.find(m => m.id === source.mediaId)?.name ?? 'Missing asset'
    : source.text ? source.text.text.trim().split('\n')[0] || 'Text' : sourceKind(source);
}
export const assetName = (surface: Surface, clip: Clip, media: readonly MediaRef[]) => clip.name?.trim() || sourceName(clipSource(surface, clip, media), media);
export const sourceID = (surfaceID: string) => `source:${surfaceID}`;
export function contentClip(source: SurfaceSource, media: readonly MediaRef[], atS = 0, id = nextId('k')): Clip {
  const asset = media.find(m => m.id === source.mediaId);
  const durationS = source.shader ? DEFAULT_VISUAL_DURATION_S : asset && asset.kind !== 'image' && asset.duration ? asset.duration : source.tracker?.recording?.durationS ?? IMAGE_HOLD_S;
  return { id, source: structuredClone(source), startS: Math.max(0, atS), durationS: Math.max(.001, durationS), inS: 0, loop: Boolean(source.shader) };
}
export function activeAsset(surface: Surface, id: string | null, timeS: number): Clip | null {
  return surface.clips.find(c => c.id === id) ?? clipAt(surface.clips, timeS) ?? surface.clips[0] ?? null;
}
/** Editable projection of one asset; geometry/animation still belong to its surface. */
export function assetSurface(surface: Surface, clip: Clip | null, media: readonly MediaRef[]): Surface {
  return clip ? { ...surface, source: clipSource(surface, clip, media), clips: [] } : surface;
}
/** Materialize old inputs before clearing their fallback, preserving media crops. */
export function sequenceSurface(surface: Surface, media: readonly MediaRef[]): Surface {
  const clips = surface.clips.length || surface.sequence || !sourceHasContent(surface.source)
    ? surface.clips.map(c => c.source ? c : { ...c, source: clipSource(surface, c, media) })
    : [contentClip(surface.source, media, 0, sourceID(surface.id))];
  return { ...surface, source: { mediaId: null, rect: surface.source.rect }, sequence: true, clips };
}
export function appendContent(surface: Surface, source: SurfaceSource, media: readonly MediaRef[], atS: number, id?: string): { surface: Surface; clip: Clip } {
  // Explicitly adding a sequence to an old static layer turns that input into its first clip.
  const track = sequenceSurface(surface, media), clips = track.clips;
  const clip = contentClip(source, media, Math.max(atS, ...clips.map(clipEnd)), id);
  return { surface: { ...track, clips: [...clips, clip] }, clip };
}
/** Source edits affect the selected asset, leaving the surface's geometry intact. */
export function patchAssetSource(surface: Surface, source: SurfaceSource, id: string | null, media: readonly MediaRef[], timeS: number, newID?: string): Surface {
  const clip = activeAsset(surface, id, timeS);
  if (surface.locked || clip?.locked) return surface;
  if (clip) return { ...surface, clips: surface.clips.map(c => c.id === clip.id ? { ...c, mediaId: undefined, source } : c) };
  if (!surface.sequence && sourceHasContent(surface.source)) return { ...surface, source }; // legacy continuous input
  if (!sourceHasContent(source)) return { ...surface, source };
  return appendContent(surface, source, media, timeS, newID).surface;
}
export function allSources(surface: Surface): SurfaceSource[] {
  return [surface.source, ...surface.clips.flatMap(c => c.source ? [c.source] : [])];
}
