import type { VectorGradient } from '@aether/sketch';
import type { SurfaceBend } from './mask/bend';
import type { AlphaMask } from './mask/alpha';
/**
 * The Aether Map show document.
 *
 * Coordinate conventions, per dev/docs/roadmap/Aether_Map.md:
 *   - corners      four scene-artboard pixel pairs, clockwise from top-left
 *   - source.rect  [x, y, width, height] in the media's own pixel space
 *   - mask         scene-artboard pixel pairs, same space as corners
 *   - origin       top-left, y down, matching CSS
 */

import type { Lfo, CameraSource, DrawnSource, FeatureAnimation, FeatureKind, FeatureTransform, OutputCrop, ShaderSource, TrackerSource } from "./features/types";
import { scheduleActive } from "./output-schedule";

/**
 * How a surface with no media yet is drawn, so its shape and warp stay visible
 * while you align it.
 *
 * There are two of these, and they are deliberately allowed to differ. The
 * editor is for manipulating a plane — it wants corner pins, translucency and
 * whatever reads against the setup photo. The projector is for judging the
 * mapping against a real contour in a dark room — it wants hard contrast and
 * nothing that is not light. Everywhere else in Map the viewport must render
 * exactly what the projector renders; this is the one place that rule is wrong,
 * because the two are answering different questions.
 *
 * Both live in the document rather than in a browser preference: a paired Pi
 * has no access to a preference, and its projection has to look the way the
 * show says.
 */
export type SurfacePattern = "fill" | "grid" | "checker";

export interface SurfaceAppearance {
  pattern: SurfacePattern;
  /** The field colour, or the checkerboard's first square. */
  primary: string;
  /** Grid lines, or the checkerboard's second square. Unused by "fill". */
  secondary: string;
  border: string;
  /** Cells across; the same count down, so the grid follows the surface. */
  sections: number;
  opacity: number;
  /** Corner handle radius in screen pixels. Editor only — nothing pins a wall. */
  pinSizePx: number;
}

export interface SurfaceLook { device: SurfaceAppearance; external: SurfaceAppearance }

export const DEFAULT_SURFACE_LOOK: SurfaceLook = {
  /**
   * On screen: a violet checkerboard with a white edge and white pins. Two near
   * shades rather than one flat colour, because a checker reads as a *surface*
   * against a photographed wall where a flat fill reads as a hole, and the
   * squares show a warp the moment you drag a corner.
   */
  device: { pattern: "checker", primary: "#5b5bd6", secondary: "#7b7be6", border: "#ffffff",
    sections: 6, opacity: 1, pinSizePx: 9 },
  /**
   * On the wall: black and white. Maximum contrast is the whole job in a dark
   * room, and a checker's corners are easier to line up against a physical edge
   * than a grid's lines are.
   */
  external: { pattern: "checker", primary: "#000000", secondary: "#ffffff", border: "#ffffff",
    sections: 6, opacity: 1, pinSizePx: 0 },
};

import type { Point, CubicControls, NodeMode } from '@aether/sketch';
export type { Point } from '@aether/sketch';
export type Quad = [Point, Point, Point, Point];
export type MaskCurve = CubicControls;

/** [x, y, width, height] in the media's own pixel space. */
export type Rect = [number, number, number, number];

export type MediaKind = "image" | "video" | "audio";

/**
 * Where an imported asset came from, when it came from a provider rather than
 * the operator's own disk. Kept with the media because most open licences
 * require credit, and a show that travels without its attribution is a show
 * that cannot legally be projected.
 */
export interface MediaCredit {
  provider: string;
  creator: string;
  license: string;
  sourceUrl: string;
  /** The provider's own ready-made credit line. */
  text: string;
}

export interface MediaRef {
  id: string;
  /** Stored filename in the media store, "<id>.<ext>". */
  file: string;
  name: string;
  kind: MediaKind;
  bytes: number;
  duration?: number;
  /** Natural pixel size, needed to map source.rect onto the element. */
  width: number;
  height: number;
  /** Absent for a file the operator supplied themselves. */
  credit?: MediaCredit;
}

/**
 * A cue sets a surface's state at a moment in the show. Evaluation applies
 * every cue at or before the playhead in time order, so a show is a function
 * of time alone — the editor and the projector cannot drift.
 */
export type CueAction = "show" | "hide" | "opacity";

export interface Cue {
  id: string;
  timeS: number;
  action: CueAction;
  /** Target opacity for "opacity" cues; ignored otherwise. */
  value?: number;
}

/** Text drawn straight onto a surface — a sign, a countdown, a warning. */
export interface TextContent {
  text: string;
  sizePx: number;
  color: string;
  background: string;
  align: "left" | "center" | "right" | "justify";
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  lineHeight?: number;
  letterSpacingPx?: number;
  /** Optional embedded font data URL, travels with the show. */
  fontData?: string;
  /** The embedded face keeps its identity when another family is selected. */
  fontName?: string;
}

export const DEFAULT_TEXT: TextContent = {
  text: "Text",
  sizePx: 96,
  color: "#ffffff",
  background: "transparent",
  align: "center",
};

/**
 * A clip places a media asset on a layer for a span of the scene, the way a
 * clip sits on a track in a video editor. `inS` is where playback starts
 * inside the asset; a looping clip repeats the asset until its span ends.
 */
export interface Clip {
  id: string;
  /** Legacy media clips use mediaId; new assets own their complete input source. */
  mediaId?: string;
  source?: Surface["source"];
  name?: string;
  enabled?: boolean;
  locked?: boolean;
  startS: number;
  durationS: number;
  inS: number;
  loop: boolean;
}

/** Identity colours for layers, assigned in turn as layers are created. */
const LAYER_COLORS = [
  "#4c9dff",
  "#ff8a3d",
  "#8b87ff",
  "#32cf84",
  "#e7a843",
  "#36d6c3",
  "#ff5c8a",
  "#c7d3de",
] as const;

export function layerColor(index: number): string {
  return LAYER_COLORS[((index % LAYER_COLORS.length) + LAYER_COLORS.length) % LAYER_COLORS.length];
}

export interface Surface {
  /** Editor-only head-on view ratio; projection geometry stays unchanged. */
  compositionAspectRatio?: number;
  /** A full-scene visual track. Ordinary layer order determines what it covers. */
  sceneCanvas?: boolean;
  id: string;
  name: string;
  enabled: boolean;
  kind?: FeatureKind;
  locked?: boolean;
  lockAspectRatio?: boolean;
  shape?: "rectangle" | "ellipse";
  /** A regular polygon's editable outline; absent for freeform sketches. */
  polygonSides?: number;
  radiusPx?: number;
  transform?: FeatureTransform;
  animation?: FeatureAnimation;
  /** Surface-space motion; live devices are never activated by saved assignments. */
  modulation?: Partial<Record<import('./features/types').AnimatedProperty, import('./features/types').ShaderModulation>>;
  /** The layer's identity colour: its dot, its outline, its clips. */
  color: string;
  /**
   * Folder name scoped to the owning scene (or workspace root). Members are
   * contiguous in paint order; optional owner.folders also retains empty folders.
   */
  /** The name scenes use to find this surface on any canvas; defaults to its name. */
  role?: string;
  folder?: string;
  /** Created as a linked multi-face shape, distinct from a manual folder. */
  /** null records an intentional regroup, so old-file inference cannot restore it. */
  groupShape?: "cube" | "box" | null;
  corners: Quad;
  /** Same non-null identity joins corners in one scene; never across artboards. */
  cornerWelds?: [string | null, string | null, string | null, string | null];
  /**
   * Legacy continuous input, or the resolved input during rendering. New authored
   * assets keep their input on Clip.source. Rect is in source pixels; the surface
   * owns the destination geometry regardless of which content is active.
   */
  source: { motion?: import('./source-motion').SourceMotion; chromaKey?: import('./media/chroma-key').ChromaKey; effects?: import('./visual-model').VisualEffect[]; mediaId: string | null; rect: Rect; fit?: "contain" | "cover" | "stretch"; text?: TextContent; fill?: string; fillGradient?: VectorGradient; fillOpacity?: number; shader?: ShaderSource; webcam?: CameraSource; tracker?: TrackerSource; testPattern?: "grid" | "bars"; drawing?: DrawnSource };
  /**
   * The surface's outline, in output space: the sketch profile it was drawn
   * as. Empty means the quad itself. A rectangle needs no outline; any other
   * profile keeps its shape here while `corners` (its bounding box) carries
   * the warp. Several shapes use maskFillRule when present; older files union them.
   */
  masks: Point[][];
  /** Missing means legacy union of independent outlines. */
  maskFillRule?: "evenodd" | "nonzero";
  /** Cubic controls for each outgoing outline edge, in scene pixels. */
  maskCurves?: (Array<MaskCurve | null>)[];
  maskNodeModes?: NodeMode[][];
  /** Source-quad alpha silhouette, shared by mapping, visuals and projected output. */
  alphaMask?: AlphaMask;
  bend?: SurfaceBend;
  opacity: number;
  /** Alignment preview only; absent means opaque. Never changes projector output. */
  mappingOpacity?: number;
  /** Layer order is array order: later surfaces paint on top. */
  cues: Cue[];
  /**
   * The surface track's content. Each clip owns its start, duration and input.
   * Tracks show the clip covering the playhead and nothing in gaps. Old surfaces
   * without clips or the sequence flag retain their continuous source.
   */
  clips: Clip[];
  /** An authored content track stays empty when its last asset is removed. */
  sequence?: boolean;
}

/**
 * A scene is an artboard you can cut to: its own dimensions and layers. Media is owned by the show, so the same clip can appear in several
 * scenes without being stored twice.
 */
export interface Scene {
  id: string;
  name: string;
  artboard?: { widthPx: number; heightPx: number };
  /**
   * Off the editor canvas, and nothing more. A hidden scene still plays, still
   * outputs, and can still be cut to — this is the declutter control for a show
   * with more artboards than you are working on. Absolute, the active scene
   * included: hiding the one you are editing empties the canvas, and the pinned
   * icon on its row is what says why.
   */
  hidden?: boolean;
  /**
   * Out of the show, the way a suppressed feature is out of a CAD model: no
   * output renders it and the crossfader will not fade to it. It stays on the
   * canvas and stays editable, because a scene you are still building is
   * exactly the scene you suppress.
   */
  suppressed?: boolean;
  /** Timeline display range / optional sequence loop endpoint, not a scene limit. */
  durationS: number;
  surfaces: Surface[];
  /** Explicit user-created folders, retained even without members. */
  folders?: string[];
  /** Alignment reference for the editor only; never part of the projection. */
  setupBackground?: {
    corners?: Quad;
    locked?: boolean;
    lockAspectRatio?: boolean;
    mediaId: string;
    visible: boolean;
    opacity: number;
  };
}

/**
 * One device the show plays to: a projector, a monitor window, a cast tab. Each
 * owns the region of a scene it covers and which scene that is — a projector on
 * the house while a lobby screen loops something else.
 *
 * **An output renders only the scene it is bound to.** `sceneId` unset means the
 * output is dark: nothing is connected to it, so there is nothing to show. It
 * does *not* follow the active scene. That fallback was right while the canvas
 * drew one scene at a time, and became a hazard the moment it drew all of them:
 * `activeSceneId` now means "the artboard I am editing", and an output tracking
 * it would repaint the wall every time the operator clicked a different artboard
 * mid-show. Outputs are always created bound and older files are bound on load
 * (`show-file.ts`), so unbound is only ever something you asked for — the way
 * you park a projector dark.
 *
 * `MapShow.output` stays the show-level raster (its pixel size) and the two
 * panic controls, which are deliberately global: a blackout is never per-device.
 */
export interface ShowOutput {
  id: string;
  name: string;
  /** How the picture reaches the device; the device itself is a property below. */
  kind: "monitor" | "cast" | "airplay" | "edge";
  /** The paired edge device this output plays on, when `kind` is "edge". */
  deviceId?: string;
  /** The scene this output shows. Unset renders nothing. */
  sceneId?: string;
  crop?: OutputCrop;
  /** Live window view; absent follows the editor workspace. Deployed playback stays visual. */
  view?: "workspace" | "mapping" | "visualization";
  /** Optional per-output alignment design; otherwise inherits the show's external design. */
  mappingLook?: SurfaceAppearance;
  /** Showtime, for an edge device. Unset always runs; outside it, dark. */
  schedule?: OutputSchedule;
}

/**
 * When an output is allowed to project, in the local time of whatever is
 * drawing it. A projector left on a porch needs to come up at dusk and stop at
 * eleven without anyone present, and without a server to tell it the time.
 *
 * Only an edge device is offered one, and the panel clears it when an output
 * stops being a device. A monitor or a Cast window lives only as long as the
 * machine driving it is awake, and whoever opened it is there to start the
 * show — a schedule would be a rule with nobody it could help. The check in
 * `showForOutput` stays general even so: it is the one place that answers what
 * an output draws, and teaching it about device kinds would buy nothing.
 */
export interface OutputSchedule {
  /** Minutes past local midnight. `to` before `from` runs through midnight. */
  fromMinutes: number;
  toMinutes: number;
  /** Days it runs, 0 = Sunday. Absent or empty means every day. */
  days?: number[];
}

export interface MapShow {
  /** Legacy single show (r15); the normalizer moves it into `shows`. */
  showTimeline?: import('./show-timeline').ShowTimeline;
  /** The document's shows: canvas tracks of scene clips, and cues. */
  shows?: import('./show-timeline').ShowProgram[];
  /** The show open in the Show workspace; the one players play. */
  activeShowID?: string;
  playerShowID?: string;
  /** Independent visual instances. Missing in legacy surface-owned documents. */
  visuals?: import('./visual-model').Visual[];
  /** Four shared oscillators; omitted in older shows. */
  lfos?: Lfo[];
  pool?: import('./media-pool').PoolAsset[];
  tracks?: import('./media-pool').VisualTrack[];
  version: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  timelines?: import('./timelines').MapTimeline[];
  /** Saved editor focus; physical outputs always evaluate Main. */
  activeTimelineID?: string;
  audioOutput?: import('./audio-output').AudioOutput;
  timelineMode?: "standard" | "advanced";
  output: { width: number; height: number; crop?: OutputCrop; blackout?: boolean; testPattern?: boolean };
  /** At least one, always: an empty list would leave nothing to open a window on. */
  outputs: ShowOutput[];
  /** How unmapped surfaces are drawn, in the editor and on the projector. */
  surfaceLook?: SurfaceLook;
  media: MediaRef[];
  /**
   * Layers on the workspace that are not assigned to an artboard. Their
   * geometry is stored in workspace coordinates; scene-owned layers use that
   * scene's local coordinates. This is the same ownership model as objects
   * outside an artboard in a drawing application.
   */
  unassignedSurfaces: Surface[];
  unassignedFolders?: string[];
  scenes: Scene[];
  activeSceneId: string;
  playback: { mode: "continuous" | "loop" | "once" };
  /**
   * The live crossfade. A show is normally one scene; engaging a B scene makes
   * it an instrument you can ride between two, which is what a performance
   * needs and what a timeline cannot do — you cannot rehearse an audience.
   * `blend` is 0 for all of A (the active scene) and 1 for all of B.
   */
  mix?: { sceneId: string | null; blend: number };
}

export function activeScene(show: MapShow): Scene {
  return show.scenes.find((s) => s.id === show.activeSceneId) ?? show.scenes[0];
}

/** Outputs are born bound: an output nobody connected is a dark projector. */
export function newOutput(name: string, sceneId: string, kind: ShowOutput["kind"] = "monitor"): ShowOutput {
  return { id: nextId("out"), name, kind, sceneId };
}

/**
 * Renders `show` as this output sees it. An output bound to a scene simply
 * rebinds `activeSceneId`, so evaluation, sizing and surface lookup all work
 * unchanged — one window's scene is just the active scene, from its own view.
 *
 * An unbound output — or one whose scene has been deleted out from under it —
 * gets a show with no scenes, so `sceneLayers` finds nothing and the device goes
 * black. Emptying the scene list rather than special-casing each consumer keeps
 * the rule in one place: sizing already falls back to the show raster, and every
 * caller already handles a show that renders nothing.
 */
export function showForOutput(
  show: MapShow, output: ShowOutput | undefined,
  /** Now, for an output with a schedule. Outside its hours it goes dark. */
  at: Date = new Date(),
): MapShow {
  if (!output?.sceneId) return { ...show, scenes: [] };
  // Out of hours is the same answer as unbound — nothing to draw — so it is
  // decided here, where every renderer already asks what an output shows,
  // rather than in each of them.
  if (!scheduleActive(output.schedule, at)) return { ...show, scenes: [] };
  const scene = show.scenes.find((entry) => entry.id === output.sceneId);
  if (!scene) return { ...show, scenes: [] };
  return { ...show, activeSceneId: scene.id, activeTimelineID: undefined };
}

/** The output a window or panel means, falling back to the show's first. */
export function findOutput(show: MapShow, id: string | null | undefined): ShowOutput | undefined {
  return show.outputs.find((output) => output.id === id) ?? show.outputs[0];
}

export function newScene(name: string, artboard = { widthPx: 1920, heightPx: 1080 }): Scene {
  return { id: nextId("sc"), name, artboard, durationS: DEFAULT_DURATION_S, surfaces: [] };
}

export const DEFAULT_OUTPUT = { width: 1920, height: 1080 };
export const DEFAULT_DURATION_S = 60;

export function emptyShow(): MapShow {
  const scene = newScene("Canvas 1");
  return {
    version: 3,
    output: { ...DEFAULT_OUTPUT },
    outputs: [newOutput("Output 1", scene.id)],
    // Copied, not shared: a show owns its look, and editing one must never
    // reach through into the default every other show starts from.
    surfaceLook: { device: { ...DEFAULT_SURFACE_LOOK.device }, external: { ...DEFAULT_SURFACE_LOOK.external } },
    media: [],
    unassignedSurfaces: [],
    scenes: [scene],
    activeSceneId: scene.id,
    // A new show is one looping minute; Loop off runs continuously.
    playback: { mode: "loop" },
  };
}

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A new surface covers the middle half of the scene artboard, so it is visible
 * and draggable the moment it is created.
 */
export function newSurface(
  output: { width: number; height: number },
  index: number,
): Surface {
  const w = output.width;
  const h = output.height;
  // Square, centred, cascading. Every new surface starts the same shape whatever
  // the scene's aspect, so its grid reads as square cells and you are warping a
  // known quantity onto the wall rather than un-stretching the artboard first.
  const side = Math.round(Math.min(w, h) * 0.6);
  const nudge = (index % 6) * 24;
  const left = Math.round((w - side) / 2) + nudge;
  const top = Math.round((h - side) / 2) + nudge;
  return {
    id: nextId("s"),
    name: `Surface ${index + 1}`,
    enabled: true,
    color: layerColor(index),
    corners: [
      [left, top],
      [left + side, top],
      [left + side, top + side],
      [left, top + side],
    ],
    // The source box matches the quad, so content and the projection grid land
    // undistorted before anyone drags a corner.
    source: { mediaId: null, rect: [0, 0, side, side] },
    masks: [],
    opacity: 1,
    cues: [],
    clips: [],
  };
}

export function quadCorners(rect: Rect): Quad {
  const [x, y, w, h] = rect;
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** Replace the active scene's surfaces. Most editing is scoped to one scene. */
export function withSurfaces(
  show: MapShow,
  change: (surfaces: Surface[]) => Surface[],
): MapShow {
  const active = activeScene(show);
  if (!active) return show;
  return {
    ...show,
    scenes: show.scenes.map((scene) =>
      scene.id === active.id ? { ...scene, surfaces: change(scene.surfaces) } : scene,
    ),
  };
}


/** The surfaces being edited and projected right now. */
export function activeSurfaces(show: MapShow): Surface[] {
  return activeScene(show)?.surfaces ?? [];
}

/** Every authored surface, including objects parked outside all artboards. */
export function allSurfaces(show: MapShow): Surface[] {
  return [...show.unassignedSurfaces, ...show.scenes.flatMap((scene) => scene.surfaces)];
}

/** The collection that currently owns a surface. `scene` absent means workspace root. */
export function surfaceCollection(
  show: MapShow,
  surfaceID: string,
): { scene: Scene | null; surfaces: Surface[] } | undefined {
  if (show.unassignedSurfaces.some((surface) => surface.id === surfaceID)) {
    return { scene: null, surfaces: show.unassignedSurfaces };
  }
  const scene = show.scenes.find((entry) => entry.surfaces.some((surface) => surface.id === surfaceID));
  return scene ? { scene, surfaces: scene.surfaces } : undefined;
}

/** Change whichever collection owns `surfaceID`, without depending on the active scene. */
export function withSurfaceCollection(
  show: MapShow,
  surfaceID: string,
  change: (surfaces: Surface[]) => Surface[],
): MapShow {
  if (show.unassignedSurfaces.some((surface) => surface.id === surfaceID)) {
    return { ...show, unassignedSurfaces: change(show.unassignedSurfaces) };
  }
  const owner = show.scenes.find((scene) => scene.surfaces.some((surface) => surface.id === surfaceID));
  if (!owner) return show;
  return {
    ...show,
    scenes: show.scenes.map((scene) => scene.id === owner.id
      ? { ...scene, surfaces: change(scene.surfaces) }
      : scene),
  };
}

export interface SceneLayer { scene: Scene; opacity: number; active: boolean }

/**
 * The scenes on screen right now, back to front, with the opacity each is
 * mixed at. One entry normally; two while a crossfade is engaged. A layer at
 * zero is dropped rather than drawn invisibly — at either end of the fader the
 * show costs exactly what it did before the crossfade existed.
 */
export function sceneLayers(show: MapShow, { editor = false } = {}): SceneLayer[] {
  // Suppression is enforced here and nowhere else: every path to a wall — the
  // output window, the edge player, the recorder — comes through this function,
  // so a suppressed scene emits no light wherever it was asked for.
  //
  // `editor` is the canvas, which draws the scene you are working on whether or
  // not it is suppressed: suppression takes a scene out of the show, not off
  // your desk, and a scene you cannot see is a scene you cannot un-suppress.
  // The B scene is dropped either way — there is nothing to rehearse fading to
  // when the show will not play it.
  const a = activeScene(show);
  const b = show.mix?.sceneId ? show.scenes.find((scene) => scene.id === show.mix!.sceneId) : undefined;
  if (!a || (a.suppressed && !editor)) return [];
  if (!b || b.id === a.id || b.suppressed) return [{ scene: a, opacity: 1, active: true }];
  const blend = Math.min(1, Math.max(0, show.mix?.blend ?? 0));
  return [
    { scene: a, opacity: 1 - blend, active: true },
    { scene: b, opacity: blend, active: false },
  ].filter((layer) => layer.opacity > 0);
}

/**
 * Layer order is paint order, so a folder has to be one contiguous run or the
 * tree would claim a z-order the renderer does not have. Each folder's run sits
 * where its first member sat and members keep their relative order; loose
 * layers keep their own positions, so folders and loose layers still interleave.
 * Idempotent: a correctly grouped list comes back unchanged.
 */
export function groupSurfaces(list: Surface[]): Surface[] {
  const out: Surface[] = [];
  const placed = new Set<string>();
  for (const surface of list) {
    if (placed.has(surface.id)) continue;
    if (!surface.folder) { out.push(surface); placed.add(surface.id); continue; }
    for (const member of list) {
      if (member.folder === surface.folder && !placed.has(member.id)) {
        out.push(member);
        placed.add(member.id);
      }
    }
  }
  return out;
}

/** Folder names in paint order, topmost last — the order the tree reads them. */
export function surfaceFolders(list: readonly Surface[]): string[] {
  const names: string[] = [];
  for (const surface of list)
    if (surface.folder && !names.includes(surface.folder)) names.push(surface.folder);
  return names;
}
