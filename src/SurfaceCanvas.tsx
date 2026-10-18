import { useVisualMotionInputs } from './live/use-visual-motion-inputs';
import { useContextCommands } from '@aether/ui';
import { sceneVisuals } from './visual-render';
import { insertMaskPoint } from "./masks";
import { sceneSize } from "./scene-size";
import { artboardAt, artboardBounds, artboardLayout, artboardOrigin } from "./artboards";
import { SceneBackdrop } from "./SceneBackdrop";
import { backdropSurface, editableLayers } from "./background-layer";
import { TransformOverlay } from "./TransformOverlay";
import { useSurfaceInteraction, type ActiveHandle } from "./useSurfaceInteraction";
import type { MappingPreferences } from "./mapping-preferences";
import type { CornerRef } from './corner-welds';
import { nearestCurveEdge, splitMaskEdge, sampleMask } from './mask/curves';
import { CurveHandles } from './mask/CurveHandles';
import { surfacesAt, type SurfaceGeometry } from "./surface-interaction";
import { groupBounds, type GroupGeometryChange } from "./group-interaction";
import { resolveTreeID } from "./scene-tree";
import { CropOverlay } from "./features/CropOverlay";
import { outputRegion } from "./output-crop";
import { sceneOutputs, type SceneOutput } from "./output-connection";
import { useMapDevices } from "./use-map-devices";
import type { OutputDisplay } from "./output-session";
import { DEFAULT_SURFACE_LOOK, findOutput, type SurfaceAppearance } from "./document";
import type { OutputCrop } from "./features/types";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { sourcePictureStyle, alphaProjectionStyle, placementProjectionStyle } from "./source-picture";
import { animateSurface } from "./features/animation";
import { SurfaceMedia } from "./SurfaceMedia";
import { clipStyle } from "./mask/clip";
import { evaluateSurface, mappingSurfaceAt, type ResolvedSurface } from "./playback";
import { ClipDefs } from "./mask/clip.tsx";
import {
  beginDraft, penPointerDown,
  endDraft,
  finishPen,
  isDrawingTool,
  moveDraft,
  previewShape,
  type Draft,
  type MaskTool,
} from "./mask/tools";
import {
  type MediaRef,
  type MapShow,
  type Point,
  type Quad,
  type Surface,
} from "./document";
import {
  actualSize,
  cssTransform,
  fitView,
  panBy,
  toContent,
  wheelPixels,
  zoomAt,
  type View,
} from "./viewport";

export interface SurfaceCanvasProps {
  mappingPreferences?: MappingPreferences;
  onMappingPreferences?: (patch: Partial<MappingPreferences>) => void;
  onActiveHandle?: (handle: ActiveHandle | null) => void;
  onWeldCorners?: (a: CornerRef, b: CornerRef) => void;
  onCurveControl?: (id: string, shape: number, edge: number, control: 'c1' | 'c2', point: Point, independent?: boolean) => void;
  /** Mapping freezes calibration geometry; its optional visual preview follows the playhead. */
  previewMode?: "mapping" | "visualization";
  /** The document: outlines and handles come from here, so a layer whose
   *  sequence is empty at the playhead can still be selected and aligned. */
  show: MapShow;
  onCrop?: (crop: OutputCrop) => void;
  /** The show evaluated at the playhead: what actually gets drawn. */
  resolved: MapShow;
  /** Object URLs or host URLs for loaded media, keyed by media id. */
  mediaUrls: Record<string, string>;
  selectedID: string | null;
  onSelect: (id: string | null) => void;
  /** Clicking another artboard makes its scene the one being edited. */
  onSelectScene: (sceneID: string) => void;
  /** Dropping a moved layer or compound onto another artboard reparents it. */
  onMoveToScene?: (id: string, sceneID: string | null, coordinateOffset: Point) => void;
  onCorners: (id: string, corners: Quad) => void;
  onGeometry: (id: string, geometry: SurfaceGeometry) => void;
  onGroupGeometry: (id: string, changes: GroupGeometryChange[]) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onGestureStart?: () => void;
  onGestureEnd?: (cancel?: boolean) => void;
  /** One outline shape's points changed (drag or nudge). */
  onMaskPatch?: (id: string, patch: Partial<Surface>) => void;
  onMaskShape: (id: string, shape: number, points: Point[]) => void;
  /** A drawing tool finished a closed profile: it becomes a surface. */
  onDrawShape: (shape: Point[], constrained?: boolean, curves?: Surface["maskCurves"], nodeModes?: Surface["maskNodeModes"]) => void;
  /** The active sketch tool; the ribbon owns switching it. */
  tool: MaskTool;
  /** Playhead, so preview clips sit where the projector's would. */
  timeS: number;
  playing: boolean;
  /** Which output's region the overlay edits; the show's first if unset. */
  outputID?: string | null;
  /** What each output window reports about itself, keyed by output id. An
   *  artboard is marked with the outputs aimed at its scene, and an output
   *  only reads as live once something is actually showing its picture. */
  displays?: Record<string, OutputDisplay>;
  /** The saved document, for deciding whether an edge player is playing it. */
  documentID?: string | null;
  /** Brush, while the paint tool is active. */
  paint?: { color: string; widthPx: number; onColor: (color: string) => void; onWidth: (widthPx: number) => void };
}


/**
 * The projector's output raster, drawn to fit. Every coordinate inside the
 * raster is an output-space pixel; only the outer wrapper is scaled, so
 * nothing downstream has to know about the fit.
 *
 * With a drawing tool active the overlay stops taking pointer events, so a
 * gesture anywhere over the raster draws — over a surface or not — and the
 * handles cannot be grabbed by accident mid-stroke. The conventions are CAD's
 * sketch: click-click for a pen, drag for a shape, Enter to finish, Esc to
 * cancel.
 */
export function SurfaceCanvas({
  mappingPreferences,
  onMappingPreferences,
  onActiveHandle,
  onWeldCorners,
  onCurveControl,
  previewMode = "visualization",
  show,
  onCrop,
  resolved,
  mediaUrls,
  selectedID,
  onSelect,
  onSelectScene,
  onMoveToScene,
  onCorners, onGeometry, onGroupGeometry, onDelete, onEdit, onGestureStart, onGestureEnd,
  onMaskShape, onMaskPatch,
  onDrawShape,
  tool,
  timeS: playheadTimeS,
  playing,
  outputID,
  displays,
  documentID = null,
  paint,
}: SurfaceCanvasProps) {
  const mapping = previewMode === "mapping";
  const showVisual = mappingPreferences?.showVisual === true;
  const timeS = mapping ? 0 : playheadTimeS;
  const motionInputs=useVisualMotionInputs();
  const surfaceMotion = { ...motionInputs, lfos: show.lfos, sceneTimeS: timeS, ...(mapping ? { modulation: false as const } : {}) };
  const hostRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const warp = tool === "node";
  const [localSnapping, setLocalSnapping] = useState(true);
  const snapping = mapping ? mappingPreferences?.snapping ?? localSnapping : localSnapping;
  const setSnapping = (value: boolean) => mapping && onMappingPreferences
    ? onMappingPreferences({ snapping: value }) : setLocalSnapping(value);
  const [xray, setXray] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const { width, height } = sceneSize(show);
  // Every scene is on the canvas, side by side. Only the active artboard is
  // interactive: clicking another one makes it active first, which is why
  // every hit test, overlay and tool below still deals with exactly one scene
  // and needed no change when the canvas stopped showing exactly one.
  const layout = useMemo(() => artboardLayout(show), [show]);
  const bounds = useMemo(() => {
    const artboards = artboardBounds(layout);
    return {
      width: Math.max(artboards.width, ...show.unassignedSurfaces.flatMap(surface => surface.corners.map(point => point[0])), 1),
      height: Math.max(artboards.height, ...show.unassignedSurfaces.flatMap(surface => surface.corners.map(point => point[1])), 1),
    };
  }, [layout, show.unassignedSurfaces]);
  // Which outputs are aimed at each scene, so an artboard can say whose picture
  // it is. Keyed by scene rather than looked up per artboard: a show with four
  // scenes and four outputs would otherwise walk the output list sixteen times
  // on every frame of a pan.
  const { list: deviceList, online } = useMapDevices();
  const outputsByScene = useMemo(() => {
    const byScene = new Map<string, SceneOutput[]>();
    for (const scene of show.scenes) {
      const aimed = sceneOutputs(show.outputs, scene.id, displays ?? {}, deviceList, online, documentID);
      if (aimed.length) byScene.set(scene.id, aimed);
    }
    return byScene;
  }, [show.scenes, show.outputs, displays, deviceList, online, documentID]);
  /**
   * An artboard's projection state: nothing, aimed, or actually on a device.
   * "aimed" is an output bound to the scene whose picture is not reaching
   * anything yet — the show as set up rather than the show as running.
   */
  const projection = useCallback((sceneID: string): "live" | "aimed" | undefined => {
    const aimed = outputsByScene.get(sceneID);
    if (!aimed?.length) return undefined;
    return aimed.some((entry) => entry.connection?.live) ? "live" : "aimed";
  }, [outputsByScene]);
  const [originX, originY] = useMemo(
    () => artboardOrigin(layout, show.activeSceneId), [layout, show.activeSceneId]);
  // Absent when the scene being edited is hidden. Hiding is absolute — the
  // active scene is no exception — so the canvas empties and the pinned icon on
  // its row in the Scenes panel is what explains the empty canvas.
  const activeBoard = layout.find((board) => board.scene.id === show.activeSceneId);
  const scale = view.scale;
  const interaction = useSurfaceInteraction({ hostRef, show, selectedID, scale, timeS, motion: surfaceMotion, snapping, nodeEditing: warp,
    snapDistancePx: mapping ? mappingPreferences?.snapDistancePx : undefined, onActiveHandle,
    onWeldCorners: mapping ? onWeldCorners : undefined,
    onCurveControl,
    onSelect, onGeometry, onGroupGeometry, onCorners, onMaskShape, onDelete, onEdit, onGestureStart, onGestureEnd });
  const { active } = interaction;
  const drawing = isDrawingTool(tool);
  const backdrop = backdropSurface(show);
  // An unselected backdrop is clipped both visually and for pointer picking.
  const pickableLayers = ([x, y]: Point) => editableLayers(show).filter(surface =>
    (!mapping || !surface.sceneCanvas) && (surface.id !== backdrop?.id || surface.id === selectedID || (x >= 0 && y >= 0 && x <= width && y <= height)));
  const selectedLayer = editableLayers(show).find(s => s.id === selectedID && s.enabled && !s.locked);
  const selectedLooseLayer = show.unassignedSurfaces.find(s => s.id === selectedID && s.enabled && !s.locked);
  const target = selectedID ? resolveTreeID(show, selectedID) : undefined;
  const selectedGroup = target?.kind === "folder" && target.scene?.id === show.activeSceneId ? target : undefined;
  const selectedLooseGroup = target?.kind === "folder" && !target.scene ? target : undefined;
  const selectedGroupMembers = selectedGroup
    ? selectedGroup.scene!.surfaces.filter(surface => surface.folder === selectedGroup.folder) : [];
  const selectedLooseGroupMembers = selectedLooseGroup
    ? show.unassignedSurfaces.filter(surface => surface.folder === selectedLooseGroup.folder) : [];
  const selectedGroupBounds = groupBounds(selectedGroupMembers, timeS, surfaceMotion);
  const selectedLooseGroupBounds = groupBounds(selectedLooseGroupMembers, timeS, surfaceMotion);
  const selectedOutput = findOutput(show, outputID);
  const outputRegionBelongsTo = (sceneID: string) => Boolean(
    onCrop && selectedOutput?.sceneId === sceneID,
  );
  const selectedOutputLive = Boolean(selectedOutput && outputsByScene.get(selectedOutput.sceneId ?? "")
    ?.find((entry) => entry.output.id === selectedOutput.id)?.connection?.live);
  const look = (show.surfaceLook ?? DEFAULT_SURFACE_LOOK).device;
  const pinRadius = mapping ? mappingPreferences?.pinSizePx ?? look.pinSizePx : look.pinSizePx;

  const containerSize = useCallback(() => {
    const host = hostRef.current;
    return { width: host?.clientWidth ?? 0, height: host?.clientHeight ?? 0 };
  }, []);

  const autoFitRef = useRef(true);
  // Read through a ref so `fit` never changes identity. `bounds` is derived from
  // the document, so it is a new object on every edit; when `fit` depended on it
  // the effect below tore down and rebuilt on every keystroke — and, worse,
  // re-armed auto-fit each time, so nudging a corner threw away wherever the
  // operator had put the canvas and snapped it back to the default.
  const boundsRef = useRef(bounds);
  useEffect(() => { boundsRef.current = bounds; }, [bounds]);

  // Fit means the whole show now, not the active scene: the point of laying the
  // artboards out is seeing them together.
  const fit = useCallback(
    () => { autoFitRef.current = true; setView(fitView(containerSize(), boundsRef.current)); },
    [containerSize],
  );

  const zoomCanvas = (factor: number) => {
    autoFitRef.current = false;
    const size = containerSize();
    setView(current => zoomAt(current, factor, size.width / 2, size.height / 2));
  };
  useContextCommands([
    { id:'zoom-in', label:'Zoom in', heading:'Canvas view', separatorBefore:true, run:() => zoomCanvas(1.25) },
    { id:'zoom-out', label:'Zoom out', run:() => zoomCanvas(.8) },
    { id:'zoom-fit', label:'Fit canvas', shortcut:'F', run:fit },
    { id:'zoom-actual', label:'Actual size (100%)', run:() => { autoFitRef.current = false; const centred = actualSize(containerSize(), { width, height }); setView({ ...centred, x:centred.x - originX, y:centred.y - originY }); } },
  ], hostRef);

  // Fit, but only when fitting means anything: the view is still the automatic
  // one, and the host has been laid out. An unmeasured host fits to nothing and
  // leaves a degenerate scale behind, which every coordinate conversion then
  // inherits.
  const maybeFit = useCallback(() => {
    const host = hostRef.current;
    if (!autoFitRef.current || !host) return;
    if (host.clientWidth <= 0 || host.clientHeight <= 0) return;
    fit();
  }, [fit]);

  // Keep the fitted view fitted while the shell settles or the timeline is
  // resized. Manual zoom/pan opts out until Fit is requested again. Mount-only:
  // auto-fit is armed once, at the ref's initial value, and after that only the
  // Fit control re-arms it. Editing the show is not a request to move the canvas.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(maybeFit);
    observer.observe(host);
    maybeFit();
    return () => observer.disconnect();
  }, [maybeFit]);

  // What "everything" means does change — a new scene, a resized artboard — and
  // a view that is still the automatic one should follow it. By value, not by
  // identity: the numbers are what moved, if anything did.
  useEffect(() => { maybeFit(); }, [bounds.width, bounds.height, maybeFit]);

  /**
   * Trackpad and mouse, the way every canvas tool behaves: scroll and pinch
   * zoom about the pointer, shift+scroll nudges sideways. Bound natively
   * because React's onWheel is passive and cannot preventDefault, which would
   * let the page scroll instead.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      autoFitRef.current = false;
      const box = host.getBoundingClientRect();
      const pointX = event.clientX - box.left;
      const pointY = event.clientY - box.top;
      if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
        setView((current) =>
          panBy(current, -wheelPixels(event.deltaX || event.deltaY, event.deltaMode), 0),
        );
        return;
      }
      // Pinch reports much larger deltas than a wheel notch; damp it so a
      // trackpad and a mouse feel like the same gesture.
      const pinch = event.ctrlKey || event.metaKey;
      const delta = wheelPixels(event.deltaY, event.deltaMode);
      setView((current) =>
        zoomAt(current, Math.exp(-delta / (pinch ? 100 : 250)), pointX, pointY),
      );
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, []);

  // Space is the universal "grab the canvas" modifier.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, button, a, [role=button], [contenteditable]")
      )
        return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    addEventListener("blur", blur);
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => {
      removeEventListener("blur", blur);
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
    };
  }, []);

  // Switching tools abandons a half-drawn shape rather than leaving it hanging.
  useEffect(() => setDraft(null), [tool]);

  /** Container-space pointer → canvas-space pixel, across every artboard. */
  const toCanvas = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const box = hostRef.current?.getBoundingClientRect();
      const [x, y] = toContent(
        view,
        event.clientX - (box?.left ?? 0),
        event.clientY - (box?.top ?? 0),
      );
      return [Math.round(x), Math.round(y)];
    },
    [view],
  );

  /**
   * Container-space pointer → the active scene's own pixel space. Subtracting
   * the active artboard's origin is the entire coordinate cost of drawing every
   * scene at once: downstream, a point still means what it always meant.
   */
  const toRaster = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const [x, y] = toCanvas(event);
      return [x - originX, y - originY];
    },
    [toCanvas, originX, originY],
  );

  /**
   * A press on another artboard moves the work there instead of editing through
   * it — one click to focus, then the scene behaves exactly as it does today.
   * Returns true when it consumed the press.
   */
  const focusArtboard = useCallback(
    (event: { clientX: number; clientY: number }): boolean => {
      const board = artboardAt(layout, toCanvas(event));
      if (!board || board.scene.id === show.activeSceneId) return false;
      onSelectScene(board.scene.id);
      return true;
    },
    [layout, toCanvas, show.activeSceneId, onSelectScene],
  );

  /** Apply a finished draft step: a committed profile becomes a surface. */
  const settle = useCallback(
    (step: ReturnType<typeof endDraft>, constrained = false) => {
      if (step.kind === "continue") setDraft(step.draft);
      else {
        setDraft(null);
        if (step.kind === "commit") onDrawShape(step.shape, constrained, step.curves ? [step.curves] : undefined, step.nodeModes ? [step.nodeModes] : undefined);
      }
    },
    [onDrawShape],
  );

  const handleKey = (event: React.KeyboardEvent) => {
    if (event.target !== hostRef.current) return;
    if (event.key === "Escape" && draft) { event.preventDefault(); event.stopPropagation(); setDraft(null); return; }
    if (event.key === "Enter" && draft?.tool === "pen") { event.preventDefault(); settle(finishPen(draft)); return; }
    if (event.key === "Shift" && draft && (draft.tool === "rect" || draft.tool === "ellipse")) {
      setDraft((current) => current ? { ...current, constrained: true } : current);
    }
    if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "f") { event.preventDefault(); fit(); return; }
    if (!drawing) interaction.keyDown(event);
  };

  const preview = draft ? previewShape(draft) : null;

  return (
    <div
      ref={hostRef}
      className={drawing ? "map-canvas-host is-drawing" : "map-canvas-host"}
      tabIndex={0}
      aria-label="Mapping canvas"
      onKeyDown={handleKey}
      onKeyUp={(event) => {
        if (event.key === "Shift") setDraft((current) => current ? { ...current, constrained: false } : current);
      }}
      onBlur={(event) => {
        const target = event.relatedTarget;
        if (target instanceof Element && target.closest('.map-mapping-controls')) return;
        if (!event.currentTarget.contains(target as Node | null)) interaction.clearHandle();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.button !== 1) return;
        hostRef.current?.focus({ preventScroll: true });
        // Middle button or space+drag grabs the canvas.
        if (event.button === 1 || spaceHeld) {
          event.preventDefault();
          (event.currentTarget as Element).setPointerCapture(event.pointerId);
          panRef.current = { x: event.clientX, y: event.clientY };
          autoFitRef.current = false;
          setPanning(true);
          return;
        }
        // A layer may already have been dragged beyond its owning artboard by
        // an older build. Its overlay is intentionally visible there, but an
        // inactive artboard normally consumes the first press to focus itself.
        // Give an actual active-scene layer under the pointer priority so a
        // tree-selected stranded layer stays selectable and can be dragged
        // once more to complete the scene transfer.
        const canvasPoint = toCanvas(event);
        const looseHit = !drawing && surfacesAt(show.unassignedSurfaces, canvasPoint, timeS, surfaceMotion).length > 0;
        if (looseHit) {
          interaction.surfaceDown(event, canvasPoint, show.unassignedSurfaces, null);
          return;
        }
        const board = artboardAt(layout, canvasPoint);
        const escapedLayerHit = !drawing && board?.scene.id !== show.activeSceneId
          && surfacesAt(pickableLayers(toRaster(event)), toRaster(event), timeS, surfaceMotion).length > 0;
        // Another artboard: focus it and stop. Drawing included — a stroke that
        // began on one scene and committed to another would be a surface you
        // did not ask for, on a scene you were not editing.
        if (!escapedLayerHit && focusArtboard(event)) { event.preventDefault(); setDraft(null); return; }
        // A drawing tool draws anywhere over the raster; the finished profile
        // is a new surface. Pen collects on pointer-up so a drag adds no vertex.
        if (drawing && event.button === 0) {
          event.preventDefault();
          (event.currentTarget as Element).setPointerCapture(event.pointerId);
          const at = toRaster(event);
          const constrained = event.shiftKey;
          setDraft((current) =>
            tool === "pen" ? penPointerDown(current, at, 12 / scale, scale) : beginDraft(tool, at, constrained),
          );
          return;
        }
        interaction.surfaceDown(event, toRaster(event), pickableLayers(toRaster(event)));
      }}
      onPointerMove={(event) => {
        const from = panRef.current;
        if (from) {
          panRef.current = { x: event.clientX, y: event.clientY };
          setView((current) => panBy(current, event.clientX - from.x, event.clientY - from.y));
          return;
        }
        interaction.move(event);
        if (draft) setDraft(moveDraft(draft, toRaster(event), event.shiftKey));
      }}
      onPointerUp={(event) => {
        if (panRef.current) {
          panRef.current = null;
          setPanning(false);
          return;
        }
        const destination = artboardAt(layout, toCanvas(event));
        interaction.finish(false, (finished) => {
          if (!finished.changed || !finished.body) return;
          if (finished.sceneID === null) {
            if (destination) onMoveToScene?.(finished.id, destination.scene.id,
              [destination.x ? -destination.x : 0, destination.y ? -destination.y : 0]);
            return;
          }
          if (!destination) {
            onMoveToScene?.(finished.id, null, [originX, originY]);
            return;
          }
          if (destination.scene.id !== finished.sceneID) {
            onMoveToScene?.(finished.id, destination.scene.id,
              [originX - destination.x, originY - destination.y]);
          }
        });
        if (draft) settle(endDraft(draft, toRaster(event), event.shiftKey), event.shiftKey && (draft.tool === "rect" || draft.tool === "ellipse"));
      }}
      onLostPointerCapture={() => interaction.finish()}
      onPointerCancel={() => {
        interaction.finish(true);
        setDraft(null);
        panRef.current = null;
        setPanning(false);
      }}
      data-grid={mapping && mappingPreferences?.grid === false ? "hidden" : undefined}
      onDoubleClick={(event) => {
        if (draft?.tool === "pen") settle(finishPen(draft));
        else if (warp && (selectedLayer || selectedLooseLayer) && !spaceHeld) {
          const surface = (selectedLayer ?? selectedLooseLayer)!;
          const at = selectedLooseLayer ? toCanvas(event) : toRaster(event);
          const visible = animateSurface(surface, timeS, surfaceMotion);
          const shapes = visible.masks.length ? visible.masks : [visible.corners];
          for (let i = 0; i < shapes.length; i++) {
            const edge = nearestCurveEdge({ ...visible, masks: shapes }, i, at, 10 / scale);
            if (!edge) continue;
            onGestureStart?.();
            if (onMaskPatch) onMaskPatch(surface.id, splitMaskEdge(surface, i, edge.edge, edge.fraction));
            else onMaskShape(surface.id, i, insertMaskPoint(surface.masks[i] ?? surface.corners, edge.edge, edge.fraction));
            interaction.clearHandle(); onGestureEnd?.();
            event.preventDefault(); return;
          }
        }
        else if (!drawing && !spaceHeld && surfacesAt(show.unassignedSurfaces, toCanvas(event), timeS, surfaceMotion)[0]) {
          const hit = surfacesAt(show.unassignedSurfaces, toCanvas(event), timeS, surfaceMotion)[0];
          if (hit) onEdit?.(hit.id);
        } else if (!drawing && !spaceHeld && artboardAt(layout, toCanvas(event))?.scene.id === show.activeSceneId) {
          const hit = surfacesAt(pickableLayers(toRaster(event)), toRaster(event), timeS, surfaceMotion)[0];
          if (hit) onEdit?.(hit.id);
        }
      }}
      style={
        panning || interaction.moving
          ? { cursor: "grabbing" }
          : spaceHeld
            ? { cursor: "grab" }
            : drawing
              ? { cursor: "crosshair" }
              : undefined
      }
    >
      <div className="map-artboards"
        // Rings inside this transform are counter-scaled by --map-zoom, so a
        // border stays the same weight on screen instead of thinning to a
        // fraction of a pixel — which is what made it faint, and uneven
        // between edges that happened to land on different subpixels.
        style={{ transform: cssTransform(view), "--map-zoom": scale } as CSSProperties}>
        {/* Keep each artboard mounted by identity. Changing selection changes
            only its editing overlay, never its reference image or layer content. */}
        {layout.map(board => {
          const isActive = board.scene.id === show.activeSceneId;
          const drawn = mapping && !showVisual ? board.scene.surfaces.filter(s => !s.sceneCanvas).map(s => mappingSurfaceAt(s, playheadTimeS, show.media, false)) : sceneVisuals(show, board.scene, mapping ? playheadTimeS : timeS, true, undefined, motionInputs, mapping);
          return <div key={board.scene.id}
            className={`map-raster map-artboard${isActive ? " is-active" : ""}`}
            data-scene-id={board.scene.id}
            data-suppressed={board.scene.suppressed || undefined}
            data-projected={projection(board.scene.id)}
            style={{ width: board.width, height: board.height, left: board.x, top: board.y }}>
        <SceneBackdrop show={show} scene={board.scene} mediaUrls={mediaUrls}
          selectedID={isActive ? selectedID : null} />
        {/* Artboards are separate editing spaces. A program crossfade may blend
            another scene on the projector, but must never draw that scene's
            surfaces over this artboard after they have been moved away. */}
        <div className="map-mix-layer">
        {drawn.map((surface) => (
          <SurfaceLayer mapping={mapping} showVisual={showVisual}
            key={surface.id}
            surface={surface}
            selected={isActive && (surface.id === selectedID || Boolean(selectedGroup && surface.folder === selectedGroup.folder))}
            look={look}
            xray={xray}
            url={surface.source.mediaId ? mediaUrls[surface.source.mediaId] : undefined}
            kind={resolved.media.find((m) => m.id === surface.source.mediaId)?.kind}
            media={resolved.media.find((m) => m.id === surface.source.mediaId)}
            timeS={(surface as ResolvedSurface).mediaTimeS ?? timeS}
            playing={(!mapping || showVisual) && playing}
          />
        ))}
        </div>

        {isActive ? <svg
          className="map-overlay"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {editableLayers(show)
            .filter((surface) => surface.enabled && (!mapping || !surface.sceneCanvas) && (surface.id !== backdrop?.id || surface.id === selectedID))
            .map((surface) => {
              const selected = surface.id === selectedID && !surface.locked;
              const highlighted = selected || Boolean(selectedGroup && surface.folder === selectedGroup.folder);
              const visible = animateSurface(surface, timeS, surfaceMotion);
              return (
                <g key={surface.id}>
                  <polygon
                    points={visible.corners.map((p) => p.join(",")).join(" ")}
                    className={highlighted ? "map-outline is-selected" : "map-outline"}
                    style={{ stroke: highlighted ? undefined : surface.color }}
                    strokeWidth={2 / scale}
                  />
                  {visible.masks.map((_, shapeIndex) => (
                    <polygon
                      key={`m${shapeIndex}`}
                      points={sampleMask(visible, shapeIndex).map((p) => p.join(",")).join(" ")}
                      className="map-mask-outline"
                      style={{ stroke: surface.color }}
                      strokeWidth={2 / scale}
                      strokeDasharray={`${6 / scale} ${4 / scale}`}
                    />
                  ))}
                  {selected && warp && <CurveHandles surface={visible} scale={scale}
                    onHandle={(event, shape, edge, control) => interaction.handleDown(event, surface, control, shape, edge, spaceHeld)} />}
                  {selected && warp &&
                    visible.corners.map((corner, index) => (
                      <circle
                        key={`c${index}`}
                        cx={corner[0]}
                        cy={corner[1]}
                        r={Math.max(4, pinRadius) / scale}
                        strokeWidth={2 / scale}
                        className={
                          active?.surfaceID === surface.id &&
                          active.kind === "corner" &&
                          active.index === index
                            ? "map-handle is-active"
                            : "map-handle"
                        }
                        onPointerDown={(event) => interaction.handleDown(event, surface, "corner", 0, index, spaceHeld)}
                      />
                    ))}
                  {selected && warp &&
                    visible.masks.map((shape, shapeIndex) =>
                      shape.map((point, index) => (
                        <rect
                          key={`m${shapeIndex}-${index}`}
                          x={point[0] - pinRadius / scale}
                          y={point[1] - pinRadius / scale}
                          width={2 * pinRadius / scale}
                          height={2 * pinRadius / scale}
                          strokeWidth={2 / scale}
                          className={
                            active?.surfaceID === surface.id &&
                            active.kind === "mask" &&
                            active.shape === shapeIndex &&
                            active.index === index
                              ? "map-mask-handle is-active"
                              : "map-mask-handle"
                          }
                          onPointerDown={(event) =>
                            interaction.handleDown(event, surface, "mask", shapeIndex, index, spaceHeld)
                          }
                        />
                      )),
                    )}
                </g>
              );
            })}

          {warp && selectedGroupBounds && <rect className="map-group-bounds" data-group-id={selectedID ?? undefined}
            x={selectedGroupBounds.x} y={selectedGroupBounds.y}
            width={selectedGroupBounds.width} height={selectedGroupBounds.height}
            strokeWidth={1.5 / scale} strokeDasharray={`${7 / scale} ${5 / scale}`} />}

          <TransformOverlay surface={!warp ? selectedLayer : undefined}
            bounds={!warp ? selectedGroupBounds : undefined} groupID={!warp && selectedGroup ? selectedID ?? undefined : undefined}
            timeS={timeS} scale={scale} guides={interaction.guides} width={width} height={height}
            onHandle={(event, index) => selectedGroup && selectedID
              ? interaction.groupHandleDown(event, selectedID, selectedGroupMembers, "resize", index,
                spaceHeld, activeBoard?.scene.id ?? show.activeSceneId, editableLayers(show), [originX, originY])
              : selectedLayer && interaction.handleDown(event, selectedLayer, "resize", 0, index, spaceHeld,
                activeBoard?.scene.id ?? show.activeSceneId, editableLayers(show), [originX, originY])}
            onRotate={event => selectedGroup && selectedID
              ? interaction.groupHandleDown(event, selectedID, selectedGroupMembers, "rotate", 0,
                spaceHeld, activeBoard?.scene.id ?? show.activeSceneId, editableLayers(show), [originX, originY])
              : selectedLayer && interaction.handleDown(event, selectedLayer, "rotate", 0, 0, spaceHeld,
                activeBoard?.scene.id ?? show.activeSceneId, editableLayers(show), [originX, originY])} />
          {preview && preview.length > 0 && (
            <g className="map-draft">
              {draft?.tool === "pen" || draft?.tool === "freehand" ? (
                <polyline
                  points={preview.map((p) => p.join(",")).join(" ")}
                  strokeWidth={2 / scale}
                />
              ) : (
                <polygon
                  points={preview.map((p) => p.join(",")).join(" ")}
                  strokeWidth={2 / scale}
                />
              )}
              {draft?.tool === 'pen' && draft.tangents?.map((t, i) => t.some(Boolean) && <g key={`tangent-${i}`} className="map-pen-tangents">
                <line x1={draft.points[i][0] - t[0]} y1={draft.points[i][1] - t[1]} x2={draft.points[i][0] + t[0]} y2={draft.points[i][1] + t[1]} stroke="var(--aether-color-accent)" strokeWidth={1 / scale} />
                {[-1, 1].map(sign => <circle key={sign} cx={draft.points[i][0] + sign * t[0]} cy={draft.points[i][1] + sign * t[1]} r={4 / scale} strokeWidth={1 / scale} />)}
              </g>)}
              {draft?.tool === "pen" &&
                draft.points.map((p, index) => (
                  <circle
                    key={index}
                    cx={p[0]}
                    cy={p[1]}
                    r={(index === 0 ? 8 : 5) / scale}
                    strokeWidth={2 / scale}
                  />
                ))}
            </g>
          )}
          {outputRegionBelongsTo(board.scene.id) && (
            <CropOverlay crop={outputRegion(show, selectedOutput, { width, height })}
              scene={{ width, height }} scale={scale} snapping={snapping} onChange={onCrop!}
              live={selectedOutputLive} />
          )}
        </svg> : <svg className="map-overlay" width={board.width} height={board.height}
          viewBox={`0 0 ${board.width} ${board.height}`} aria-hidden="true">
          {board.scene.surfaces.filter(s => s.enabled && (!mapping || !s.sceneCanvas)).map(surface => {
            const visible = animateSurface(surface, timeS, surfaceMotion);
            return <g key={surface.id}>
              <polygon className="map-scene-outline" points={visible.corners.map(p => p.join(",")).join(" ")}
                style={{ stroke: surface.color }} strokeWidth={2 / scale} />
              {visible.masks.map((_, shapeIndex) => <polygon key={shapeIndex} className="map-mask-outline"
                points={sampleMask(visible, shapeIndex).map(p => p.join(",")).join(" ")} style={{ stroke: surface.color }}
                strokeWidth={2 / scale} strokeDasharray={`${6 / scale} ${4 / scale}`} />)}
            </g>;
          })}
          {outputRegionBelongsTo(board.scene.id) && <CropOverlay
            crop={outputRegion(show, selectedOutput, { width: board.width, height: board.height })}
            scene={{ width: board.width, height: board.height }} scale={scale} snapping={snapping}
            onChange={onCrop!} interactive={false} live={selectedOutputLive} />}
        </svg>}
      </div>;
      })}

        {/* Workspace-root layers are real document objects without an artboard
            parent. Their coordinates are already canvas coordinates, so they
            render directly under the shared pan/zoom transform and never reach
            a projector until a drop assigns them to a scene. */}
        <div className="map-loose-layers" style={{ width: bounds.width, height: bounds.height }}>
        {show.unassignedSurfaces.map((original) => {
          const surface = mapping ? mappingSurfaceAt(original, playheadTimeS, show.media, showVisual) : evaluateSurface(original, timeS, show.media, surfaceMotion);
          const media = show.media.find(m => m.id === surface.source.mediaId);
          return <SurfaceLayer mapping={mapping} showVisual={showVisual} key={surface.id} surface={surface}
            selected={surface.id === selectedID || Boolean(selectedLooseGroup && surface.folder === selectedLooseGroup.folder)}
            look={look} xray={xray}
            url={surface.source.mediaId ? mediaUrls[surface.source.mediaId] : undefined}
            kind={media?.kind} media={media}
            timeS={surface.mediaTimeS} playing={(!mapping || showVisual) && playing} />;
        })}
        </div>
        {show.unassignedSurfaces.length > 0 && <svg className="map-overlay map-loose-overlay"
          width={bounds.width} height={bounds.height} viewBox={`0 0 ${bounds.width} ${bounds.height}`}>
          {show.unassignedSurfaces.filter(surface => surface.enabled).map(surface => {
            const selected = surface.id === selectedID && !surface.locked;
            const highlighted = selected || Boolean(selectedLooseGroup && surface.folder === selectedLooseGroup.folder);
            const visible = animateSurface(surface, timeS, surfaceMotion);
            return <g key={surface.id}>
              <polygon points={visible.corners.map(point => point.join(",")).join(" ")}
                className={highlighted ? "map-outline is-selected" : "map-outline"}
                style={{ stroke: highlighted ? undefined : surface.color }} strokeWidth={2 / scale} />
              {visible.masks.map((shape, shapeIndex) => <g key={`mask-${shapeIndex}`}>
                <polygon className="map-mask-outline" points={sampleMask(visible, shapeIndex).map(p => p.join(",")).join(" ")}
                  style={{ stroke: surface.color }} strokeWidth={2 / scale} strokeDasharray={`${6 / scale} ${4 / scale}`} />
                {selected && warp && shape.map((point, index) => <rect key={index}
                  x={point[0] - pinRadius / scale} y={point[1] - pinRadius / scale} width={2 * pinRadius / scale} height={2 * pinRadius / scale}
                  strokeWidth={2 / scale} className={active?.surfaceID === surface.id && active.kind === "mask" && active.shape === shapeIndex && active.index === index ? "map-mask-handle is-active" : "map-mask-handle"}
                  onPointerDown={event => interaction.handleDown(event, surface, "mask", shapeIndex, index, spaceHeld, null, show.unassignedSurfaces)} />)}
              </g>)}
              {selected && warp && <CurveHandles surface={visible} scale={scale}
                onHandle={(event, shape, edge, control) => interaction.handleDown(event, surface, control, shape, edge, spaceHeld, null, show.unassignedSurfaces)} />}
              {selected && warp && visible.corners.map((corner, index) => <circle key={index}
                cx={corner[0]} cy={corner[1]} r={Math.max(4, pinRadius) / scale}
                strokeWidth={2 / scale} className="map-handle"
                onPointerDown={event => interaction.handleDown(event, surface, "corner", 0, index, spaceHeld,
                  null, show.unassignedSurfaces)} />)}
            </g>;
          })}
          {warp && selectedLooseGroupBounds && <rect className="map-group-bounds" data-group-id={selectedID ?? undefined}
            x={selectedLooseGroupBounds.x} y={selectedLooseGroupBounds.y}
            width={selectedLooseGroupBounds.width} height={selectedLooseGroupBounds.height}
            strokeWidth={1.5 / scale} strokeDasharray={`${7 / scale} ${5 / scale}`} />}
          <TransformOverlay surface={!warp ? selectedLooseLayer : undefined}
            bounds={!warp ? selectedLooseGroupBounds : undefined}
            groupID={!warp && selectedLooseGroup ? selectedID ?? undefined : undefined}
            timeS={timeS} scale={scale} guides={interaction.guides} width={bounds.width} height={bounds.height}
            onHandle={(event, index) => selectedLooseGroup && selectedID
              ? interaction.groupHandleDown(event, selectedID, selectedLooseGroupMembers, "resize", index,
                spaceHeld, null, show.unassignedSurfaces)
              : selectedLooseLayer && interaction.handleDown(event, selectedLooseLayer,
                "resize", 0, index, spaceHeld, null, show.unassignedSurfaces)}
            onRotate={event => selectedLooseGroup && selectedID
              ? interaction.groupHandleDown(event, selectedID, selectedLooseGroupMembers, "rotate", 0,
                spaceHeld, null, show.unassignedSurfaces)
              : selectedLooseLayer && interaction.handleDown(event, selectedLooseLayer,
                "rotate", 0, 0, spaceHeld, null, show.unassignedSurfaces)} />
        </svg>}

        {/* Artboard names, the way a drawing tool labels a frame. Counter-scaled
            so they stay the same size on screen at every zoom — a label that
            grew with the artboard would be the only thing you could read when
            you zoomed in to align a corner. */}
        {layout.map((board) => (
          <button key={board.scene.id} type="button" className="map-artboard-name"
            aria-pressed={board.scene.id === show.activeSceneId}
            data-suppressed={board.scene.suppressed || undefined}
            // Clear of the crop overlay's own label, which sits 8 scene px above
            // the same edge on the active artboard and would otherwise be drawn
            // straight through this one.
            style={{ left: board.x, top: board.y - 24 / scale, fontSize: 13 / scale,
              padding: `${2 / scale}px ${6 / scale}px`, transform: "translateY(-100%)",
              borderRadius: 4 / scale, gap: 6 / scale }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => board.scene.id !== show.activeSceneId && onSelectScene(board.scene.id)}>
            {board.scene.name}
            {board.scene.suppressed && <span className="map-artboard-tag">suppressed</span>}
          </button>
        ))}
      </div>

      {/* The brush sits on the canvas because that is where your eye is while
          painting, not in a panel you would have to look away to reach. */}
      {tool === "paint" && paint && (
        <div className="map-brush" onPointerDown={(event) => event.stopPropagation()}>
          <input type="color" aria-label="Brush colour" value={paint.color}
            onChange={(event) => paint.onColor(event.target.value)} />
          <input type="range" aria-label="Brush width" min={1} max={64} step={1} value={paint.widthPx}
            onChange={(event) => paint.onWidth(Number(event.target.value))} />
          <span>{paint.widthPx}px</span>
        </div>
      )}
      {mapping && warp && (selectedLayer || selectedLooseLayer) && <div className="map-canvas-hint" data-workspace-overlay="bottom left" role="status">
        Round handles warp · square handles edit the mask · double-click an edge to add a point · Delete removes a selected mask point (minimum 3) · arrows nudge, Shift ×10
      </div>}
      {draft?.tool === "pen" && (
        <div className="map-canvas-hint" data-workspace-overlay="bottom left" role="status">
          Click to add points · click the first point, double-click or Enter to close · Esc to cancel
        </div>
      )}

      <div className="map-zoom" data-workspace-overlay="bottom right" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-pressed={snapping} onClick={() => setSnapping(!snapping)} title="Snap to scene and layer edges, centers and vertices. Hold Alt while dragging to bypass.">Snap</button>
        <button type="button" aria-pressed={xray} onClick={() => setXray((v) => !v)} title="See overlapping features while aligning; projection stays unchanged">X-ray</button>
        <button type="button" onClick={fit} title="Fit the whole raster (F)">
          Fit
        </button>
        <button
          type="button"
          onClick={() => {
            autoFitRef.current = false;
            // True size centres the artboard you are editing, not the whole row:
            // at 1:1 a show of several scenes is wider than any screen, and the
            // one you are working on is the one you want under the cursor.
            const centred = actualSize(containerSize(), { width, height });
            setView({ ...centred, x: centred.x - originX, y: centred.y - originY });
          }}
          title="Show the active scene at true size"
        >
          100%
        </button>
        <span className="map-zoom-value">{Math.round(view.scale * 100)}%</span>
      </div>
    </div>
  );
}

function SurfaceLayer({
  mapping,
  showVisual,
  surface,
  selected,
  look,
  xray,
  url,
  kind,
  media,
  timeS,
  playing,
}: {
  mapping: boolean;
  showVisual: boolean;
  surface: Surface;
  selected: boolean;
  look: SurfaceAppearance;
  xray: boolean;
  url?: string;
  kind?: import("./document").MediaKind;
  media?: MediaRef;
  timeS: number;
  playing: boolean;
}) {
  const clipID = `clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!surface.enabled || (mapping && surface.sceneCanvas)) return null;

  const alignment = mapping && !showVisual;
  let style: React.CSSProperties;
  try {
    style = sourcePictureStyle(surface, alignment ? undefined : media, alignment);
  } catch {
    // A corner has been dragged onto its neighbour. Skip the frame rather than
    // emitting NaN into the transform; the next pointer move recovers.
    return null;
  }

  return (
    <>
      <ClipDefs surface={surface} clipID={clipID} />
      <div
        className="map-surface"
        data-visual-preview={mapping && showVisual || undefined}
        data-preview={mapping ? "mapping" : "visualization"}
        data-unclipped={selected || undefined}
        style={{ ...clipStyle(surface, clipID), opacity: (mapping ? surface.mappingOpacity ?? 1 : surface.opacity) * (xray ? .2 : 1) }}
      >
        {/* No media yet: a checkerboard makes the perspective visible, which is
            exactly what you need while aligning to a physical shape. */}
        <SurfaceMedia placementProjection={alignment ? undefined : placementProjectionStyle(surface, media)} bend={surface.bend} alphaMask={surface.alphaMask} alphaProjection={alphaProjectionStyle(surface, media)}
          source={alignment ? { mediaId: null, rect: surface.source.rect, ...(surface.kind === "mask" ? { fill: "#000000" } : {}) } : surface.source}
          url={alignment ? undefined : url}
          kind={alignment ? undefined : kind}
          text={alignment ? undefined : surface.source.text}
          fill={alignment ? surface.kind === "mask" ? "#000000" : undefined : surface.source.fill}
          loop={(surface as ResolvedSurface).mediaLoop ?? surface.clips.length === 0}
          style={style}
          timeS={timeS}
          playing={playing}
          placeholder={look}
        />
      </div>
    </>
  );
}
