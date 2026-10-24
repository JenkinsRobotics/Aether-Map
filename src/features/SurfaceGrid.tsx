import type { CSSProperties } from "react";
import { DEFAULT_SURFACE_LOOK, type Rect, type SurfaceAppearance } from "../document";

/**
 * Line weight as a fraction of the surface's long edge. It has to be
 * proportional, not a pixel: this element is the surface's *source* box — often
 * 1920 wide — warped down to a few hundred screen pixels, so a 1px line renders
 * at about an eighth of a pixel and washes out to nothing.
 */
const WEIGHT = 0.009;

/**
 * What a surface shows before it has media: the thing you drag corners against
 * when matching a projection to a physical contour.
 *
 * Fill is a plain field, for when the shape itself is all you need to see.
 * Grid reveals the warp by how its lines bend; checkerboard reveals it by how
 * its areas change. Which reads better depends on the surface and the room,
 * which is why it is a setting and not a decision made here.
 */
export function SurfaceGrid({ rect, style, look = DEFAULT_SURFACE_LOOK.external }: {
  rect: Rect;
  style: CSSProperties;
  look?: SurfaceAppearance;
}) {
  const [x, y, w, h] = rect;
  const stroke = Math.max(1, Math.max(w, h) * WEIGHT);
  const columns = Math.max(1, Math.round(look.sections));
  const rows = Math.max(1, Math.round(look.sections));
  const frame = { ...style, opacity: (style.opacity as number ?? 1) * look.opacity };

  return (
    <svg className="map-surface-grid" style={frame} viewBox={`0 0 ${x + w} ${y + h}`} preserveAspectRatio="none">
      {look.pattern === "checker" ? (
        <>
          <rect x={x} y={y} width={w} height={h} fill={look.primary} />
          <g fill={look.secondary}>
            {Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) =>
              (row + column) % 2 === 1 ? (
                <rect key={`${row}-${column}`} x={x + (w * column) / columns} y={y + (h * row) / rows}
                  width={w / columns} height={h / rows} />
              ) : null))}
          </g>
        </>
      ) : (
        <>
          <rect x={x} y={y} width={w} height={h} fill={look.primary} />
          {look.pattern === "grid" && (
            <g fill="none" stroke={look.secondary} strokeWidth={stroke}>
              {Array.from({ length: columns - 1 }, (_, i) => (
                <line key={`c${i}`} x1={x + (w * (i + 1)) / columns} y1={y} x2={x + (w * (i + 1)) / columns} y2={y + h} />
              ))}
              {Array.from({ length: rows - 1 }, (_, i) => (
                <line key={`r${i}`} x1={x} y1={y + (h * (i + 1)) / rows} x2={x + w} y2={y + (h * (i + 1)) / rows} />
              ))}
            </g>
          )}
        </>
      )}
      {/* The border closes every pattern, and is the only mark "fill" has. */}
      <rect x={x + stroke / 2} y={y + stroke / 2} width={Math.max(0, w - stroke)} height={Math.max(0, h - stroke)}
        fill="none" stroke={look.border} strokeWidth={stroke} />
    </svg>
  );
}
