import type { PointerEvent } from 'react';
import type { Surface } from './document';
import { animateSurface } from './features/animation';
import { boundsOf, handlePoint, RESIZE_HANDLES, type Bounds, type SnapGuide } from './layer-transform';
export function TransformOverlay({ surface, bounds, groupID, timeS, scale, guides, width, height, onHandle, onRotate }: {
  surface?: Surface; bounds?: Bounds | null; groupID?: string; timeS: number; scale: number; guides: SnapGuide[]; width: number; height: number;
  onHandle: (event: PointerEvent, index: number) => void;
  onRotate: (event: PointerEvent) => void;
}) {
  const b = bounds ?? (surface && boundsOf(animateSurface(surface, timeS).corners));
  return <g className="map-transform-overlay">
    {guides.map(g => <line key={`${g.axis}/${g.position}`} className="map-snap-guide" strokeWidth={1 / scale}
      x1={g.axis === 0 ? g.position : 0} x2={g.axis === 0 ? g.position : width}
      y1={g.axis === 1 ? g.position : 0} y2={g.axis === 1 ? g.position : height} />)}
    {b && <><rect className={groupID ? "map-transform-box map-group-bounds" : "map-transform-box"}
      data-group-id={groupID} x={b.x} y={b.y} width={b.width} height={b.height} strokeWidth={1 / scale} />
      {RESIZE_HANDLES.map((handle, index) => {
        const [x, y] = handlePoint(b, handle);
        return <circle key={handle} aria-label={`Resize ${handle}`} className="map-resize-handle" cx={x} cy={y}
          r={4 / scale} strokeWidth={1.5 / scale} style={{ cursor: `${handle}-resize` }} onPointerDown={event => onHandle(event, index)} />;
      })}
      <line className="map-rotation-stem" x1={b.x + b.width / 2} x2={b.x + b.width / 2} y1={b.y} y2={b.y - 28 / scale} strokeWidth={1 / scale} />
      <circle aria-label="Rotate layer" className="map-rotate-handle" cx={b.x + b.width / 2} cy={b.y - 28 / scale} r={4 / scale} strokeWidth={1.5 / scale} onPointerDown={onRotate} />
    </>}
  </g>;
}
