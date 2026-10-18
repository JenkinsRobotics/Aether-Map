import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import type { Rect } from '../document';
import { bentSourceFraction, type SurfaceBend } from './bend';
function displacement(bend: SurfaceBend, rect: Rect, width: number, height: number) {
  const horizontal = bend.axis === 'horizontal', size = horizontal ? width : height;
  const origin = rect[horizontal ? 0 : 1], span = rect[horizontal ? 2 : 3], count = 1024;
  const shifts = Array.from({ length: count }, (_, i) => {
    const f = (i / (count - 1) * size - origin) / span;
    return (bentSourceFraction(f, bend.angleDeg) - f) * span;
  });
  const scale = Math.max(1, ...shifts.map(Math.abs)) * 2.02;
  const canvas = document.createElement('canvas'); canvas.width = horizontal ? count : 1; canvas.height = horizontal ? 1 : count;
  const context = canvas.getContext('2d')!, pixels = context.createImageData(canvas.width, canvas.height);
  shifts.forEach((delta, i) => {
    pixels.data[i * 4] = horizontal ? Math.round(128 + 256 * delta / scale) : 128;
    pixels.data[i * 4 + 1] = horizontal ? 128 : Math.round(128 + 256 * delta / scale);
    pixels.data[i * 4 + 2] = 128; pixels.data[i * 4 + 3] = 255;
  });
  context.putImageData(pixels, 0, 0);
  return { png: canvas.toDataURL('image/png'), scale };
}
/** One renderer instance (including live video/WebGL) is warped before the quad's
 * homography, so bending does not create independently ticking media strips. */
export function BentContent({ bend, rect, style, children }: {
  bend: SurfaceBend; rect: Rect; style: CSSProperties; children: (style: CSSProperties) => ReactNode;
}) {
  const id = `bend-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`, width = Number(style.width), height = Number(style.height);
  const [x, y, w, h] = rect;
  const texture = useMemo(() => displacement(bend, [x, y, w, h], width, height), [bend.axis, bend.angleDeg, x, y, w, h, width, height]);
  return <>
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none' }}><defs>
      <filter id={id} x="0" y="0" width={width} height={height} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feImage href={texture.png} x="0" y="0" width={width} height={height} preserveAspectRatio="none" result="raw" />
        <feComponentTransfer in="raw" result="map"><feFuncR type="linear" slope={255 / 256} /><feFuncG type="linear" slope={255 / 256} /></feComponentTransfer>
        <feDisplacementMap in="SourceGraphic" in2="map" scale={texture.scale} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs></svg>
    <div className="map-bent-content" style={style} data-bend={bend.angleDeg}>
      {children({ position: 'absolute', top: 0, left: 0, width, height, filter: `url(#${id})` })}
    </div>
  </>;
}
