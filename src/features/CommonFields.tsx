import { Button, FieldRow, NumberField, SelectField } from "@aether/ui";
import type { MapShow, Surface } from "../document";
import { DEFAULT_TRANSFORM } from "./types";
import { animateSurface } from "./animation";
import { polygonSidesPatch } from "../mask/polygon-surface";
/**
 * The shape fields, plus the animatable transform offset.
 *
 * Locking and "Align to scene" used to live here too. They moved out when
 * Transform became a section of the same Properties panel rather than a panel
 * of its own: both edit `surface.locked` and both align the same layer, so
 * side by side they were one control drawn twice — and spelled two ways,
 * "Centre" here against "Center" there.
 *
 * The offset below is deliberately *not* the same thing as Transform's X/Y.
 * Transform sets the layer's bounds; this is an offset applied on top of them,
 * and it is what animation drives.
 */
export function CommonFields({ surface, output, onPatch }: { surface: Surface; output: MapShow["output"]; onPatch: (id: string, patch: Partial<Surface>) => void }) {
  const transform = { ...DEFAULT_TRANSFORM, ...surface.transform };
  const patch = (p: Partial<Surface>) => onPatch(surface.id, p);
  const align = (axis: 0 | 1, factor: number) => {
    const points = animateSurface({ ...surface, animation: undefined }, 0).corners.map((p) => p[axis]);
    const min = Math.min(...points), max = Math.max(...points), extent = axis === 0 ? output.width : output.height;
    const delta = (extent - (max - min)) * factor - min;
    const key = axis === 0 ? "xPx" : "yPx";
    patch({ transform: { ...transform, [key]: transform[key] + delta } });
  };
  return <>
    <FieldRow label="Editing"><Button aria-pressed={Boolean(surface.locked)} onClick={() => patch({ locked: !surface.locked })}>{surface.locked ? "Unlock geometry" : "Lock geometry"}</Button></FieldRow>
    <FieldRow label="Align to scene" layout="stacked"><div className="map-align-buttons">{["Left", "Centre", "Right", "Top", "Middle", "Bottom"].map((label, i) => <Button key={label} onClick={() => align(i < 3 ? 0 : 1, (i % 3) / 2)}>{label}</Button>)}</div></FieldRow>
    <FieldRow label="Shape"><SelectField aria-label="Feature shape" value={surface.polygonSides ? "polygon" : surface.shape ?? "rectangle"} options={[{ value: "rectangle", label: "Rectangle" }, { value: "ellipse", label: "Ellipse" }, { value: "polygon", label: "Polygon" }]} onChange={(e) => {
      if (e.target.value === "polygon") patch({ shape: "rectangle", ...polygonSidesPatch(surface, 6) });
      else patch({ shape: e.target.value as "rectangle" | "ellipse", ...(surface.polygonSides ? { polygonSides: undefined, masks: [], maskCurves: undefined } : {}) });
    }} /></FieldRow>
    {surface.polygonSides !== undefined && <FieldRow label="Sides"><NumberField aria-label="Polygon sides" value={surface.polygonSides} min={3} max={64} step={1} onValueChange={(value) => value !== null && patch(polygonSidesPatch(surface, value))} /></FieldRow>}
    {!surface.polygonSides && <FieldRow label="Corner radius"><NumberField aria-label="Corner radius" value={surface.radiusPx ?? 0} min={0} unit="px" onValueChange={(v) => v !== null && patch({ radiusPx: v })} /></FieldRow>}
    <details><summary>Offset, scale and rotation</summary><div className="map-feature-fields">
      {([['xPx', 'Horizontal offset', 'px'], ['yPx', 'Vertical offset', 'px'], ['scaleX', 'Horizontal scale', '×'], ['scaleY', 'Vertical scale', '×'], ['rotationDeg', 'Rotation', '°']] as const).map(([key, label, unit]) => <FieldRow key={key} label={label}><NumberField aria-label={label} value={transform[key]} step={key.startsWith("scale") ? .1 : 1} min={key.startsWith("scale") ? .01 : undefined} unit={unit} onValueChange={(v) => v !== null && patch({ transform: { ...transform, [key]: v } })} /></FieldRow>)}
      <Button onClick={() => patch({ transform: undefined })}>Reset transform</Button>
    </div></details>
  </>;
}
