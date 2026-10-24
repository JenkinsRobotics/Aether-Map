/** Saved-show placement delegates timing and source ownership to the editor. */
import type { MapShow } from '../document';
import { placePoolAsset } from '../media-pool';

export interface PlacementArguments { asset_id?: string; track_id?: string; start_s?: number }
export function placeAsset(show: MapShow, args: PlacementArguments) {
  if (typeof args.start_s !== 'number' || !Number.isFinite(args.start_s) || args.start_s < 0 || args.start_s > 604800)
    throw new Error('Start time must be between zero and 604800 seconds.');
  if ((show.visuals?.length ?? 0) >= 10000) throw new Error('Placement exceeds the 10000-clip automation limit.');
  const asset = show.pool?.find(a => a.id === args.asset_id);
  const track = show.tracks?.find(t => t.id === args.track_id);
  if (!asset || !track) throw new Error('Asset or track not found. Inspect the show first.');
  if (asset.source.mediaId && !show.media.some(m => m.id === asset.source.mediaId)) throw new Error('Asset media is missing.');
  const next = placePoolAsset(show, asset.id, track.id, args.start_s);
  if (next === show) throw new Error('Placement refused: check track locks and media type.');
  const clip = next.visuals!.at(-1)!;
  if (!Number.isFinite(clip.durationS) || clip.durationS <= 0 || clip.startS + clip.durationS > 604800)
    throw new Error('Clip end must be within 604800 seconds.');
  return { show: next, created: { clip_id: clip.id } };
}
