import { NumberField } from "@aether/ui";
import { useState } from "react";

/** A transport's end time, which is also its length: it reads as a time and
 * becomes a small seconds field when clicked (Enter commits, Esc cancels). */
export function TransportLength({ durationS, label, format, onLength }: {
  durationS: number; label: string; format: (s: number) => string; onLength: (s: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) return <button type="button" className="map-transport-length" title={`${label} — click to change`} aria-label={`${label}: ${format(durationS)}`}
    onClick={() => setEditing(true)}>{format(durationS)}</button>;
  return <span className="map-transport-length-field">
    <NumberField autoFocus aria-label={label} value={durationS} min={1} max={86400} unit="s" precision={1}
      onCommit={v => { onLength(v); setEditing(false); }} onCancel={() => setEditing(false)} onBlurCapture={() => setEditing(false)} />
  </span>;
}
