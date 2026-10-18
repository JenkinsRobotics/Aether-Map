import { Button, FieldRow, InspectorSection, ParameterRow, SelectField } from "@aether/ui";
import type { MapShow } from "../document";

export interface ProgramPanelProps {
  show: MapShow;
  onMix: (mix: MapShow["mix"]) => void;
  /** Blackout and the test grid: show-level, never per-device. */
  onShowChange: (output: MapShow["output"]) => void;
}

/**
 * The crossfader: what is going out, and how far between two scenes it is.
 *
 * This is a live instrument, not a property of anything. It lived in the Scenes
 * tray because that is what it mixes, and that was the wrong read twice over —
 * a tree lists what a show *contains*, so an unlabelled slider under one looked
 * like a scene's opacity, and it is the one control you must be able to reach
 * while a surface is selected. So it gets its own panel instead: always there,
 * never owned by the selection.
 *
 * `blend` is 0 for all of A (the scene being edited) and 1 for all of B.
 */
export function ProgramPanel({ show, onMix, onShowChange }: ProgramPanelProps) {
  const a = show.scenes.find((scene) => scene.id === show.activeSceneId);
  const b = show.mix?.sceneId ? show.scenes.find((scene) => scene.id === show.mix!.sceneId) : undefined;
  const blend = show.mix?.blend ?? 0;
  // A suppressed scene is out of the show, so there is nothing to rehearse
  // fading to; one already engaged stays listed rather than vanishing from the
  // picker while the fader still points at it.
  const choices = show.scenes.filter((scene) =>
    scene.id !== show.activeSceneId && (!scene.suppressed || scene.id === show.mix?.sceneId));

  return <div className="map-properties">
    <InspectorSection title="Crossfade">
      {show.scenes.length < 2 ? <p className="map-hint">Add a second scene to crossfade between scenes.</p> :
        <div role="group" aria-label="Scene crossfade">
          <FieldRow label="A"><span>{a?.name ?? 'No scene'}</span></FieldRow>
          <FieldRow label="B"><SelectField aria-label="Scene to fade toward" value={show.mix?.sceneId ?? ''}
            options={[{ value: '', label: 'No crossfade' }, ...choices.map(scene => ({ value: scene.id,
              label: `Fade to ${scene.name}${scene.suppressed ? ' (suppressed)' : ''}` }))]}
            onChange={event => onMix(event.target.value ? { sceneId: event.target.value, blend } : undefined)} /></FieldRow>
          {show.mix?.sceneId && <>
            <ParameterRow label="Blend" ariaLabel="Crossfade between scenes" value={Math.round(blend * 100)}
              min={0} max={100} unit="%" sliderRange={{ min: 0, max: 100 }}
              onChange={value => onMix({ sceneId: show.mix!.sceneId, blend: value / 100 })} />
            <p className="map-hint" role="status">{Math.round((1 - blend) * 100)}% {a?.name ?? 'A'}, {Math.round(blend * 100)}% {b?.name ?? 'B'}</p>
          </>}
        </div>}
    </InspectorSection>
    <InspectorSection title="All outputs">
      <FieldRow label="Blackout"><Button aria-label="Blackout" aria-pressed={Boolean(show.output.blackout)}
        onClick={() => onShowChange({ ...show.output, blackout: !show.output.blackout })}>{show.output.blackout ? 'On' : 'Off'}</Button></FieldRow>
      <FieldRow label="Test grid"><Button aria-label="Output test grid" aria-pressed={Boolean(show.output.testPattern)}
        onClick={() => onShowChange({ ...show.output, testPattern: !show.output.testPattern })}>{show.output.testPattern ? 'On' : 'Off'}</Button></FieldRow>
      <p className="map-hint">These controls affect every output.</p>
    </InspectorSection>
  </div>;
}
