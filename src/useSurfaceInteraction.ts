import { constrainAngle } from '@aether/sketch';
import { removeMaskPoint } from "./masks";
import type { CornerRef } from './corner-welds';
import { sceneSize } from "./scene-size";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { allSurfaces, type MapShow, type Point, type Quad, type Surface } from "./document";
import { editableLayers } from "./background-layer";
import { boundsOf, resizeBounds, setLayerBounds, snapBounds, snapVertex, rotateLayer, RESIZE_HANDLES, type SnapGuide } from "./layer-transform";
import { animateSurface, geometryHandleDelta, type SurfaceMotionContext } from "./features/animation";
import { surfacesAt, translateSurface, type SurfaceGeometry } from "./surface-interaction";
import {
  groupBounds,
  resizedGroupGeometry,
  rotatedGroupGeometry,
  translatedGroupGeometry,
  type GroupGeometryChange,
} from "./group-interaction";
import { folderID, resolveTreeID } from "./scene-tree";

type HandleKind = "corner" | "mask" | "resize" | "rotate" | 'c1' | 'c2';
export interface ActiveHandle { surfaceID: string; kind: HandleKind; shape: number; index: number }
interface Drag {
  motion?: SurfaceMotionContext;
  snappedCorner?: CornerRef;
  surface: Surface; handle: ActiveHandle | null; x: number; y: number;
  scale: number; timeS: number; moved: boolean; changed: boolean; pointerID: number; pivot: Point;
  group?: { id: string; members: Surface[] }; drillDownID?: string;
  sceneID: string | null; collection: Surface[];
}
export interface FinishedSurfaceDrag {
  /** A compound's folder row id, or the one surface id. */
  id: string;
  /** True only when geometry was actually translated or transformed. */
  changed: boolean;
  /** Body drags may cross artboards; resize, rotate and node edits may not. */
  body: boolean;
  /** The scene that owned the object when this drag began; null is workspace root. */
  sceneID: string | null;
}
interface Options {
  motion?: SurfaceMotionContext;
  hostRef: RefObject<HTMLDivElement | null>; show: MapShow; selectedID: string | null;
  scale: number; timeS: number; snapping?: boolean; snapDistancePx?: number; gridPx?: number; nodeEditing?: boolean;
  onActiveHandle?: (handle: ActiveHandle | null) => void;
  onWeldCorners?: (a: CornerRef, b: CornerRef) => void;
  onCurveControl?: (id: string, shape: number, edge: number, control: 'c1' | 'c2', point: Point, independent?: boolean) => void;
  onSelect: (id: string | null) => void;
  onGeometry: (id: string, geometry: SurfaceGeometry) => void;
  onGroupGeometry: (id: string, changes: GroupGeometryChange[]) => void;
  onCorners: (id: string, corners: Quad) => void;
  onMaskShape: (id: string, shape: number, points: Point[]) => void;
  onDelete?: (id: string) => void; onEdit?: (id: string) => void;
  onGestureStart?: () => void; onGestureEnd?: (cancel?: boolean) => void;
}

/** Pointer capture, object/handle movement and focused canvas shortcuts. */
export function useSurfaceInteraction(options: Options) {
  const { hostRef, show, selectedID, scale, timeS, motion, onSelect, onGeometry, onGroupGeometry, onCorners, onMaskShape, onDelete, onEdit, onGestureStart, onGestureEnd } = options;
  const dragRef = useRef<Drag | null>(null);
  const [handleState, setActive] = useState<ActiveHandle | null>(null);
  const active = options.nodeEditing || handleState?.kind === "resize" || handleState?.kind === "rotate" ? handleState : null;
  const [moving, setMoving] = useState(false);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const validActive = active?.surfaceID === selectedID ? active : null;
  useEffect(() => { options.onActiveHandle?.(validActive); }, [options.onActiveHandle, validActive]);
  const finish = useCallback((cancel = false, beforeEnd?: (drag: FinishedSurfaceDrag) => void) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (hostRef.current?.hasPointerCapture?.(drag.pointerID)) hostRef.current.releasePointerCapture(drag.pointerID);
    if (!cancel && !drag.moved && drag.drillDownID) onSelect(drag.drillDownID);
    if (!cancel) beforeEnd?.({ id: drag.group?.id ?? drag.surface.id, changed: drag.changed, body: drag.handle === null, sceneID: drag.sceneID });
    if (!cancel && drag.changed && drag.handle?.kind === 'corner' && drag.snappedCorner)
      options.onWeldCorners?.({ surfaceID: drag.surface.id, index: drag.handle.index }, drag.snappedCorner);
    setMoving(false); setGuides([]); onGestureEnd?.(cancel);
  }, [hostRef, onSelect, onGestureEnd, options.onWeldCorners]);
  useEffect(() => {
    const cancel = () => finish(true);
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("blur", cancel); };
  }, [finish]);
  const start = (event: PointerEvent, surface: Surface, handle: ActiveHandle | null,
    group?: { id: string; members: Surface[] }, drillDownID?: string,
    sceneID: string | null = show.activeSceneId, collection: Surface[] = editableLayers(show), coordinateOrigin: Point = [0, 0]) => {
    event.preventDefault(); event.stopPropagation();
    hostRef.current?.focus({ preventScroll: true });
    hostRef.current?.setPointerCapture(event.pointerId);
    onSelect(group?.id ?? surface.id); setActive(handle); onGestureStart?.();
    const b = group ? groupBounds(group.members, timeS, motion) ?? boundsOf(animateSurface(surface, timeS, motion).corners)
      : boundsOf(animateSurface(surface, timeS, motion).corners);
    const workspace = hostRef.current?.querySelector('.map-artboards')?.getBoundingClientRect();
    const pivot: Point = [(workspace?.x ?? 0) + (coordinateOrigin[0] + b.x + b.width / 2) * scale,
      (workspace?.y ?? 0) + (coordinateOrigin[1] + b.y + b.height / 2) * scale];
    dragRef.current = { surface, handle, group, drillDownID, sceneID, collection, pivot, x: event.clientX, y: event.clientY, scale, timeS, motion, moved: false, changed: false, pointerID: event.pointerId };
  };
  const handleDown = (event: PointerEvent, surface: Surface, kind: HandleKind, shape: number, index: number, pan: boolean,
    sceneID: string | null = show.activeSceneId, collection: Surface[] = editableLayers(show), coordinateOrigin: Point = [0, 0]) => {
    if (surface.locked || pan || event.button !== 0) return;
    start(event, surface, { surfaceID: surface.id, kind, shape, index }, undefined, undefined, sceneID, collection, coordinateOrigin);
  };
  const groupHandleDown = (event: PointerEvent, id: string, members: Surface[], kind: "resize" | "rotate",
    index: number, pan: boolean, sceneID: string | null = show.activeSceneId,
    collection: Surface[] = editableLayers(show), coordinateOrigin: Point = [0, 0]) => {
    const surface = members[0];
    if (!surface || members.some(member => member.locked) || pan || event.button !== 0) return;
    start(event, surface, { surfaceID: id, kind, shape: 0, index },
      { id, members }, undefined, sceneID, collection, coordinateOrigin);
  };
  const surfaceDown = (event: PointerEvent, point: Point, collection: Surface[] = editableLayers(show),
    sceneID: string | null = show.activeSceneId, coordinateOrigin: Point = [0, 0]) => {
    if (event.button !== 0) return;
    const hits = surfacesAt(collection, point, timeS, motion);
    const current = hits.findIndex((surface) => surface.id === selectedID);
    const surface = hits[event.altKey && current >= 0 ? (current + 1) % hits.length : 0];
    hostRef.current?.focus({ preventScroll: true });
    if (surface?.folder && !event.altKey && selectedID !== surface.id) {
      const id = folderID(sceneID, surface.folder);
      const members = collection.filter(member => member.folder === surface.folder);
      start(event, surface, null, { id, members }, selectedID === id ? surface.id : undefined, sceneID, collection, coordinateOrigin);
    } else if (surface) start(event, surface, null, undefined, undefined, sceneID, collection, coordinateOrigin);
    else { onSelect(null); setActive(null); }
  };
  const move = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerID) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) return;
    drag.moved = true; setMoving(true);
    const delta: Point = [(event.clientX - drag.x) / drag.scale, (event.clientY - drag.y) / drag.scale];
    if (drag.group) {
      const { id, members } = drag.group;
      if (members.some(member => member.locked)) return;
      const b = groupBounds(members, drag.timeS, drag.motion);
      if (!b) return;
      if (drag.handle?.kind === "rotate") {
        const [cx, cy] = drag.pivot;
        let angle = (Math.atan2(event.clientY - cy, event.clientX - cx) -
          Math.atan2(drag.y - cy, drag.x - cx)) * 180 / Math.PI;
        if (event.shiftKey) angle = Math.round(angle / 15) * 15;
        drag.changed = true;
        onGroupGeometry(id, rotatedGroupGeometry(members, angle, drag.timeS, drag.motion));
        return;
      }
      if (drag.handle?.kind === "resize") {
        const handle = RESIZE_HANDLES[drag.handle.index];
        let next = resizeBounds(b, handle, delta, event.shiftKey);
        let nextGuides: SnapGuide[] = [];
        if (options.snapping !== false && !event.altKey) {
          const memberIDs = new Set(members.map(member => member.id));
          const targets = [...(drag.sceneID ? [{ x: 0, y: 0, ...sceneSize(show) }] : []),
            ...drag.collection.filter(surface => !memberIDs.has(surface.id) && surface.enabled)
              .map(surface => boundsOf(animateSurface(surface, drag.timeS, drag.motion).corners))];
          const snap = snapBounds(next, targets, (options.snapDistancePx ?? 6) / drag.scale, handle, options.gridPx);
          const snapped = resizeBounds(b, handle,
            [delta[0] + snap.delta[0], delta[1] + snap.delta[1]], event.shiftKey);
          next = snapped;
          nextGuides = snapBounds(snapped, targets, .01, handle).guides;
        }
        setGuides(nextGuides);
        drag.changed = true;
        onGroupGeometry(id, resizedGroupGeometry(members, next, drag.timeS, drag.motion));
        return;
      }
      let next: Point = [b.x + Math.round(delta[0]), b.y + Math.round(delta[1])];
      let nextGuides: SnapGuide[] = [];
      if (options.snapping !== false && !event.altKey) {
        const memberIDs = new Set(members.map(member => member.id));
        const targets = [...(drag.sceneID ? [{ x: 0, y: 0, ...sceneSize(show) }] : []),
          ...drag.collection.filter(s => !memberIDs.has(s.id) && s.enabled)
            .map(s => boundsOf(animateSurface(s, drag.timeS, drag.motion).corners))];
        const snap = snapBounds({ ...b, x: next[0], y: next[1] }, targets, (options.snapDistancePx ?? 6) / drag.scale, undefined, options.gridPx);
        next = [next[0] + snap.delta[0], next[1] + snap.delta[1]];
        nextGuides = snap.guides;
      }
      setGuides(nextGuides);
      drag.changed = true;
      onGroupGeometry(id, translatedGroupGeometry(members, [next[0] - b.x, next[1] - b.y], drag.timeS, drag.motion));
      return;
    }
    if (drag.handle?.kind === "rotate") {
      const [cx, cy] = drag.pivot;
      let angle = (Math.atan2(event.clientY - cy, event.clientX - cx) - Math.atan2(drag.y - cy, drag.x - cx)) * 180 / Math.PI;
      if (event.shiftKey) angle = Math.round(angle / 15) * 15;
      drag.changed = true;
      onGeometry(drag.surface.id, rotateLayer(drag.surface, angle, drag.timeS, drag.motion)); return;
    }
    if (!drag.handle || drag.handle.kind === "resize") {
      const b = boundsOf(animateSurface(drag.surface, drag.timeS, drag.motion).corners);
      const handle = drag.handle ? RESIZE_HANDLES[drag.handle.index] : undefined;
      const aspect = Boolean(drag.surface.lockAspectRatio || event.shiftKey);
      let next = handle ? resizeBounds(b, handle, delta, aspect) : { ...b, x: b.x + Math.round(delta[0]), y: b.y + Math.round(delta[1]) };
      let nextGuides: SnapGuide[] = [];
      if (options.snapping !== false && !event.altKey) {
        const targets = [...(drag.sceneID ? [{ x: 0, y: 0, ...sceneSize(show) }] : []),
          ...drag.collection.filter(s => s.id !== drag.surface.id && s.enabled).map(s => boundsOf(animateSurface(s, drag.timeS, drag.motion).corners))];
        const snap = snapBounds(next, targets, (options.snapDistancePx ?? 6) / drag.scale, handle, options.gridPx);
        if (handle) {
          const snapped = resizeBounds(b, handle, [delta[0] + snap.delta[0], delta[1] + snap.delta[1]], aspect);
          // Aspect locking may move the other edge; show only guides actually reached.
          const actual = snapBounds(snapped, targets, .01, handle);
          next = snapped; nextGuides = actual.guides;
        } else { next = { ...next, x: next.x + snap.delta[0], y: next.y + snap.delta[1] }; nextGuides = snap.guides; }
      }
      setGuides(nextGuides);
      drag.changed = true;
      onGeometry(drag.surface.id, setLayerBounds(drag.surface, next, drag.timeS, drag.motion));
      return;
    }
    const { kind, shape, index } = drag.handle;
    if (kind === 'c1' || kind === 'c2') {
      const curve = drag.surface.maskCurves?.[shape]?.[index];
      if (!curve) return;
      const movement = geometryHandleDelta(drag.surface, drag.timeS, delta, false, drag.motion);
      drag.changed = true;
      const at: Point = [curve[kind][0] + movement[0], curve[kind][1] + movement[1]];
      const anchor = drag.surface.masks[shape][kind === 'c1' ? index : (index + 1) % drag.surface.masks[shape].length];
      options.onCurveControl?.(drag.surface.id, shape, index, kind, event.shiftKey ? constrainAngle(anchor, at) : at, event.altKey);
      return;
    }
    let nodeDelta = delta;
    drag.snappedCorner = undefined;
    setGuides([]);
    if (options.snapping !== false && !event.altKey) {
      const visible = animateSurface(drag.surface, drag.timeS, drag.motion);
      const start = kind === "corner" ? visible.corners[index] : visible.masks[shape][index];
      const targets = drag.collection.filter(s => s.id !== drag.surface.id && s.enabled)
        .flatMap(s => { const v = animateSurface(s, drag.timeS, drag.motion); return [...v.corners, ...v.masks.flat()]; });
      if (drag.sceneID) {
        const size = sceneSize(show);
        targets.push([0, 0], [size.width, 0], [size.width, size.height], [0, size.height]);
      }
      const hit = snapVertex([start[0] + delta[0], start[1] + delta[1]], targets, (options.snapDistancePx ?? 6) / drag.scale, options.gridPx);
      if (hit) nodeDelta = [hit[0] - start[0], hit[1] - start[1]];
      if (hit && kind === 'corner') {
        for (const s of drag.collection.filter(s => s.id !== drag.surface.id && s.enabled && !s.locked)) {
          const index = animateSurface(s, drag.timeS, drag.motion).corners.findIndex(p => Math.hypot(p[0] - hit[0], p[1] - hit[1]) < 1e-6);
          if (index >= 0) { drag.snappedCorner = { surfaceID: s.id, index }; break; }
        }
      }
      setGuides(hit ? [{ axis: 0, position: hit[0] }, { axis: 1, position: hit[1] }] : []);
    }
    const movement = geometryHandleDelta(drag.surface, drag.timeS, nodeDelta, kind === "corner", drag.motion);
    const points = (kind === "corner" ? drag.surface.corners : drag.surface.masks[shape]).map((point) => [...point] as Point);
    points[index] = [points[index][0] + movement[0], points[index][1] + movement[1]];
    drag.changed = true;
    if (kind === "corner") onCorners(drag.surface.id, points as Quad);
    else onMaskShape(drag.surface.id, shape, points);
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.target !== hostRef.current) return;
    if (dragRef.current) {
      if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z")) finish(true);
      event.preventDefault(); event.stopPropagation(); return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const selected = allSurfaces(show).find((surface) => surface.id === selectedID);
    const group = selectedID ? resolveTreeID(show, selectedID) : undefined;
    const members = group?.kind === "folder"
      ? (group.scene?.surfaces ?? show.unassignedSurfaces).filter(surface => surface.folder === group.folder) : [];
    if (event.key === "Escape") {
      setActive(null); onSelect(null);
    } else if (active?.surfaceID === selectedID && (active?.kind === 'c1' || active?.kind === 'c2')) {
      if (!selected || selected.locked) return;
      const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, Point>)[event.key];
      const curve = selected.maskCurves?.[active.shape]?.[active.index];
      if (delta && curve) {
        const movement = geometryHandleDelta(selected, timeS, delta.map(n => n * (event.shiftKey ? 10 : 1)) as Point, false, motion);
        options.onCurveControl?.(selected.id, active.shape, active.index, active.kind, [curve[active.kind][0] + movement[0], curve[active.kind][1] + movement[1]]);
      }
    } else if ((event.key === "Delete" || event.key === "Backspace") && selected && !selected.locked && active?.surfaceID === selected.id && active.kind === "mask") {
      const shape = selected.masks[active.shape];
      const points = shape && removeMaskPoint(shape, active.index);
      if (points) {
        onGestureStart?.(); onMaskShape(selected.id, active.shape, points); onGestureEnd?.();
        setActive(null);
      }
    } else if ((event.key === "Delete" || event.key === "Backspace") && selectedID && ((selected && !selected.locked) || (members.length > 0 && members.every(member => !member.locked)))) {
      onDelete?.(selectedID); setActive(null);
    } else if (event.key === "Enter" && members.length) {
      onSelect(members[0].id);
    } else if (event.key === "Enter" && selected) {
      onEdit?.(selected.id);
    } else {
      const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, Point>)[event.key];
      if (!delta) return;
      const step = event.shiftKey ? 10 : 1;
      const movement: Point = [delta[0] * step, delta[1] * step];
      if (members.length) {
        if (members.some(member => member.locked)) return;
        onGroupGeometry(selectedID!, translatedGroupGeometry(members, movement, timeS, motion));
      } else if (!selected || selected.locked) return;
      else if (!active || active.surfaceID !== selectedID || active.kind === "resize" || active.kind === "rotate") onGeometry(selected.id, translateSurface(selected, movement));
      else {
        const points = (active.kind === "corner" ? selected.corners : selected.masks[active.shape] ?? []).map((point) => [...point] as Point);
        if (!points[active.index]) return;
        const [dx, dy] = geometryHandleDelta(selected, timeS, movement, active.kind === "corner", motion);
        points[active.index] = [points[active.index][0] + dx, points[active.index][1] + dy];
        if (active.kind === "corner") onCorners(selected.id, points as Quad);
        else onMaskShape(selected.id, active.shape, points);
      }
    }
    event.preventDefault(); event.stopPropagation();
  };
  return { active, moving, guides, handleDown, groupHandleDown, surfaceDown, move, finish, keyDown,
    clearHandle: () => setActive(null) };
}
