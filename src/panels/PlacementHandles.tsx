import { useRef, type CSSProperties, type PointerEvent } from "react";
import type { Point, Rect } from "../document";
import { contentPlacementCorners, readVisualPlacement, type VisualPlacement } from "../visual-placement";

/**
 * On-canvas placement for a visual inside its frame (a surface's content
 * rectangle): drag the box to move it, a corner to resize about its centre
 * (Shift keeps proportions). Drawn in frame coordinates; the caller supplies
 * how a pointer maps into them, so the same handles work straight-on or
 * projected onto a warped surface.
 */
export function PlacementHandles({ value, frame, bounds, unitPx, style, toLocal, onChange, onDone }: {
  value: unknown; frame: Rect; bounds: Rect;
  /** Frame units per screen pixel, for handle size. */
  unitPx: number; style?: CSSProperties;
  toLocal: (clientX: number, clientY: number) => Point;
  onChange: (placement: VisualPlacement) => void; onDone?: () => void;
}) {
  const p = readVisualPlacement(value);
  const box = contentPlacementCorners(p, frame, bounds);
  const drag = useRef<{ kind: "move" | number; start: Point; base: VisualPlacement } | null>(null);
  const down = (kind: "move" | number) => (event: PointerEvent<SVGElement>) => {
    event.stopPropagation(); event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag.current = { kind, start: toLocal(event.clientX, event.clientY), base: p };
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const at = toLocal(event.clientX, event.clientY);
    if (d.kind === "move") {
      onChange({ ...d.base, xPercent: d.base.xPercent + (at[0] - d.start[0]) / frame[2] * 100, yPercent: d.base.yPercent + (at[1] - d.start[1]) / frame[3] * 100 });
      return;
    }
    // ponytail: resize measures along the frame axes, ignoring rotation; rotate from Transform.
    const center: Point = [frame[0] + frame[2] * d.base.xPercent / 100, frame[1] + frame[3] * d.base.yPercent / 100];
    const ratio = (axis: 0 | 1) => Math.abs(at[axis] - center[axis]) / Math.max(1e-6, Math.abs(d.start[axis] - center[axis]));
    let sx = ratio(0), sy = ratio(1);
    if (event.shiftKey) sx = sy = Math.max(sx, sy);
    onChange({ ...d.base, widthPercent: Math.max(.1, d.base.widthPercent * sx), heightPercent: Math.max(.1, d.base.heightPercent * sy) });
  };
  const up = () => { if (drag.current) { drag.current = null; onDone?.(); } };
  const handle = 6 * unitPx;
  return <svg className="map-placement-handles" viewBox={frame.join(" ")} width={frame[2]} height={frame[3]} style={style} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <polygon className="map-placement-box" aria-label="Move visual" points={box.map(c => c.join(",")).join(" ")} strokeWidth={1.5 * unitPx} onPointerDown={down("move")} />
    {box.map((c, i) => <rect key={i} className="map-placement-handle" aria-label="Resize visual" x={c[0] - handle} y={c[1] - handle}
      width={handle * 2} height={handle * 2} strokeWidth={1.5 * unitPx} onPointerDown={down(i)} />)}
  </svg>;
}
