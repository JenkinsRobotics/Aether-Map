import { AlphaMaskControls } from './mask/AlphaMaskControls';
import { useState } from 'react';
import { AetherIcon, Button, FieldRow, NumberField, Checkbox, SelectField } from '@aether/ui';
import { allSurfaces, type MapShow, type Point, type Surface } from './document';
import { resolveTreeID } from './scene-tree';
import { groupBounds, type GroupGeometryChange } from './group-interaction';
import { flipLayer } from './layer-transform';
import { roundMaskPoint } from './masks';
import type { ActiveHandle } from './useSurfaceInteraction';
import type { MappingPreferences } from './mapping-preferences';
import type { CornerRef } from './corner-welds';
import { curveForEdge, setEdgeCurve, setMaskNodeMode, reverseMaskShape } from './mask/curves';

/** Mapping commands use the same geometry transactions as canvas gestures. */
export function MappingControls({ show, selectedID, handle, preferences, onPreferences, onGeometry, onRound, onDetach, onPatch }: {
  onPatch?: (id: string, patch: Partial<Surface>) => void;
  onDetach?: (ref: CornerRef) => void;
  show: MapShow; selectedID: string | null; handle: ActiveHandle | null;
  preferences: MappingPreferences; onPreferences: (patch: Partial<MappingPreferences>) => void;
  onGeometry: (changes: GroupGeometryChange[]) => void;
  onRound: (id: string, shape: number, points: Point[]) => void;
}) {
  const [distance, setDistance] = useState(24);
  const target = selectedID ? resolveTreeID(show, selectedID) : undefined;
  const surface = allSurfaces(show).find(s => s.id === selectedID);
  const members: Surface[] = target?.kind === 'folder'
    ? (target.scene?.surfaces ?? show.unassignedSurfaces).filter(s => s.folder === target.folder)
    : surface ? [surface] : [];
  const canEdit = members.length > 0 && members.every(s => !s.locked);
  const point = handle?.kind === 'mask' && handle.surfaceID === selectedID && surface && !surface.locked
    ? handle : null;
  const shape = point && surface?.masks[point.shape];
  const rounded = shape && point ? roundMaskPoint(shape, point.index, distance) : null;
  const flip = (axis: 0 | 1) => {
    if (!canEdit) return;
    const b = groupBounds(members, 0)!;
    const pivot: Point = [b.x + b.width / 2, b.y + b.height / 2];
    onGeometry(members.map(s => ({ id: s.id, geometry: flipLayer(s, axis, 0, pivot) })));
  };
  return <section className="map-properties map-mapping-controls" aria-label="Mapping tools">
    {members.length > 0 && <>
      <div className="map-section-label">Mapping geometry</div>
      {target?.kind === 'folder' && <><strong>{target.folder}</strong><p className="map-hint">{members.length} surfaces · transform the group together. Select a face to edit its outline.</p></>}
      <div className="map-feature-buttons">
        <Button disabled={!canEdit} onClick={() => flip(0)}><AetherIcon name="flip-horizontal" /> Flip horizontal</Button>
        <Button disabled={!canEdit} onClick={() => flip(1)}><AetherIcon name="flip-horizontal" style={{ transform: 'rotate(90deg)' }} /> Flip vertical</Button>
      </div>
      {point && shape && <section className="map-point-controls" aria-label="Selected mask point">
        <strong>Outline {point.shape + 1} · point {point.index + 1}</strong>
        <FieldRow label="Node type"><SelectField aria-label="Node type" value={surface!.maskNodeModes?.[point.shape]?.[point.index] ?? 'corner'}
          options={[{ value: 'corner', label: 'Corner (independent)' }, { value: 'smooth', label: 'Smooth' }, { value: 'symmetric', label: 'Symmetric' }]}
          onChange={e => onPatch?.(surface!.id, setMaskNodeMode(surface!, point.shape, point.index, e.target.value as 'corner' | 'smooth' | 'symmetric'))} /></FieldRow>
        <Button onClick={() => onPatch?.(surface!.id, setEdgeCurve(surface!, point.shape, point.index,
          surface!.maskCurves?.[point.shape]?.[point.index] ? null : curveForEdge(surface!, point.shape, point.index)))}>
          {surface!.maskCurves?.[point.shape]?.[point.index] ? 'Straighten outgoing edge' : 'Curve outgoing edge'}
        </Button>
        <Button onClick={() => onPatch?.(surface!.id, reverseMaskShape(surface!, point.shape))}>Reverse outline</Button>
        <p className="map-hint">Shift constrains handle angles. Alt drags a handle independently.</p>
        <FieldRow label="Round amount" help="Distance along the two edges, capped at half either edge.">
          <NumberField aria-label="Round amount" value={distance} min={1} max={10000} unit="px" onValueChange={v => v !== null && setDistance(v)} />
        </FieldRow>
        <Button disabled={!rounded || rounded === shape} onClick={() => rounded && onRound(surface!.id, point.shape, rounded)}>Round selected point</Button>
        <p className="map-hint">Creates an editable curved outline. Undo restores the corner.</p>
      </section>}
      {surface && !point && <p className="map-hint">In Node mode, select a square outline handle to round that corner.</p>}
      {surface && handle?.surfaceID === surface.id && handle.kind === 'corner' && surface.cornerWelds?.[handle.index] &&
        <Button disabled={surface.locked} onClick={() => onDetach?.({ surfaceID: surface.id, index: handle.index })}>Break corner weld</Button>}
    </>}
    {surface && onPatch && <details><summary>Curved projection</summary>
      <FieldRow label="Bend axis"><SelectField aria-label="Bend axis" disabled={surface.locked} value={surface.bend?.axis ?? 'horizontal'}
        options={[{ value: 'horizontal', label: 'Horizontal cylinder' }, { value: 'vertical', label: 'Vertical cylinder' }]}
        onChange={e => onPatch(surface.id, { bend: { axis: e.target.value as 'horizontal' | 'vertical', angleDeg: surface.bend?.angleDeg ?? 0 } })} /></FieldRow>
      <FieldRow label="Bend angle"><NumberField aria-label="Bend angle" disabled={surface.locked} value={surface.bend?.angleDeg ?? 0} min={-170} max={170} unit="°"
        onValueChange={v => v !== null && onPatch(surface.id, { bend: { axis: surface.bend?.axis ?? 'horizontal', angleDeg: v } })} /></FieldRow>
      <p className="map-hint">Curves the content inside the mapped quad. Negative angles apply the inverse correction. Zero restores a flat projection.</p>
    </details>}
    {surface && onPatch && <AlphaMaskControls key={surface.id} surface={surface} onPatch={onPatch} />}
    <FieldRow label="Visual preview"><Checkbox label="Show visual" aria-label="Show visual while mapping" checked={preferences.showVisual === true} onChange={event => onPreferences({ showVisual: event.target.checked })} /></FieldRow>
    <details className="map-mapping-preferences"><summary>Mapping precision</summary>
      <FieldRow label="Snap"><Checkbox label="Enabled" aria-label="Mapping snapping" checked={preferences.snapping} onChange={event => onPreferences({ snapping: event.target.checked })} /></FieldRow>
      <FieldRow label="Snap distance"><NumberField aria-label="Snap distance" value={preferences.snapDistancePx} min={1} max={30} unit="px" onValueChange={v => v !== null && onPreferences({ snapDistancePx: v })} /></FieldRow>
      <FieldRow label="Pin size"><NumberField aria-label="Mapping pin size" value={preferences.pinSizePx} min={4} max={16} unit="px" onValueChange={v => v !== null && onPreferences({ pinSizePx: v })} /></FieldRow>
      <FieldRow label="Canvas grid"><Checkbox label="Show grid" aria-label="Mapping canvas grid" checked={preferences.grid} onChange={event => onPreferences({ grid: event.target.checked })} /></FieldRow>
      <p className="map-hint">Screen pixels, independent of zoom. Snapped corner pins weld together. Hold Alt to bypass snapping; select a welded pin to break its link.</p>
    </details>
  </section>;
}
