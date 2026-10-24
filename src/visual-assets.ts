import { timelineVisuals } from './timelines';
import { visualSource } from './media-pool';
import type { Clip, MapShow, Surface } from './document';
import { sourceKind } from './surface-assets';
import { normalizeVisuals, visualSurface } from './visual-document';

/** A view of authored visuals, not another store or a copy of their sources. */
export interface VisualAsset {
  id: string;
  name: string;
  kind: string;
  target: string;
  surface: Surface;
  clip: Clip | null;
}

export function visualAssets(show: MapShow): VisualAsset[] {
  return timelineVisuals(normalizeVisuals(show)).filter(v => !v.mask).map(v => ({
    id: v.id, name: v.name, kind: v.timelineRefID ? "Timeline" : sourceKind(visualSource(show, v)),
    target: v.targets.map(t => { const scene = show.scenes.find(s => s.id === t.sceneID); return `${scene?.name ?? 'Unassigned'} · ${t.surfaceID ? scene?.surfaces.find(s => s.id === t.surfaceID)?.name ?? 'Missing surface' : 'Entire scene'}`; }).join(', ') || 'No targets',
    surface: visualSurface(show, v), clip: v,
  }));
}
