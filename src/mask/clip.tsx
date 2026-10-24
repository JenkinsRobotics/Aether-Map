import { clipShapes } from "./clip";
import type { Surface } from "../document";

/** The `<clipPath>` definition, rendered only when a union is needed. */
export function ClipDefs({ surface, clipID }: { surface: Surface; clipID: string }) {
  const shapes = clipShapes(surface);
  if (shapes.length < 2) return null;
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
      <defs>
        <clipPath id={clipID} clipPathUnits="userSpaceOnUse">
          {surface.maskFillRule ? <path clipRule={surface.maskFillRule} fillRule={surface.maskFillRule} d={shapes.map(shape=>`M${shape.map(p=>p.join(",")).join("L")}Z`).join(" ")} /> : shapes.map((shape, index) => (
            <polygon key={index} points={shape.map((p) => p.join(",")).join(" ")} />
          ))}
        </clipPath>
      </defs>
    </svg>
  );
}
