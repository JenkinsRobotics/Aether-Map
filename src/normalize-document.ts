import { surfaceMotionVersion } from './features/surface-parameters';
import { visualLookVersion } from './visual-looks';
import { sourceMotionVersion } from './source-motion';
import { visualMotionVersion } from './visual-motion';
import type { MapShow } from './document';
import { normalizeVisuals } from './visual-document';
import { normalizeMediaPool } from './media-pool';
import { normalizeSurfaceTimelines } from './surface-timelines';
import { normalizeShowTimeline } from './show-timeline';

/** One document upgrade path for editor opening, edits and saved-file agents. */
export function normalizeDocument(show: MapShow): MapShow {
  return normalizeShowTimeline(surfaceMotionVersion(visualLookVersion(sourceMotionVersion(visualMotionVersion(normalizeSurfaceTimelines(normalizeMediaPool(normalizeVisuals(show))))))));
}
