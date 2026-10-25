import type { VisualMotionInputs } from './visual-motion';
import { currentTimelineID, isClip, scheduledVisuals, timelineVisuals, type Board, type ClipStep } from './timelines';
import { visualSource } from './media-pool';
import { project, solveHomography } from './homography';
import { quadCorners } from './document';
import { contentPlacementCorners } from './visual-placement';
import { newScene, newSurface, type MapShow, type Scene, type Surface, type Point, type Rect } from './document';
import { evaluateSurface, type ResolvedSurface } from './playback';
import { normalizeVisuals } from './visual-document';
import { clipShapes } from './mask/clip';
import { mediaTime } from './clips';

/** A scene visual fills each surface it lands on without distorting the picture
 * (cropping the overflow) unless its Content placement says otherwise. Mapping's
 * own surface media keeps its authored stretch (Jonathan, 2026-10-23). */
export const VISUAL_FIT = 'cover' as const;

/** Shared projection for the authoring canvas and every physical output. */
export function sceneVisuals(input: MapShow, scene: Scene, timeS: number, placeholders = false, onlySurfaceID?: string, inputs:VisualMotionInputs={}, calibration = false): ResolvedSurface[] {
  return renderTimeline(input, scene, timeS, currentTimelineID(input), placeholders, onlySurfaceID, inputs, calibration);
}

/** A compound clip on its own board (board space), for the Content workspace. */
export function clipPictures(show: MapShow, clipID: string, timeS: number, inputs: VisualMotionInputs = {}): ResolvedSurface[] {
  const clip = show.timelines?.find(t => t.id === clipID);
  if (!isClip(clip)) return [];
  const board = { ...newScene(clip.name, clip.board), id: `board:${clip.id}`, surfaces: [] };
  return renderTimeline(show, board, timeS, clip.id, false, undefined, inputs, false, true);
}

/** Where a clip's board sits in `frame` before any placement: cover keeps the
 * board's proportions and overflows the frame; stretch fills it exactly. */
export function boardBounds(board: Board, frame: Rect, fit: ClipStep['fit']): Rect {
  const [fx, fy, fw, fh] = frame, s = Math.max(fw / board.widthPx, fh / board.heightPx);
  return fit === 'cover' ? [fx + (fw - board.widthPx * s) / 2, fy + (fh - board.heightPx * s) / 2, board.widthPx * s, board.heightPx * s] : frame;
}

/** Maps a clip's board into `frame` (whose corners are `corners`), moved and
 * sized by the use's placement as any visual is in its frame. */
function boardInto(board: Board, frame: Rect, corners: Surface['corners'], fit: ClipStep['fit'], placement?: ClipStep['placement']): (p: Point) => Point {
  const toFrame = solveHomography(quadCorners([0, 0, board.widthPx, board.heightPx]), contentPlacementCorners(placement, frame, boardBounds(board, frame, fit)));
  const toCorners = solveHomography(quadCorners(frame), corners);
  return p => project(toCorners, project(toFrame, p));
}

function renderTimeline(input: MapShow, scene: Scene, timeS: number, timelineID: string, placeholders = false, onlySurfaceID?: string, inputs:VisualMotionInputs={}, calibration = false, asBoard = false): ResolvedSurface[] {
  const show = normalizeVisuals(input);
  // A clip played as a scene (a show's scene clip) fills the canvas, as scenes always have.
  const root = show.timelines?.find(t => t.id === timelineID);
  const rootStep: ClipStep[] = !asBoard && isClip(root) ? [{ board: root.board, fit: 'stretch' }] : [];
  const geometry = show.scenes.find(s => s.id === scene.id) ?? scene;
  const context = { ...inputs, lfos: show.lfos, sceneTimeS: timeS, ...(calibration ? { modulation: false as const } : {}) };
  const occupied = new Set<string>();
  const w = scene.artboard?.widthPx ?? show.output.width, h = scene.artboard?.heightPx ?? show.output.height;
  // A nested scene on surfaces: its pictures (canvas space) project onto each host surface.
  const hosted = (pictures: ResolvedSurface[], hosts: string[]) => hosts.flatMap(id => {
    const found = geometry.surfaces.find(s => s.id === id);
    if (!found || !found.enabled || (onlySurfaceID && onlySurfaceID !== id)) return [];
    const host = evaluateSurface(found, calibration ? 0 : timeS, show.media, context);
    const toHost = solveHomography(quadCorners([0, 0, w, h]), host.corners), map = (p: Point) => project(toHost, p);
    const outline = host.masks.length || host.shape === 'ellipse' || host.radiusPx ? targetShapes(host) : [];
    return pictures.map(p => ({ ...p, id: `${p.id}@${id}`, corners: p.corners.map(map) as Surface['corners'],
      // ponytail: a picture with its own outline keeps it (mapped), not intersected with the host's.
      masks: p.masks.length || p.shape === 'ellipse' || p.radiusPx ? targetShapes(p).map(m => m.map(map)) : outline,
      shape: undefined, radiusPx: undefined, maskCurves: undefined, bend: undefined, opacity: p.opacity * host.opacity }));
  });
  // Clip pictures travel out through each clip use: into the next board, then
  // (outermost) onto its surfaces, the canvas, or the root clip's own board.
  const into = (pictures: ResolvedSurface[], step: ClipStep, frame: Rect, corners: Surface['corners'], outline: Point[][], suffix = '', opacity = 1): ResolvedSurface[] => {
    const map = boardInto(step.board, frame, corners, step.fit, step.placement);
    return pictures.map(p => ({ ...p, id: `${p.id}${suffix}`, corners: p.corners.map(map) as Surface['corners'],
      masks: p.masks.length || p.shape === 'ellipse' || p.radiusPx ? targetShapes(p).map(m => m.map(map)) : outline,
      shape: undefined, radiusPx: undefined, maskCurves: undefined, bend: undefined, opacity: p.opacity * opacity }));
  };
  const outward = (pictures: ResolvedSurface[], clips: ClipStep[]): ResolvedSurface[] => {
    let out = pictures;
    for (const [i, step] of clips.entries()) {
      const outer = clips[i + 1]?.board;
      if (outer) { const frame: Rect = [0, 0, outer.widthPx, outer.heightPx]; out = into(out, step, frame, quadCorners(frame), []); continue; }
      if (step.hosts) { out = step.hosts.flatMap(id => {
        const found = geometry.surfaces.find(s => s.id === id);
        if (!found || !found.enabled || (onlySurfaceID && onlySurfaceID !== id)) return [];
        const host = evaluateSurface(found, calibration ? 0 : timeS, show.media, context);
        // Cover or a placement can overflow the surface, so clip to it; stretch only needs a real outline (as r23).
        const outline = step.fit === 'cover' || step.placement || host.masks.length || host.shape === 'ellipse' || host.radiusPx ? targetShapes(host) : [];
        return into(out, step, host.source.rect, host.corners, outline, `@${id}`, host.opacity);
      }); continue; }
      const frame: Rect = [0, 0, w, h];
      out = into(out, step, frame, quadCorners(frame), step.fit === 'cover' || step.placement ? [quadCorners(frame)] : []);
    }
    return out;
  };
  const rendered = scheduledVisuals(show, timeS, timelineID, inputs).flatMap(({ visual, track, timeS, hosts, board, clips }) => {
    const out = place(visual, track, timeS, board);
    return board ? outward(out, [...(clips ?? []), ...rootStep]) : hosts ? hosted(out, hosts) : out;
  });
  function place(visual: ReturnType<typeof scheduledVisuals>[number]['visual'], track: ReturnType<typeof scheduledVisuals>[number]['track'], timeS: number, board?: Board): ResolvedSurface[] {
    if (track?.kind === 'audio' || track?.enabled === false) return [];
    const source = visualSource(show, visual);
    if (show.media.some(m => m.id === source.mediaId && m.kind === 'audio')) return [];
    if (visual.enabled === false || (!visual.continuous && (timeS < visual.startS || timeS >= visual.startS + visual.durationS))) return [];
    if (visual.legacyTrack) { if (occupied.has(visual.legacyTrack)) return []; occupied.add(visual.legacyTrack); }
    const targets = board ? [{ ...newSurface({ width: board.widthPx, height: board.heightPx }, 0), id: 'board', corners: quadCorners([0, 0, board.widthPx, board.heightPx]), mediaTimeS: timeS }]
      : visual.targets.filter(t => t.sceneID === scene.id).flatMap(t => {
      if (t.surfaceID) { const surface = geometry.surfaces.find(s => s.id === t.surfaceID); return surface ? [evaluateSurface(surface, calibration ? 0 : timeS, show.media, context)] : []; }
      return [{ ...newSurface({ width: w, height: h }, 0), id: scene.id, corners: [[0, 0], [w, 0], [w, h], [0, h]] as Surface['corners'], mediaTimeS: timeS }];
    });
    if (!targets.length) return [];
    const points = targets.flatMap(t => t.corners);
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
    const window: Surface['corners'] = [[left, top], [right, top], [right, bottom], [left, bottom]];
    const media = show.media.find(m => m.id === source.mediaId);
    const clock = visual.continuous ? timeS : mediaTime(visual, media, timeS);
    const pictures: ResolvedSurface[] = targets.filter(t => t.enabled && t.opacity > 0 && (!onlySurfaceID || t.id === onlySurfaceID)).map(target => ({ ...target, id: `${visual.id}:${target.id}`, name: visual.name,
      ...(visual.placement ? {visualPlacement:visual.placement, contentFrame:visual.mapping === 'span' ? [0,0,right-left,bottom-top] as Surface['source']['rect'] : target.source.rect} : {}),
      source: { ...source, fit: source.fit ?? VISUAL_FIT, effects: visual.effects }, clips: [], sequence: false,
      opacity: target.opacity * visual.opacity, mediaTimeS: clock, mediaLoop: Boolean(visual.continuous),
      ...(visual.mapping === 'span' ? { ...(target.alphaMask ? { alphaProjection: { corners: target.corners, rect: target.source.rect } } : {}), corners: window, masks: targetShapes(target), shape: undefined, radiusPx: undefined, maskCurves: undefined, bend: undefined } : {}),
    }));
    if (visual.mapping !== 'span') return pictures;
    // Equal-opacity windows share one rendered source and a union clip, including
    // overlapping faces. Unequal target opacity retains separate compositing.
    const merged: ResolvedSurface[] = [];
    for (const picture of pictures) {
      const prior = !picture.alphaMask && !picture.maskFillRule && merged.find(p => !p.alphaMask && !p.maskFillRule && p.opacity === picture.opacity);
      if (prior) prior.masks = [...prior.masks, ...picture.masks]; else merged.push(picture);
    }
    return merged;
  }
  const targets = timelineVisuals(show, timelineID).flatMap(v => v.targets).filter(t => t.sceneID === scene.id);
  const empty = placeholders && !targets.some(t => !t.surfaceID) ? geometry.surfaces.filter(s => !targets.some(t => t.surfaceID === s.id)).map(s => evaluateSurface(s, calibration ? 0 : timeS, show.media, context)) : [];
  return [...empty, ...rendered];
}

function targetShapes(surface: Surface): Point[][] {
  if (surface.masks.length || (surface.shape !== 'ellipse' && !surface.radiusPx)) return clipShapes(surface);
  const [x, y, w, h] = surface.source.rect;
  const transform = solveHomography(quadCorners(surface.source.rect), surface.corners);
  if (surface.shape === 'ellipse') return [Array.from({ length: 96 }, (_, i) => {
    const theta = i / 96 * Math.PI * 2;
    return project(transform, [x + w / 2 + Math.cos(theta) * w / 2, y + h / 2 + Math.sin(theta) * h / 2]);
  })];
  const r = Math.min(surface.radiusPx ?? 0, w / 2, h / 2);
  const centers: Point[] = [[x + w - r, y + r], [x + w - r, y + h - r], [x + r, y + h - r], [x + r, y + r]];
  return [centers.flatMap(([cx, cy], corner) => Array.from({ length: 17 }, (_, i) => {
    const theta = (corner - 1 + i / 16) * Math.PI / 2;
    return project(transform, [cx + Math.cos(theta) * r, cy + Math.sin(theta) * r]);
  }))];
}
