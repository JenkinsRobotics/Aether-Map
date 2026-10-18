import { useId, type CSSProperties } from 'react';
import { gradientVector, type VectorGradient } from '@aether/sketch';
/** Paint source only. The existing surface renderer owns mask clipping and warping. */
export function VectorFill({ gradient, color, opacity, style, rect }: { gradient?: VectorGradient; color: string; opacity: number; style: CSSProperties; rect?: readonly [number, number, number, number] }) {
  const id = `map-vector-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const stops = gradient?.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />);
  if (!gradient) return <div className="map-fill" data-vector-fill="solid" style={{ ...style, background: color, opacity: Number(style.opacity ?? 1) * opacity }} />;
  return <svg className="map-fill" data-vector-fill={gradient?.kind ?? 'solid'} style={style} width="100%" height="100%" aria-hidden="true">
    {gradient && <defs>{gradient.kind === 'linear' ? <linearGradient id={id} {...gradientVector(gradient.angleDeg)}>{stops}</linearGradient> : <radialGradient id={id} cx=".5" cy=".5" r=".5">{stops}</radialGradient>}</defs>}
    <rect x={rect?.[0] ?? 0} y={rect?.[1] ?? 0} width={rect?.[2] ?? '100%'} height={rect?.[3] ?? '100%'} fill={gradient ? `url(#${id})` : color} fillOpacity={opacity} />
  </svg>;
}
