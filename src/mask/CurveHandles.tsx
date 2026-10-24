import type { PointerEvent } from 'react';
import type { Surface } from '../document';
export function CurveHandles({ surface, scale, onHandle }: { surface: Surface; scale: number;
  onHandle: (event: PointerEvent, shape: number, edge: number, control: 'c1' | 'c2') => void }) {
  return <g className="map-curve-handles">{surface.maskCurves?.flatMap((shape, si) => shape.flatMap((c, edge) => {
    const points = surface.masks[si];
    if (!c || !points?.[edge]) return [];
    return (['c1', 'c2'] as const).map(control => {
      const anchor = points[control === 'c1' ? edge : (edge + 1) % points.length], p = c[control];
      return <g key={`${si}/${edge}/${control}`}>
        <line x1={anchor[0]} y1={anchor[1]} x2={p[0]} y2={p[1]} stroke="var(--aether-color-accent)" strokeWidth={1 / scale} />
        <circle className="map-curve-control" aria-label={`Curve ${si + 1} edge ${edge + 1} ${control}`} cx={p[0]} cy={p[1]} r={5 / scale}
          stroke="var(--aether-color-accent)" fill="var(--aether-color-bg-panel)" strokeWidth={2 / scale}
          onPointerDown={e => onHandle(e, si, edge, control)} />
      </g>;
    });
  }))}</g>;
}
