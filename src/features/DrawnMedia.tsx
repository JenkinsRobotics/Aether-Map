import { useMemo, type CSSProperties } from "react";
import { drawingProgress, strokeLengths } from "./drawing-replay";
import type { DrawnSource, Rect } from "../features/types";

/**
 * Hand-painted content: strokes drawn live while the show is projecting.
 *
 * Rendered as SVG in the surface's own pixel space, so a stroke warps with the
 * surface exactly as an image would — you can paint straight onto a mapped
 * shape and the paint lands where the shape is, not where the screen is.
 */
export function DrawnMedia({ drawing, rect, style, timeS = 0 }: { drawing: DrawnSource; rect: Rect; style: CSSProperties; timeS?: number }) {
  const [x, y, w, h] = rect;
  const strokes = drawing.strokes;
  const lengths = useMemo(() => strokeLengths(strokes), [strokes]);
  const progress = drawingProgress(lengths, drawing.replay, timeS);
  return (
    <svg className="map-drawn" style={style} viewBox={`0 0 ${x + w} ${y + h}`} preserveAspectRatio="none">
      {drawing.strokes.map((stroke, index) => (
        <polyline key={index} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - progress[index]} visibility={progress[index] > 0 ? undefined : "hidden"} fill="none" stroke={stroke.color} strokeWidth={stroke.widthPx}
          strokeLinecap="round" strokeLinejoin="round"
          points={stroke.points.map((point) => point.join(",")).join(" ")} />
      ))}
    </svg>
  );
}
