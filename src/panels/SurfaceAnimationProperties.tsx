import { useState } from 'react';
import { Button } from '@aether/ui';
import type { CueAction, Surface } from '../document';
import { AnimationFields } from '../features/AnimationFields';
import type { AnimatedProperty } from '../features/types';
import { describeCue } from '../cues';

/** Geometry animation remains available on the selected surface, never its visual. */
export function SurfaceAnimationProperties({ surface, timeS, onSeek, onPatch, onAddCue, onRemoveCue }: {
  surface: Surface; timeS: number; onSeek: (timeS: number) => void;
  onPatch: (id: string, patch: Partial<Surface>) => void;
  onAddCue: (id: string, action: CueAction) => void;
  onRemoveCue: (id: string, cueID: string) => void;
}) {
  const [property, setProperty] = useState<AnimatedProperty>('opacity');
  return <fieldset className="map-asset-fields" disabled={surface.locked}>
    <div className="map-section-label">Surface animation</div>
    <AnimationFields inspector surface={surface} timeS={timeS} property={property} onProperty={setProperty} onSeek={onSeek} onPatch={onPatch} />
    <div className="map-visual-actions">{(['show', 'hide', 'opacity'] as const).map(action => <Button key={action} onClick={() => onAddCue(surface.id, action)}>{action === 'opacity' ? 'Opacity 50%' : action === 'show' ? 'Show' : 'Hide'}</Button>)}</div>
    {surface.cues.map(cue => <div key={cue.id}><Button onClick={() => onSeek(cue.timeS)}>{describeCue(cue)}</Button><Button aria-label={`Remove cue at ${cue.timeS}`} onClick={() => onRemoveCue(surface.id, cue.id)}>Remove cue</Button></div>)}
  </fieldset>;
}
