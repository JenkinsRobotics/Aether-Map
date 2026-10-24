import { Checkbox, FieldRow, NumberField } from '@aether/ui';
import type { DrawnSource } from './types';

export function DrawingFields({ drawing, onChange }: { drawing: DrawnSource; onChange: (drawing: DrawnSource) => void }) {
  return <section aria-label="Drawing playback">
    <FieldRow label="Playback"><Checkbox label="Animate strokes" checked={Boolean(drawing.replay)}
      onChange={event => onChange({ ...drawing, replay: event.target.checked ? { durationS: 5, loop: true } : undefined })} /></FieldRow>
    {drawing.replay && <>
      <FieldRow label="Draw over"><NumberField aria-label="Drawing replay duration" value={drawing.replay.durationS} min={.1} max={3600} step={.1} unit="s"
        onValueChange={value => value !== null && onChange({ ...drawing, replay: { ...drawing.replay!, durationS: Math.max(.1, value) } })} /></FieldRow>
      <Checkbox label="Loop drawing" checked={drawing.replay.loop} onChange={event => onChange({ ...drawing, replay: { ...drawing.replay!, loop: event.target.checked } })} />
      <p className="map-hint">Strokes play in draw order at a constant speed. Pause and scrubbing follow the scene clock.</p>
    </>}
  </section>;
}
