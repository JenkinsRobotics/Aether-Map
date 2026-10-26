import { useRef, type CSSProperties, type PointerEvent } from "react";
import type { Point, Rect } from "../document";
import { contentPlacementCorners, readVisualPlacement, resizeContentPlacement, snapContentPlacement, type VisualPlacement } from "../visual-placement";

/**
 * On-canvas placement for a visual inside its frame (a surface's content
 * rectangle), as surfaces and the backdrop move in Mapping: drag the box to
 * move it (snapping to the frame's edges and centre; Alt moves freely), a corner
 * to resize from the opposite corner keeping proportions (Shift stretches). Drawn in frame coordinates; the caller supplies
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
      const moved = readVisualPlacement({ ...d.base, xPercent: d.base.xPercent + (at[0] - d.start[0]) / frame[2] * 100, yPercent: d.base.yPercent + (at[1] - d.start[1]) / frame[3] * 100 });
      onChange(event.altKey ? moved : snapContentPlacement(moved, frame, bounds, [], 6 * unitPx).placement);
      return;
    }
    onChange(resizeContentPlacement(d.base, d.kind, at, frame, bounds, !event.shiftKey));
  };
  const up = () => { if (drag.current) { drag.current = null; onDone?.(); } };
  const handle = 6 * unitPx;
  return <svg className="map-placement-handles" viewBox={frame.join(" ")} width={frame[2]} height={frame[3]} style={style} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <polygon className="map-placement-box" aria-label="Move visual" points={box.map(c => c.join(",")).join(" ")} strokeWidth={1.5 * unitPx} onPointerDown={down("move")} />
    {box.map((c, i) => <rect key={i} className="map-placement-handle" aria-label="Resize visual" x={c[0] - handle} y={c[1] - handle}
      width={handle * 2} height={handle * 2} strokeWidth={1.5 * unitPx} onPointerDown={down(i)} />)}
  </svg>;
}
