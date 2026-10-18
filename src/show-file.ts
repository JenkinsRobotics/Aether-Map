import { surfaceMotionVersion } from './features/surface-parameters';
import { visualLookVersion,VISUAL_LOOK_SLOTS } from './visual-looks';
import { readSourceMotion, sourceMotionVersion } from './source-motion';
import { readVisualMotion, visualMotionVersion } from './visual-motion';
import { readParameterKeys } from './features/parameter-animation';
import { readModulation } from './features/read-features';
import { isEffectKind, effectAmount, effectDefinition } from './visual-effects';
import { readChromaKey } from './media/chroma-key';
import { readAudioOutput } from './audio-output';
import { readVisualPlacement } from './visual-placement';
import { validateTimelines } from './timelines';
import { readTrackEQ } from './live/timeline-audio-engine';
import type { Visual, VisualEffect } from './visual-model';
import { isVectorGradient } from '@aether/sketch';
import { readBend } from './mask/bend';
import { readAlphaMask } from './mask/alpha';
import {
  DEFAULT_DURATION_S,
  DEFAULT_OUTPUT,
  DEFAULT_SURFACE_LOOK,
  DEFAULT_TEXT,
  groupSurfaces,
  layerColor,
  type Clip,
  type MapShow,
  type Scene,
  type SurfaceAppearance,
  type SurfaceLook,
  type ShowOutput,
  type TextContent,
  type Cue,
  type CueAction,
  type MediaRef,
  type Point,
  type Quad,
  type Rect,
  type Surface,
} from "./document";
import { readLfos, readFeatureFields, readGeneratedSources, readOutputCrop } from "./features/read-features";
import { restoreLegacyCompoundShapes } from "./features/shape-groups";
import { isLegacyRegularHexagon } from "./mask/geometry";
import { readMaskCurves, readMaskNodeModes } from './mask/curves';

/**
 * `.aethermap` is JSON. The same schema is what ships to an output device as
 * `layout.json`, so there is one parser and one round-trip test rather than a
 * second format that can disagree with this one.
 */

export function serializeShow(show: MapShow): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(surfaceMotionVersion(visualLookVersion(sourceMotionVersion(visualMotionVersion(show)))), null, 2));
}

export function parseShow(bytes: Uint8Array | string): MapShow {
  const text = typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file is not an Aether Map show.");
  }
  if (!isRecord(raw)) throw new Error("This file is not an Aether Map show.");
  // 1 and 2 are migrated to 3 below; anything newer was written by a later
  // Aether Map and guessing at it would corrupt the file on the next save.
  if (raw.version !== 1 && raw.version !== 2 && raw.version !== 3 && raw.version !== 4 && raw.version !== 5 && raw.version !== 6 && raw.version !== 7 && raw.version !== 8 && raw.version !== 9 && raw.version !== 10 && raw.version !== 11 && raw.version !== 12) {
    throw new Error(`Unsupported show version ${String(raw.version)}.`);
  }
  // What an output with no `sceneId` means is exactly what changed in 3: before
  // it meant "follow the active scene", now it means the output is dark. The
  // field cannot distinguish the two on its own — an unbound output writes no
  // key either way — so the file's version is what tells them apart.
  const legacyOutputs = raw.version === 1 || raw.version === 2;

  const output = isRecord(raw.output) ? raw.output : {};
  surfaceOrdinal = 0;
  const scenes = readScenes(raw).map(scene => scene.artboard ? scene : { ...scene, artboard: {
    widthPx: positive(output.width, DEFAULT_OUTPUT.width), heightPx: positive(output.height, DEFAULT_OUTPUT.height),
  } });
  const requested = String(raw.activeSceneId ?? "");
  // Resolved before the outputs are read, because an output saved without a
  // scene used to mean "follow the active scene" and is bound to that very
  // scene on load — the show has to open showing what it showed when it closed.
  const activeSceneId = scenes.some((scene) => scene.id === requested) ? requested : scenes[0].id;
  const parsed: MapShow = {
    ...(raw.audioOutput ? { audioOutput:readAudioOutput(raw.audioOutput) } : {}),
    ...(raw.timelineMode === 'advanced' || raw.timelineMode === 'standard' ? { timelineMode: raw.timelineMode } : {}),
    ...(typeof raw.activeTimelineID === 'string' ? { activeTimelineID: raw.activeTimelineID } : {}),
    ...(Array.isArray(raw.timelines) ? { timelines: raw.timelines.filter(isRecord).map(t => ({ id: String(t.id), name: String(t.name ?? 'Timeline'), ...(typeof t.surfaceID === 'string' ? { surfaceID: t.surfaceID } : {}), sceneID: String(t.sceneID), durationS: positive(t.durationS, DEFAULT_DURATION_S) })) } : {}),
    version: raw.version === 12 ? 12 : raw.version === 11 ? 11 : raw.version === 10 ? 10 : raw.version === 9 ? 9 : raw.version === 8 ? 8 : raw.version === 7 ? 7 : raw.version === 6 ? 6 : raw.version === 5 ? 5 : raw.version === 4 ? 4 : 3,
    ...(Array.isArray(raw.pool) ? { pool: raw.pool.filter(isRecord).filter(a => typeof a.id === 'string' && isRecord(a.source)).map(a => ({ id: String(a.id), name: String(a.name ?? 'Asset'), ...(typeof a.folder === 'string' ? { folder: a.folder } : {}), source: readSource(a.source as Record<string, unknown>) })) } : {}),
    ...(Array.isArray(raw.tracks) ? { tracks: raw.tracks.filter(isRecord).filter(t => typeof t.id === 'string').map(t => ({ id: String(t.id), ...(typeof t.timelineID === 'string' ? { timelineID: t.timelineID } : {}), name: String(t.name ?? 'V1'), kind: t.kind === 'audio' ? 'audio' as const : 'video' as const, volume: typeof t.volume === 'number' ? clamp01(t.volume) : 1, solo: t.solo === true, ...(t.eq ? { eq: readTrackEQ(t.eq) } : {}), targets: readTargets(t.targets), enabled: t.enabled !== false, locked: t.locked === true })) } : {}),
    ...(Array.isArray(raw.visuals) ? { visuals: raw.visuals.map(readVisual).filter((v): v is Visual => v !== null) } : {}),
    output: {
      width: positive(output.width, DEFAULT_OUTPUT.width),
      height: positive(output.height, DEFAULT_OUTPUT.height),
      ...(output.crop ? { crop: readOutputCrop(output.crop) } : {}),
      ...(output.blackout !== undefined ? { blackout: output.blackout === true } : {}),
      ...(output.testPattern !== undefined ? { testPattern: output.testPattern === true } : {}),
    },
    ...(Array.isArray(raw.unassignedFolders) ? { unassignedFolders: readFolders(raw.unassignedFolders) } : {}),
    outputs: readOutputs(raw, output, scenes, activeSceneId, legacyOutputs),
    ...readMix(raw, scenes),
    ...(raw.lfos ? { lfos: readLfos(raw.lfos) } : {}),
    surfaceLook: readSurfaceLook(raw, output),
    media: Array.isArray(raw.media) ? raw.media.filter(isRecord).map(readMedia) : [],
    unassignedSurfaces: (raw.version === 3 || raw.version === 4 || raw.version === 5 || raw.version === 6 || raw.version === 7 || raw.version === 8 || raw.version === 9 || raw.version === 10 || raw.version === 11 || raw.version === 12) && Array.isArray(raw.unassignedSurfaces)
      ? groupSurfaces(raw.unassignedSurfaces.filter(isRecord).map(readSurface))
      : [],
    scenes,
    activeSceneId,
    playback: { mode: readMode(raw.playback) },
  };
  if (parsed.version >= 5) {
    const ids = new Set(parsed.pool?.map(a => a.id));
    if (ids.size !== (parsed.pool?.length ?? 0)) throw new Error('This show contains duplicate media pool identities.');
    for (const clip of parsed.visuals ?? []) if (clip.assetID && !ids.has(clip.assetID)) throw new Error(`Missing media pool asset for ${clip.name}.`);
  }
  validateTimelines(parsed);
  return parsed;
}

/**
 * Version 1 held a single flat surface list. It becomes one scene, so a show
 * saved before scenes existed opens unchanged rather than empty.
 */
function readScenes(raw: Record<string, unknown>): Scene[] {
  if (Array.isArray(raw.scenes) && raw.scenes.length > 0) {
    return raw.scenes.filter(isRecord).map(readScene);
  }
  const legacyDuration = isRecord(raw.playback)
    ? positive(raw.playback.durationS, DEFAULT_DURATION_S)
    : DEFAULT_DURATION_S;
  return [
    {
      id: "scene-1",
      name: "Scene 1",
      durationS: legacyDuration,
      surfaces: Array.isArray(raw.surfaces)
        ? restoreLegacyCompoundShapes(raw.surfaces.filter(isRecord).map(readSurface))
        : [],
    },
  ];
}

function readFolders(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((name): name is string => typeof name === "string").map(name => name.trim()).filter(Boolean))] : [];
}

function readScene(raw: Record<string, unknown>): Scene {
  const background = isRecord(raw.setupBackground) ? raw.setupBackground : null;
  return {
    id: String(raw.id ?? "scene"),
    name: String(raw.name ?? "Scene"),
    // Both default to absent, so a show saved before these existed opens with
    // every scene on the canvas and in the show, exactly as it was left.
    ...(raw.hidden === true ? { hidden: true } : {}),
    ...(raw.suppressed === true ? { suppressed: true } : {}),
    ...(isRecord(raw.artboard) ? { artboard: { widthPx: Math.max(1, Math.min(32768, Math.round(positive(raw.artboard.widthPx, DEFAULT_OUTPUT.width)))), heightPx: Math.max(1, Math.min(32768, Math.round(positive(raw.artboard.heightPx, DEFAULT_OUTPUT.height)))) } } : {}),
    durationS: positive(raw.durationS, DEFAULT_DURATION_S),
    ...(Array.isArray(raw.folders) ? { folders: readFolders(raw.folders) } : {}),
    ...(background && typeof background.mediaId === "string" && background.mediaId
      ? { setupBackground: {
          mediaId: background.mediaId,
          ...(Array.isArray(background.corners) && background.corners.length === 4 ? { corners: readQuad(background.corners) } : {}),
          ...(typeof background.locked === "boolean" ? { locked: background.locked } : {}),
          ...(typeof background.lockAspectRatio === "boolean" ? { lockAspectRatio: background.lockAspectRatio } : {}),
          visible: background.visible !== false,
          opacity: typeof background.opacity === "number" && Number.isFinite(background.opacity)
            ? clamp01(background.opacity) : 0.6,
        } }
      : {}),
    // Grouped on read: a folder's members must be one contiguous run, and a
    // hand-edited or older file has no reason to already satisfy that.
    surfaces: groupSurfaces(Array.isArray(raw.surfaces)
      ? restoreLegacyCompoundShapes(raw.surfaces.filter(isRecord).map(readSurface))
      : []),
  };
}

/**
 * A show written before outputs were a list had exactly one, and its region
 * lived on `output.crop`. That becomes the first output here, so an older file
 * opens with the projector it was authored for rather than an empty rail. An
 * explicitly empty list is intentional and must survive saving/reopening.
 */
function readOutputs(raw: Record<string, unknown>, output: Record<string, unknown>, scenes: Scene[], activeSceneId: string, legacy: boolean): ShowOutput[] {
  const list = Array.isArray(raw.outputs) ? raw.outputs.filter(isRecord).map((entry, index) => readOutput(entry, index, scenes, activeSceneId, legacy)) : [];
  if (Array.isArray(raw.outputs)) return list;
  return [{ id: "output-1", name: "Output 1", kind: "monitor", sceneId: activeSceneId,
    ...(output.crop ? { crop: readOutputCrop(output.crop) } : {}) }];
}

function readOutput(raw: Record<string, unknown>, index: number, scenes: Scene[], activeSceneId: string, legacy: boolean): ShowOutput {
  const kind = raw.kind === "cast" || raw.kind === "airplay" || raw.kind === "edge" ? raw.kind : "monitor";
  const bound = typeof raw.sceneId === "string" && scenes.some((scene) => scene.id === raw.sceneId)
    ? raw.sceneId : undefined;
  // An output renders only the scene it is bound to, so an unbound one is dark.
  // Two cases must not be read that way, or opening an old show would black out
  // its projectors: a file written before outputs had to be bound (where no
  // `sceneId` meant "follow the active scene"), and any output whose scene has
  // since been deleted. Both bind to the active scene — what those files
  // projected when they were saved. In a version 3 file an absent `sceneId` is
  // a choice the operator made, and it is left alone.
  const sceneId = bound ?? (legacy || raw.sceneId !== undefined ? activeSceneId : undefined);
  return {
    id: String(raw.id ?? `output-${index + 1}`),
    name: String(raw.name ?? `Output ${index + 1}`),
    kind,
    ...(typeof raw.deviceId === "string" && raw.deviceId ? { deviceId: raw.deviceId } : {}),
    ...(sceneId ? { sceneId } : {}),
    ...(isRecord(raw.crop) ? { crop: readOutputCrop(raw.crop) } : {}),
    ...(raw.view === "workspace" || raw.view === "mapping" || raw.view === "visualization" ? { view: raw.view } : {}),
    ...(isRecord(raw.mappingLook) ? { mappingLook: readSurfaceLook({ surfaceLook: { external: raw.mappingLook } }, {}).external } : {}),
    ...readSchedule(raw.schedule),
  };
}

/**
 * An output's showtime, validated rather than trusted: a projector that a bad
 * file talked into a nonsense window would be dark on the night, with nobody
 * there to notice. Anything that does not read as a window is no window, and
 * no window means always on — the behaviour of every show written before
 * schedules existed.
 */
function readSchedule(raw: unknown): Pick<ShowOutput, "schedule"> | Record<string, never> {
  if (!isRecord(raw)) return {};
  const minutes = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const whole = Math.round(value);
    return whole >= 0 && whole < 24 * 60 ? whole : null;
  };
  const fromMinutes = minutes(raw.fromMinutes);
  const toMinutes = minutes(raw.toMinutes);
  // Equal ends describe no time at all; that is "always on", not "never".
  if (fromMinutes === null || toMinutes === null || fromMinutes === toMinutes) return {};
  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days.filter((day): day is number =>
        typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
    : [];
  return {
    schedule: {
      fromMinutes, toMinutes,
      // Every day is stored as absent, so a file cannot carry two spellings.
      ...(days.length && days.length < 7 ? { days } : {}),
    },
  };
}

/**
 * A B scene that no longer exists collapses the mix rather than blanking half
 * the show; an out-of-range blend is clamped, never trusted.
 */
function readMix(raw: Record<string, unknown>, scenes: Scene[]): Pick<MapShow, "mix"> | Record<string, never> {
  const mix = isRecord(raw.mix) ? raw.mix : null;
  const sceneId = mix && typeof mix.sceneId === "string" ? mix.sceneId : null;
  if (!sceneId || !scenes.some((scene) => scene.id === sceneId)) return {};
  return { mix: { sceneId, blend: Math.min(1, Math.max(0, finite(mix?.blend))) } };
}

/**
 * How planes are drawn, per side. A show written when this was a single
 * `output.surfacePattern` carries that choice into both sides, so reopening one
 * looks the way it was left rather than snapping to a default.
 */
function readSurfaceLook(raw: Record<string, unknown>, output: Record<string, unknown>): SurfaceLook {
  const legacy = output.surfacePattern === "checker" || output.surfacePattern === "grid"
    ? output.surfacePattern : null;
  const stored = isRecord(raw.surfaceLook) ? raw.surfaceLook : {};
  const side = (name: "device" | "external"): SurfaceAppearance => {
    const base = DEFAULT_SURFACE_LOOK[name];
    const r = isRecord(stored[name]) ? stored[name] as Record<string, unknown> : {};
    const pattern = r.pattern === "fill" || r.pattern === "grid" || r.pattern === "checker"
      ? r.pattern : legacy ?? base.pattern;
    return {
      pattern,
      primary: typeof r.primary === "string" ? r.primary : base.primary,
      secondary: typeof r.secondary === "string" ? r.secondary : base.secondary,
      border: typeof r.border === "string" ? r.border : base.border,
      // A zero-section grid has no cells and a thousand has no lines you can
      // see; neither is worth sending to a projector.
      sections: Math.round(Math.min(64, Math.max(1, positive(r.sections, base.sections)))),
      opacity: Math.min(1, Math.max(0, typeof r.opacity === "number" && Number.isFinite(r.opacity) ? r.opacity : base.opacity)),
      pinSizePx: Math.min(64, Math.max(0, typeof r.pinSizePx === "number" && Number.isFinite(r.pinSizePx) ? r.pinSizePx : base.pinSizePx)),
    };
  };
  return { device: side("device"), external: side("external") };
}

function readMode(value: unknown): MapShow["playback"]["mode"] {
  return isRecord(value) && (value.mode === "once" || value.mode === "loop") ? value.mode : "continuous";
}

function readText(value: unknown): TextContent | undefined {
  if (!isRecord(value)) return undefined;
  const align = value.align;
  return {
    text: String(value.text ?? ""),
    sizePx: positive(value.sizePx, DEFAULT_TEXT.sizePx),
    color: String(value.color ?? DEFAULT_TEXT.color),
    background: String(value.background ?? DEFAULT_TEXT.background),
    align: align === "left" || align === "right" || align === "justify" ? align : "center",
    ...(typeof value.fontFamily === "string" ? { fontFamily: value.fontFamily } : {}),
    ...(typeof value.fontName === "string" ? { fontName: value.fontName } : {}),
    ...(typeof value.fontWeight === "number" ? { fontWeight: Math.min(900, Math.max(100, finite(value.fontWeight))) } : {}),
    ...(typeof value.italic === "boolean" ? { italic: value.italic } : {}),
    ...(typeof value.lineHeight === "number" ? { lineHeight: positive(value.lineHeight, 1.2) } : {}),
    ...(typeof value.letterSpacingPx === "number" ? { letterSpacingPx: finite(value.letterSpacingPx) } : {}),
    ...(typeof value.fontData === "string" && /^data:(font\/|application\/(octet-stream|font))/.test(value.fontData) && value.fontData.length < 3000000 ? { fontData: value.fontData } : {}),
  };
}

const CUE_ACTIONS: readonly CueAction[] = ["show", "hide", "opacity"];

function readCue(value: unknown, index: number): Cue {
  const raw = isRecord(value) ? value : {};
  const action = CUE_ACTIONS.find((known) => known === raw.action) ?? "show";
  return {
    id: String(raw.id ?? `cue-${index}`),
    timeS: Math.max(finite(raw.timeS), 0),
    action,
    ...(action === "opacity"
      ? { value: clamp01(typeof raw.value === "number" ? raw.value : 1) }
      : {}),
  };
}

function readMedia(raw: Record<string, unknown>): MediaRef {
  return {
    id: String(raw.id ?? ""),
    file: String(raw.file ?? ""),
    name: String(raw.name ?? "Untitled"),
    kind: raw.kind === "audio" ? "audio" : raw.kind === "video" ? "video" : "image",
    bytes: positive(raw.bytes, 0),
    width: positive(raw.width, DEFAULT_OUTPUT.width),
    height: positive(raw.height, DEFAULT_OUTPUT.height),
    ...(typeof raw.duration === "number" ? { duration: raw.duration } : {}),
    // Round-tripped so credit travels with the show; absent for own files.
    ...(isRecord(raw.credit) ? { credit: {
      provider: String(raw.credit.provider ?? ""),
      creator: String(raw.credit.creator ?? ""),
      license: String(raw.credit.license ?? ""),
      sourceUrl: String(raw.credit.sourceUrl ?? ""),
      text: String(raw.credit.text ?? ""),
    } } : {}),
  };
}

function readClip(value: unknown, index: number): Clip | null {
  if (!isRecord(value) || (!isRecord(value.source) && typeof value.assetID !== 'string' && typeof value.timelineRefID !== 'string' && (typeof value.mediaId !== "string" || !value.mediaId))) return null;
  const durationS = positive(value.durationS, 0);
  if (durationS <= 0) return null;
  return {
    id: String(value.id ?? `clip-${index}`),
    ...(isRecord(value.source) ? { source: readSource(value.source) } : typeof value.mediaId === 'string' ? { mediaId: value.mediaId } : {}),
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}),
    ...(typeof value.locked === 'boolean' ? { locked: value.locked } : {}),
    startS: Math.max(finite(value.startS), 0),
    durationS,
    inS: Math.max(finite(value.inS), 0),
    loop: value.loop !== false,
  };
}

let surfaceOrdinal = 0;

function readSource(source: Record<string, unknown>): Surface['source'] {
  return {
    mediaId: typeof source.mediaId === "string" ? source.mediaId : null,
    rect: readRect(source.rect),
    ...(["contain", "cover", "stretch"].includes(String(source.fit)) ? { fit: source.fit as "contain" | "cover" | "stretch" } : {}),
    ...(readText(source.text) ? { text: readText(source.text)! } : {}),
    ...(typeof source.fill === "string" && source.fill ? { fill: source.fill } : {}),
    ...(isVectorGradient(source.fillGradient) ? { fillGradient: source.fillGradient } : {}),
    ...(typeof source.fillOpacity === "number" && Number.isFinite(source.fillOpacity) ? { fillOpacity: Math.max(0, Math.min(1, source.fillOpacity)) } : {}),
    ...(readChromaKey(source.chromaKey) ? { chromaKey: readChromaKey(source.chromaKey) } : {}),
    ...readGeneratedSources(source),
    ...(readSourceMotion(source.motion) ? { motion: readSourceMotion(source.motion) } : {}),
  };
}

function readSurface(raw: Record<string, unknown>): Surface {
  const source = isRecord(raw.source) ? raw.source : {};
  const ordinal = surfaceOrdinal++;
  const masks = readMasks(raw);
  const polygonSides = typeof raw.polygonSides === "number" && Number.isFinite(raw.polygonSides)
    ? Math.max(3, Math.min(64, Math.floor(raw.polygonSides)))
    : masks.length === 1 && isLegacyRegularHexagon(masks[0]) ? 6 : undefined;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "Surface"),
    enabled: raw.enabled !== false,
    ...readFeatureFields(raw),
    ...(raw.sceneCanvas === true ? { sceneCanvas: true } : {}),
    ...(polygonSides ? { polygonSides } : {}),
    ...(typeof raw.lockAspectRatio === "boolean" ? { lockAspectRatio: raw.lockAspectRatio } : {}),
    ...(typeof raw.sequence === 'boolean' ? { sequence: raw.sequence } : {}),
    ...(typeof raw.folder === "string" && raw.folder.trim() ? { folder: raw.folder.trim() } : {}),
    ...(typeof raw.compositionAspectRatio === 'number' && Number.isFinite(raw.compositionAspectRatio) && raw.compositionAspectRatio >= .05 && raw.compositionAspectRatio <= 20 ? {compositionAspectRatio:raw.compositionAspectRatio} : {}),
    ...(raw.groupShape === "cube" || raw.groupShape === "box" ? { groupShape: raw.groupShape } : {}),
    ...(raw.groupShape === null ? { groupShape: null } : {}),
    // Files from before layers had colours get one by position, so they open
    // looking like they were made today.
    color: typeof raw.color === "string" && raw.color ? raw.color : layerColor(ordinal),
    corners: readQuad(raw.corners),
    ...(Array.isArray(raw.cornerWelds) && raw.cornerWelds.length === 4
      ? { cornerWelds: raw.cornerWelds.map(v => typeof v === 'string' && v.length <= 128 ? v : null) as Surface['cornerWelds'] } : {}),
    source: readSource(source),
    masks,
    ...(raw.maskFillRule === "evenodd" || raw.maskFillRule === "nonzero" ? { maskFillRule: raw.maskFillRule } : {}),
    ...(readBend(raw.bend) ? { bend: readBend(raw.bend) } : {}),
    ...(readAlphaMask(raw.alphaMask) ? { alphaMask: readAlphaMask(raw.alphaMask) } : {}),
    ...(Array.isArray(raw.maskNodeModes) ? { maskNodeModes: readMaskNodeModes(raw.maskNodeModes, masks) } : {}),
    ...(Array.isArray(raw.maskCurves) ? { maskCurves: readMaskCurves(raw.maskCurves, masks) } : {}),
    opacity: typeof raw.opacity === "number" ? clamp01(raw.opacity) : 1,
    ...(typeof raw.mappingOpacity === "number" && Number.isFinite(raw.mappingOpacity)
      ? { mappingOpacity: clamp01(raw.mappingOpacity) } : {}),
    cues: Array.isArray(raw.cues) ? raw.cues.map(readCue) : [],
    clips: Array.isArray(raw.clips)
      ? raw.clips.map(readClip).filter((clip): clip is Clip => clip !== null)
      : [],
  };
}

/** `masks` is the current shape; a single `mask` is what version 1 wrote. */
function readMasks(raw: Record<string, unknown>): Point[][] {
  const shapes: unknown[] = Array.isArray(raw.masks)
    ? raw.masks
    : Array.isArray(raw.mask)
      ? [raw.mask]
      : [];
  return shapes
    .filter((shape): shape is unknown[] => Array.isArray(shape) && shape.length >= 3)
    .map((shape) => shape.map(readPoint));
}

function readQuad(value: unknown): Quad {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error("A surface needs exactly four corners.");
  }
  return value.map(readPoint) as Quad;
}

function readPoint(value: unknown): Point {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("A point needs an x and a y.");
  }
  return [finite(value[0]), finite(value[1])];
}

function readRect(value: unknown): Rect {
  if (!Array.isArray(value) || value.length !== 4) {
    return [0, 0, DEFAULT_OUTPUT.width, DEFAULT_OUTPUT.height];
  }
  return [finite(value[0]), finite(value[1]), finite(value[2]), finite(value[3])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function readVisualEffects(value:unknown):VisualEffect[]{return Array.isArray(value) ? value.filter(isRecord).filter(e => isEffectKind(e.kind)).map((e, i) => ({ id: String(e.id ?? `effect-${i}`), kind: e.kind as VisualEffect['kind'], enabled: e.enabled !== false, amount: effectAmount(e.kind as VisualEffect['kind'], finite(e.amount)), ...(e.modulation ? { modulation: readModulation({ amount: e.modulation }).amount } : {}), ...(e.animation ? { animation: readParameterKeys(e.animation, effectDefinition(e.kind as VisualEffect['kind']).min, effectDefinition(e.kind as VisualEffect['kind']).max) } : {}) })) : [];}
function readVisualLooks(value:unknown):Visual['looks'] {
 if(!isRecord(value))return;
 const looks:NonNullable<Visual['looks']>={};
 for(const slot of VISUAL_LOOK_SLOTS){const raw=value[slot];if(!isRecord(raw)||!isRecord(raw.source))continue;
  const source=readSource(raw.source);if(source.shader)delete source.shader.looks;
  if(raw.shaderOnly===true&&!source.shader)continue;
  looks[slot]={source,...(raw.shaderOnly===true?{shaderOnly:true as const}:{}),opacity:typeof raw.opacity==='number'&&Number.isFinite(raw.opacity)?clamp01(raw.opacity):1,mapping:raw.mapping==='span'?'span':'repeat',
   ...(isRecord(raw.placement)?{placement:readVisualPlacement(raw.placement)}:{}),...(raw.motion?{motion:readVisualMotion(raw.motion)}:{}),effects:readVisualEffects(raw.effects).slice(0,12)};
 }
 return Object.keys(looks).length?looks:undefined;
}

function readVisual(value: unknown, index: number): Visual | null {
  const clip = readClip(value, index);
  if (!clip || !isRecord(value) || (!clip.source && typeof value.assetID !== 'string' && typeof value.timelineRefID !== 'string')) return null;
  const targets = Array.isArray(value.targets) ? value.targets.filter(isRecord).filter(t => typeof t.sceneID === 'string').map(t => ({ sceneID: String(t.sceneID), ...(typeof t.surfaceID === 'string' ? { surfaceID: t.surfaceID } : {}) })) : [];
  const effects=readVisualEffects(value.effects);
  const looks=readVisualLooks(value.looks);
  return { ...clip, ...(looks?{looks}:{}), ...(value.motion ? {motion:readVisualMotion(value.motion,typeof value.timelineRefID === 'string')} : {}), ...(typeof value.timelineRefID === 'string' ? { timelineRefID: value.timelineRefID } : {}), ...(typeof value.assetID === 'string' ? { assetID: value.assetID } : {}), ...(typeof value.trackID === 'string' ? { trackID: value.trackID } : {}), name: String(value.name ?? 'Visual'), targets: targets.filter((t, i) => targets.findIndex(a => a.sceneID === t.sceneID && a.surfaceID === t.surfaceID) === i), mapping: value.mapping === 'span' ? 'span' : 'repeat', color: String(value.color ?? '#547aff'), opacity: typeof value.opacity === 'number' ? clamp01(value.opacity) : 1,
    ...(isRecord(value.placement) ? {placement:readVisualPlacement(value.placement)} : {}), ...(value.continuous === true ? { continuous: true } : {}), ...(typeof value.legacyTrack === 'string' ? { legacyTrack: value.legacyTrack } : {}), ...(value.mask === true ? { mask: true } : {}), ...(effects.length ? { effects } : {}) };
}

function readTargets(value: unknown): import('./visual-model').VisualTarget[] {
  return Array.isArray(value) ? value.filter(isRecord).filter(t => typeof t.sceneID === 'string').map(t => ({ sceneID: String(t.sceneID), ...(typeof t.surfaceID === 'string' ? { surfaceID: t.surfaceID } : {}) })) : [];
}
