import { Button, FieldRow, NumberField } from "@aether/ui";
import type { MediaRef, Rect } from "../document";

export function SourceCropFields({ rect, media, onChange }: { rect: Rect; media: MediaRef; onChange: (rect: Rect) => void }) {
  const update = (index: number, value: number) => {
    const next = [...rect] as Rect;
    next[index] = value;
    next[0] = Math.max(0, Math.min(media.width - 1, next[0]));
    next[1] = Math.max(0, Math.min(media.height - 1, next[1]));
    next[2] = Math.max(1, Math.min(media.width - next[0], next[2]));
    next[3] = Math.max(1, Math.min(media.height - next[1], next[3]));
    if (next.some((v, i) => v !== rect[i])) onChange(next);
  };
  return <details><summary>Input crop</summary><div className="map-feature-fields">
    {["Left", "Top", "Width", "Height"].map((label, i) => <FieldRow key={label} label={label}>
      <NumberField aria-label={`Input crop ${label.toLowerCase()}`} value={rect[i]} unit="px" min={i < 2 ? 0 : 1}
        max={i % 2 ? media.height : media.width} onValueChange={(value) => value !== null && update(i, value)} />
    </FieldRow>)}
    <Button onClick={() => onChange([0, 0, media.width, media.height])}>Use whole input</Button>
  </div></details>;
}
