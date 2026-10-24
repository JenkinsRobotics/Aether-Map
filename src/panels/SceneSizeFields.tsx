import { useState } from "react";
import { Button, FieldRow, NumberField, SelectField, TextField } from "@aether/ui";
import { ARTBOARD_PRESETS, ARTBOARD_RATIOS, type SceneSize } from "../scene-size";

/**
 * The name and artboard-size fields for a scene.
 *
 * Shared by the New scene / Scene properties dialog and the Properties panel,
 * because a scene's size has one meaning and two places to edit it — a second
 * copy of these five interlocking controls (preset, ratio, width, height,
 * orientation) would drift the first time one of them was fixed.
 *
 * Uncontrolled width/height: they are `null` mid-typing, which is why the owner
 * is told about validity rather than being handed a half-typed number.
 */
export interface SceneDraftValue {
  name: string;
  width: number | null;
  height: number | null;
}

export function useSceneDraft(initialName: string, size: SceneSize) {
  const [name, setName] = useState(initialName);
  const [width, setWidth] = useState<number | null>(size.width);
  const [height, setHeight] = useState<number | null>(size.height);
  const valid = Boolean(name.trim()) && width !== null && height !== null
    && width >= 1 && height >= 1 && width <= 32768 && height <= 32768;
  return { name, setName, width, setWidth, height, setHeight, valid };
}

export type SceneDraftState = ReturnType<typeof useSceneDraft>;

export function SceneSizeFields({ draft, size }: { draft: SceneDraftState; size: SceneSize }) {
  const { name, setName, width, setWidth, height, setHeight } = draft;
  const [locked, setLocked] = useState(false);
  const ratio = width && height ? width / height : 1;
  const preset = ARTBOARD_PRESETS.find((p) => p.width === width && p.height === height)?.value ?? "custom";
  const aspect = ARTBOARD_RATIOS.find((p) => Math.abs(p.ratio - ratio) < 0.002)?.value ?? "custom";
  return (
    <>
      <FieldRow label="Name">
        <TextField aria-label="Scene name" value={name} onChange={(e) => setName(e.target.value)} />
      </FieldRow>
      <FieldRow label="Size preset">
        <SelectField aria-label="Scene size preset" value={preset}
          options={[{ value: "custom", label: "Custom" }, ...ARTBOARD_PRESETS]}
          onChange={(e) => {
            const p = ARTBOARD_PRESETS.find((p) => p.value === e.target.value);
            if (p) { setWidth(p.width); setHeight(p.height); }
          }} />
      </FieldRow>
      <FieldRow label="Aspect ratio">
        <SelectField aria-label="Scene aspect ratio" value={aspect}
          options={[{ value: "custom", label: "Custom" }, ...ARTBOARD_RATIOS]}
          onChange={(e) => {
            const p = ARTBOARD_RATIOS.find((p) => p.value === e.target.value);
            if (p) { const w = width || size.width; setWidth(w); setHeight(Math.round(w / p.ratio)); }
          }} />
      </FieldRow>
      <div className="map-dimension-rows">
        <FieldRow label="Width">
          <NumberField aria-label="Scene width" value={width} min={1} max={32768} unit="px" precision={0}
            onValueChange={(v) => { setWidth(v); if (locked && v !== null) setHeight(Math.max(1, Math.round(v / ratio))); }} />
        </FieldRow>
        <FieldRow label="Height">
          <NumberField aria-label="Scene height" value={height} min={1} max={32768} unit="px" precision={0}
            onValueChange={(v) => { setHeight(v); if (locked && v !== null) setWidth(Math.max(1, Math.round(v * ratio))); }} />
        </FieldRow>
      </div>
      <Button aria-pressed={locked} onClick={() => setLocked((v) => !v)}>Lock aspect ratio</Button>
      <FieldRow label="Orientation">
        <SelectField aria-label="Scene orientation"
          value={width === height ? "square" : (width ?? 0) > (height ?? 0) ? "landscape" : "portrait"}
          options={[{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" },
            ...(width === height ? [{ value: "square", label: "Square" }] : [])]}
          onChange={(e) => {
            if (!width || !height || e.target.value === "square") return;
            const long = Math.max(width, height), short = Math.min(width, height);
            setWidth(e.target.value === "landscape" ? long : short);
            setHeight(e.target.value === "landscape" ? short : long);
          }} />
      </FieldRow>
    </>
  );
}
