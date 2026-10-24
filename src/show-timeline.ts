import { nextId, type MapShow, type Surface } from './document';
import { MAIN_TIMELINE } from './timelines';
import type { VisualTarget } from './visual-model';

/** The transport's clock id in the Show workspace: the show timeline's length. */
export const SHOW_CLOCK = '__show-clock';

/** A scene (a saved timeline) placed on a canvas track of the show timeline. */
export interface SceneClip {
  id: string;
  /** The scene played: a timeline id, or 'main' for the canvas's Main. */
  sceneID: string;
  /** Plays another show here instead (a sequence): its track for this canvas. */
  showID?: string;
  startS: number;
  durationS: number;
  /** Where in the scene playback starts. */
  inS: number;
  loop?: boolean;
  speed?: number;
  /** Surface role → this canvas's surface id, when names differ. */
  roleOverrides?: Record<string, string>;
}
export interface ShowTrack { id: string; canvasID: string; clips: SceneClip[] }
export type CueTrigger = 'timeline' | 'go' | 'midi';
export type CueAction = 'play' | 'pause' | 'stop' | 'jump' | 'blackout-on' | 'blackout-off';
/** A show-control command: fired by the timeline, the operator's GO, or MIDI. */
export interface ShowCue {
  id: string; name: string; trigger: CueTrigger; action: CueAction;
  /** Timeline cues fire when the playhead passes this time. */
  atS?: number;
  /** Jump target for 'jump'. */
  toS?: number;
  /** MIDI control (CC) number for 'midi'; fires when it rises above zero. */
  control?: number;
  /** A jump repeats at most this many times per run (a loop); unset is always. */
  times?: number;
  /** Only fire while MIDI control `control` is above `above` (0–127): an "if". */
  when?: { control: number; above: number };
}
/** The show: canvas tracks of scene clips, cues, and its length. */
/** A soundtrack clip under the whole show: audio media on the show clock. */
export interface ShowAudioClip { id: string; mediaId: string; startS: number; durationS: number; inS: number; gain?: number }
export interface ShowTimeline { tracks: ShowTrack[]; cues: ShowCue[]; durationS: number; audio?: ShowAudioClip[] }
/** One show in the document. A document holds several, like setlists over the
 * same canvases and scenes. */
export interface ShowProgram extends ShowTimeline { id: string; name: string }

/** The show being edited in the Show workspace. */
export const activeShow = (show: MapShow): ShowProgram | undefined => show.shows?.find(p => p.id === show.activeShowID) ?? show.shows?.[0];
/** The show deployed players play. */
export const playerShow = (show: MapShow): ShowProgram | undefined => show.shows?.find(p => p.id === show.playerShowID) ?? show.shows?.[0];
/** Replace the active show's timeline. */
export function withActiveShow(show: MapShow, change: (timeline: ShowProgram) => ShowProgram): MapShow {
  const current = activeShow(show);
  if (!current) return show;
  return { ...show, shows: show.shows!.map(p => p.id === current.id ? change(p) : p) };
}
export function newShowProgram(show: MapShow, name: string): ShowProgram {
  return { id: nextId('show'), name, ...defaultShowTimeline(show) };
}

const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const ACTIONS: readonly CueAction[] = ['play', 'pause', 'stop', 'jump', 'blackout-on', 'blackout-off'];

/** The default show for a document that has none: every canvas plays its Main
 * for the canvas's duration, looping, from 0. */
export function defaultShowTimeline(show: MapShow): ShowTimeline {
  const tracks = show.scenes.map(c => ({ id: `track-${c.id}`, canvasID: c.id,
    clips: [{ id: `clip-${c.id}`, sceneID: MAIN_TIMELINE, startS: 0, durationS: c.durationS, inS: 0, loop: true }] }));
  return { tracks, cues: [], durationS: Math.max(1, ...show.scenes.map(c => c.durationS)) };
}

/** Keeps the show in step with the canvases: a new canvas gets a track playing
 * its Main; a deleted canvas's track goes. Pure; returns the same show when
 * nothing changes. */
export function normalizeShowTimeline(input: MapShow): MapShow {
  let show = input;
  // One show (r15) becomes the first of a list.
  if (!show.shows?.length) {
    const { showTimeline, ...rest } = show;
    show = { ...rest, shows: [{ id: 'show-1', name: 'Show 1', ...(showTimeline ?? defaultShowTimeline(show)) }] };
  }
  const ids = new Set(show.scenes.map(c => c.id));
  let changed = show !== input;
  const shows = show.shows!.map(program => {
    const kept = program.tracks.filter(t => ids.has(t.canvasID));
    const missing = show.scenes.filter(c => !kept.some(t => t.canvasID === c.id));
    if (kept.length === program.tracks.length && !missing.length) return program;
    changed = true;
    return { ...program, tracks: [...kept, ...defaultShowTimeline({ ...show, scenes: missing }).tracks] };
  });
  return changed ? { ...show, shows } : input;
}

export function readShows(raw: unknown): ShowProgram[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((entry, index) => {
    const timeline = readShowTimeline(entry);
    const value = entry as Record<string, unknown>;
    return timeline ? [{ id: typeof value.id === 'string' ? value.id : `show-${index + 1}`, name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 120) : `Show ${index + 1}`, ...timeline }] : [];
  });
}

export function readShowTimeline(raw: unknown): ShowTimeline | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const records = (list: unknown) => Array.isArray(list) ? list.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
  return {
    durationS: Math.max(1, finite(value.durationS, 60)),
    tracks: records(value.tracks).map(t => ({ id: String(t.id), canvasID: String(t.canvasID), clips: records(t.clips).map(c => ({
      id: String(c.id), sceneID: String(c.sceneID ?? MAIN_TIMELINE), startS: Math.max(0, finite(c.startS, 0)), durationS: Math.max(.1, finite(c.durationS, 10)),
      inS: Math.max(0, finite(c.inS, 0)), ...(typeof c.showID === 'string' ? { showID: c.showID } : {}), ...(c.loop === true ? { loop: true } : {}), ...(typeof c.speed === 'number' && c.speed > 0 ? { speed: c.speed } : {}),
      ...(c.roleOverrides && typeof c.roleOverrides === 'object' ? { roleOverrides: Object.fromEntries(Object.entries(c.roleOverrides as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string> } : {}),
    })) })),
    ...(Array.isArray(value.audio) ? { audio: records(value.audio).filter(a => typeof a.mediaId === 'string').map(a => ({ id: String(a.id), mediaId: String(a.mediaId),
      startS: Math.max(0, finite(a.startS, 0)), durationS: Math.max(.1, finite(a.durationS, 10)), inS: Math.max(0, finite(a.inS, 0)),
      ...(typeof a.gain === 'number' ? { gain: Math.max(0, Math.min(2, a.gain)) } : {}) })) } : {}),
    cues: records(value.cues).map(c => ({ id: String(c.id), name: String(c.name ?? 'Cue'),
      trigger: (['timeline', 'go', 'midi'].includes(String(c.trigger)) ? c.trigger : 'go') as CueTrigger,
      action: (ACTIONS.includes(c.action as CueAction) ? c.action : 'play') as CueAction,
      ...(typeof c.atS === 'number' ? { atS: Math.max(0, c.atS) } : {}), ...(typeof c.toS === 'number' ? { toS: Math.max(0, c.toS) } : {}),
      ...(typeof c.control === 'number' ? { control: Math.round(c.control) } : {}),
      ...(typeof c.times === 'number' && c.times >= 1 ? { times: Math.round(c.times) } : {}),
      ...(c.when && typeof c.when === 'object' && typeof (c.when as Record<string, unknown>).control === 'number' ? { when: { control: Math.round((c.when as Record<string, number>).control), above: Math.max(0, Math.min(127, Number((c.when as Record<string, unknown>).above) || 0)) } } : {}) })),
  };
}

/** The clip on a canvas at show time `timeS`, and the scene's local time. */
export function clipAt(show: MapShow, canvasID: string, timeS: number, program: ShowTimeline | undefined = activeShow(show), depth = 0): { clip: SceneClip; localS: number } | null {
  const track = program?.tracks.find(t => t.canvasID === canvasID);
  const clip = track?.clips.find(c => timeS >= c.startS && timeS < c.startS + c.durationS);
  if (!clip) return null;
  const elapsed = (timeS - clip.startS) * (clip.speed ?? 1);
  // A show placed as a clip is a sequence: play its own track for this canvas.
  // ponytail: depth-limited, so a show nested in itself just goes dark.
  const inner = clip.showID ? show.shows?.find(p => p.id === clip.showID) : undefined;
  const sceneLength = inner ? inner.durationS : sceneDuration(show, clip.sceneID, canvasID);
  const localS = clip.inS + (clip.loop && sceneLength > 0 ? elapsed % sceneLength : elapsed);
  if (clip.showID) return inner && depth < 4 ? clipAt(show, canvasID, localS, inner, depth + 1) : null;
  return { clip, localS };
}

export function sceneDuration(show: MapShow, sceneID: string, canvasID: string): number {
  return sceneID === MAIN_TIMELINE ? show.scenes.find(c => c.id === canvasID)?.durationS ?? 60 : show.timelines?.find(t => t.id === sceneID)?.durationS ?? 60;
}

/** A surface's role: the name scenes use to find it on any canvas. Defaults to
 * its name, so a scene made for "Cube top" plays on any canvas's "Cube top". */
export const surfaceRole = (surface: Surface) => surface.role?.trim() || surface.name;

/** The show as the given canvas renders the given clip: that canvas and scene
 * active, and the scene's layers retargeted to this canvas's surfaces by role.
 * A scene is reusable on any canvas without copying it. */
export function showForClip(show: MapShow, canvasID: string, clip: SceneClip): MapShow {
  const canvas = show.scenes.find(c => c.id === canvasID);
  if (!canvas) return show;
  // Main is each canvas's own content: nothing to retarget.
  if (clip.sceneID === MAIN_TIMELINE) return { ...show, activeSceneId: canvasID, activeTimelineID: undefined, mix: undefined };
  const surfaceByID = new Map(show.scenes.flatMap(c => c.surfaces.map(s => [s.id, s] as const)));
  const retarget = (target: VisualTarget): VisualTarget[] => {
    if (target.sceneID === canvasID) return [target];
    if (!target.surfaceID) return [{ sceneID: canvasID }];
    const source = surfaceByID.get(target.surfaceID);
    if (!source) return [];
    const role = surfaceRole(source);
    const surfaceID = clip.roleOverrides?.[role] ?? canvas.surfaces.find(s => surfaceRole(s) === role)?.id;
    return surfaceID ? [{ sceneID: canvasID, surfaceID }] : [];
  };
  const timeline = clip.sceneID === MAIN_TIMELINE ? undefined : clip.sceneID;
  const tracks = new Map((show.tracks ?? []).map(t => [t.id, t]));
  const inScene = (trackID?: string) => (tracks.get(trackID ?? '')?.timelineID ?? MAIN_TIMELINE) === clip.sceneID;
  return { ...show, activeSceneId: canvasID, activeTimelineID: timeline, mix: undefined,
    visuals: show.visuals?.map(v => inScene(v.trackID) ? { ...v, targets: v.targets.flatMap(retarget) } : v),
    tracks: show.tracks?.map(t => (t.timelineID ?? MAIN_TIMELINE) === clip.sceneID ? { ...t, targets: t.targets.flatMap(retarget) } : t) };
}

export function newSceneClip(sceneID: string, startS: number, durationS: number): SceneClip {
  return { id: nextId('clip'), sceneID, startS, durationS, inS: 0, loop: true };
}

/** Cues whose time was crossed moving the playhead from `fromS` to `toS`. */
export function crossedCues(show: MapShow, fromS: number, toS: number): ShowCue[] {
  if (toS <= fromS) return [];
  return (activeShow(show)?.cues ?? []).filter(c => c.trigger === 'timeline' && c.atS !== undefined && c.atS > fromS && c.atS <= toS);
}

/** The show clock as a timeline the audio engine can play: the show's
 * soundtrack becomes one audio track on `SHOW_CLOCK`. */
export function withShowAudio(show: MapShow, program: ShowTimeline | undefined = activeShow(show)): MapShow {
  const clips = program?.audio ?? [];
  const trackID = `${SHOW_CLOCK}-audio`;
  return { ...show, activeTimelineID: SHOW_CLOCK,
    timelines: [...(show.timelines ?? []).filter(t => t.id !== SHOW_CLOCK), { id: SHOW_CLOCK, name: 'Show', sceneID: show.activeSceneId, durationS: program?.durationS ?? 60 }],
    tracks: [...(show.tracks ?? []), { id: trackID, name: 'Show audio', kind: 'audio', timelineID: SHOW_CLOCK, targets: [{ sceneID: show.activeSceneId }], enabled: true, locked: false }],
    visuals: [...(show.visuals ?? []), ...clips.map(a => ({ id: a.id, name: 'Show audio', trackID, startS: a.startS, durationS: a.durationS, inS: a.inS, loop: false,
      targets: [], mapping: 'repeat' as const, opacity: a.gain ?? 1, color: '#32cf84', source: { mediaId: a.mediaId, rect: [0, 0, 1, 1] as [number, number, number, number] } }))] };
}

/** Whether a cue may fire now: its condition holds and its loop has repeats
 * left. `fired` counts this run's firings by cue id. */
export function cueAllowed(cue: ShowCue, controls: Record<number, number>, fired: ReadonlyMap<string, number>): boolean {
  if (cue.when && !((controls[cue.when.control] ?? 0) > cue.when.above)) return false;
  return !(cue.action === 'jump' && cue.times !== undefined && (fired.get(cue.id) ?? 0) >= cue.times);
}
