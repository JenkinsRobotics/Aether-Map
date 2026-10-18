import { AetherIcon, Button, FieldRow, InspectorSection, NumberField } from '@aether/ui';
import { type MapShow, type Surface } from '../document';
import { animateSurface } from '../features/animation';
import { boundsOf, rotateLayer, setLayerBounds, type Bounds } from '../layer-transform';

/** Shared by all Map layers and the Backdrop property window. Coordinates are scene pixels. */
export function TransformPanel({ surface, output, timeS = 0, onPatch }: {
  surface: Surface | null; output: MapShow['output']; timeS?: number;
  onPatch: (id: string, patch: Partial<Surface>) => void;
}) {
  if (!surface) return <div className="map-hint">Select a layer to position, resize, or rotate it.</div>;
  const visible = animateSurface(surface, timeS), b = boundsOf(visible.corners);
  const rotation = Math.atan2(visible.corners[1][1] - visible.corners[0][1], visible.corners[1][0] - visible.corners[0][0]) * 180 / Math.PI;
  const patch = (p: Partial<Surface>) => onPatch(surface.id, p);
  const setBounds = (next: Bounds) => patch(setLayerBounds(surface, next, timeS));
  const dimension = (key: keyof Bounds, value: number | null) => {
    if (value === null || value === Number(b[key].toFixed(2))) return;
    const next = { ...b, [key]: value };
    if (surface.lockAspectRatio && b.width > 0 && b.height > 0) {
      if (key === 'width') next.height = b.height * value / b.width;
      if (key === 'height') next.width = b.width * value / b.height;
    }
    setBounds(next);
  };
  return <section className="map-properties map-transform-panel" aria-label="Layer transform">
    <div className="map-hint">{surface.name}</div>
    <FieldRow label="Editing"><Button aria-pressed={Boolean(surface.locked)} onClick={() => patch({ locked: !surface.locked })}>
      <AetherIcon name="pin_slot" /> {surface.locked ? 'Unlock layer' : 'Lock layer'}
    </Button></FieldRow>
    <fieldset disabled={surface.locked}>
      <InspectorSection title="Position & size"><div className="map-transform-grid">{([['x', 'X'], ['y', 'Y'], ['width', 'Width'], ['height', 'Height']] as const).map(([key, label]) =>
        <FieldRow key={key} label={label}><NumberField aria-label={`Layer ${label}`} value={Number(b[key].toFixed(2))} min={key === 'width' || key === 'height' ? 1 : undefined} unit="px" onCommit={v => dimension(key, v)} /></FieldRow>)}</div>
      <FieldRow label="Proportions"><Button aria-label="Lock aspect ratio" title="Lock aspect ratio" aria-pressed={Boolean(surface.lockAspectRatio)} onClick={() => patch({ lockAspectRatio: !surface.lockAspectRatio })}>
        <AetherIcon name="link" /> {surface.lockAspectRatio ? 'Locked' : 'Free'}
      </Button></FieldRow>
      <FieldRow label="Scale by"><NumberField key={`${b.width}/${b.height}`} aria-label="Layer scale percent" defaultValue={100} min={1} unit="%" onCommit={v => v !== 100 && setBounds({ ...b, width: Math.max(1, b.width * v / 100), height: Math.max(1, b.height * v / 100) })} /></FieldRow>
      <FieldRow label="Rotation"><NumberField aria-label="Layer rotation" value={Number(rotation.toFixed(2))} unit="°" onCommit={v => v !== Number(rotation.toFixed(2)) && patch(rotateLayer(surface, v - rotation, timeS))} /></FieldRow>
      </InspectorSection><InspectorSection title="Alignment"><FieldRow label="Align to scene" layout="stacked"><div className="map-align-buttons">{['Left', 'Center', 'Right', 'Top', 'Middle', 'Bottom'].map((label, i) =>
        <Button key={label} onClick={() => setBounds({ ...b, ...(i < 3 ? { x: (output.width - b.width) * (i % 3) / 2 } : { y: (output.height - b.height) * (i % 3) / 2 }) })}>{label}</Button>)}</div></FieldRow></InspectorSection>
    </fieldset>
    <details><summary>Transform shortcuts</summary><p className="map-hint">Drag to move; use side and corner handles to resize. Shift preserves proportions. Snap aligns edges and centers; Alt bypasses it. Sketch → Node edits individual projection corners.</p></details>
  </section>;
}
