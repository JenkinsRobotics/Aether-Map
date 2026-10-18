import { useRef } from "react";
import { snapCropPosition, snapCropSize, type SceneExtent } from "../crop-snap";
import type { OutputCrop } from "./types";

/** The four corners, as [x, y] multipliers of the region's size. */
const CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
const CURSORS = ["nwse-resize", "nesw-resize", "nesw-resize", "nwse-resize"];

/**
 * The output window's region, drawn on the scene: what the projector or output
 * window actually shows. It moves and resizes like a sketch artboard — dragging
 * latches to the scene's corners, edge midpoints and centre unless snapping is
 * off or Alt is held, matching the canvas's own convention. Everything outside
 * the region is dimmed, because that is what will not be projected.
 */
export function CropOverlay({ crop, scene, scale, snapping, onChange, interactive = true, live = false }: {
  crop: OutputCrop;
  scene: SceneExtent;
  scale: number;
  snapping: boolean;
  onChange: (crop: OutputCrop) => void;
  /** Inactive artboards retain the linked output's position without exposing controls. */
  interactive?: boolean;
  /** The assigned receiver/window is currently presenting this output. */
  live?: boolean;
}) {
  const drag = useRef<{ x: number; y: number; crop: OutputCrop; corner: number | null } | null>(null);
  // One screen pixel is 1/scale scene pixels, so the latch feels the same at
  // every zoom instead of snapping across half the scene when zoomed out.
  const tolerance = 7 / scale;
  const begin = (event: React.PointerEvent, corner: number | null) => {
    event.stopPropagation(); event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, crop, corner };
  };
  const key = (event: React.KeyboardEvent, resize: boolean) => {
    const deltas: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = deltas[event.key]; if (!delta) return;
    event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 10 : 1;
    onChange(resize ? { ...crop, widthPx: Math.max(1, crop.widthPx + delta[0] * step), heightPx: Math.max(1, crop.heightPx + delta[1] * step) }
      : { ...crop, xPx: crop.xPx + delta[0] * step, yPx: crop.yPx + delta[1] * step });
  };
  const move = (event: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    event.stopPropagation();
    const dx = (event.clientX - d.x) / scale, dy = (event.clientY - d.y) / scale;
    const latch = snapping && !event.altKey ? tolerance : 0;
    if (d.corner === null) {
      onChange(snapCropPosition({ ...d.crop, xPx: d.crop.xPx + dx, yPx: d.crop.yPx + dy }, scene, latch));
      return;
    }
    // A corner drag moves the two edges it owns; the opposite corner stays put.
    const [cx, cy] = CORNERS[d.corner];
    const left = cx ? d.crop.xPx : d.crop.xPx + dx;
    const top = cy ? d.crop.yPx : d.crop.yPx + dy;
    const right = cx ? d.crop.xPx + d.crop.widthPx + dx : d.crop.xPx + d.crop.widthPx;
    const bottom = cy ? d.crop.yPx + d.crop.heightPx + dy : d.crop.yPx + d.crop.heightPx;
    const box = { ...d.crop, xPx: Math.min(left, right), yPx: Math.min(top, bottom),
      widthPx: Math.max(1, Math.abs(right - left)), heightPx: Math.max(1, Math.abs(bottom - top)) };
    onChange(snapCropSize(snapCropPosition(box, scene, latch), scene, latch));
  };
  const handle = 6 / scale;
  const label = `${Math.round(crop.widthPx)} × ${Math.round(crop.heightPx)}`;
  return <g className="map-crop-overlay" data-live={live || undefined}
    aria-hidden={interactive ? undefined : true}
    pointerEvents={interactive ? undefined : "none"}
    onPointerMove={interactive ? move : undefined}
    onPointerUp={interactive ? (e) => { if (drag.current) e.stopPropagation(); drag.current = null; } : undefined}
    onPointerCancel={interactive ? () => { drag.current = null; } : undefined}>
    {/* Even-odd: the scene minus the region, so only what is cut stays dim. */}
    <path className="map-crop-shade" fillRule="evenodd" pointerEvents="none"
      d={`M0 0H${scene.width}V${scene.height}H0Z M${crop.xPx} ${crop.yPx}H${crop.xPx + crop.widthPx}V${crop.yPx + crop.heightPx}H${crop.xPx}Z`} />
    <rect x={crop.xPx} y={crop.yPx} width={crop.widthPx} height={crop.heightPx}
      fill="none" stroke="currentColor" strokeWidth={2 / scale} pointerEvents="none" />
    <g role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? "Move output region" : undefined}
      style={{ cursor: interactive ? "move" : undefined }}
      onKeyDown={interactive ? (e) => key(e, false) : undefined}
      onPointerDown={interactive ? (e) => begin(e, null) : undefined}>
      <rect x={crop.xPx} y={crop.yPx - 22 / scale} width={Math.max(96 / scale, (label.length * 7 + 62) / scale)} height={20 / scale} fill="currentColor" rx={3 / scale} />
      <text x={crop.xPx + 6 / scale} y={crop.yPx - 8 / scale} fontSize={11 / scale} className="map-crop-label">{label} · Output</text>
    </g>
    {CORNERS.map(([cx, cy], index) => (
      <rect key={index} role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `Resize output region ${["top left", "top right", "bottom left", "bottom right"][index]}` : undefined}
        x={crop.xPx + cx * crop.widthPx - handle} y={crop.yPx + cy * crop.heightPx - handle}
        width={handle * 2} height={handle * 2} fill="currentColor"
        style={{ cursor: interactive ? CURSORS[index] : undefined }}
        onKeyDown={interactive ? (e) => key(e, true) : undefined}
        onPointerDown={interactive ? (e) => begin(e, index) : undefined} />
    ))}
  </g>;
}
