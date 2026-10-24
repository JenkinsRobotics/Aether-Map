import { Button, Checkbox, FieldRow, InspectorSection, NumberField } from "@aether/ui";
import { artboardOf, sceneSize } from "../scene-size";
import { SceneSizeFields, useSceneDraft } from "./SceneSizeFields";
import type { MapShow, Scene } from "../document";

export interface ScenePropertiesProps {
  show: MapShow;
  scene: Scene;
  onPatch: (sceneID: string, patch: Partial<Scene>) => void;
  onDelete: (sceneID: string) => void;
}

/**
 * A scene's properties, in the Properties panel, because selecting a scene
 * should answer "what is this thing" the same way selecting a surface does.
 *
 * Size is applied rather than live: the width and height fields go through
 * `null` while you type, and resizing the artboard on every keystroke would
 * walk the canvas — and any auto-fitted backdrop — through every intermediate
 * number. Everything that cannot be half-typed (duration, hidden, suppressed)
 * applies immediately.
 */
export function SceneProperties({ show, scene, onPatch, onDelete }: ScenePropertiesProps) {
  const size = sceneSize(show, scene);
  // Keyed on the scene in App, so switching scenes remounts with fresh fields
  // rather than showing the previous scene's half-typed size.
  const draft = useSceneDraft(scene.name, size);
  const { name, width, height, valid } = draft;
  const changed = name.trim() !== scene.name || width !== size.width || height !== size.height;
  const outputs = show.outputs.filter((output) => output.sceneId === scene.id);

  return (
    <div className="map-properties">
      <InspectorSection title="Scene">
      <SceneSizeFields draft={draft} size={size} />
      <div className="map-feature-buttons">
        <Button primary disabled={!valid || !changed} onClick={() => {
          if (!valid) return;
          onPatch(scene.id, { name: name.trim(),
            artboard: artboardOf({ width: Math.round(width!), height: Math.round(height!) }) });
        }}>Apply</Button>
      </div>
      </InspectorSection>

      <InspectorSection title="Timeline">
      <FieldRow label="Length" help="How much timeline this scene shows, and where a sequence loops. Not a limit on playback.">
        <NumberField aria-label="Scene length" value={scene.durationS} min={1} max={86400} unit="s" precision={0}
          onValueChange={(value) => value !== null && onPatch(scene.id, { durationS: value })} />
      </FieldRow>

      </InspectorSection><InspectorSection title="Visibility">
      <Checkbox label="Hidden"
        description="Off the canvas while you work. The scene still plays and still reaches any output linked to it."
        checked={Boolean(scene.hidden)}
        onChange={(event) => onPatch(scene.id, { hidden: event.target.checked })} />
      <Checkbox label="Suppressed"
        description="Out of the show: no output renders it and the crossfader will not fade to it. It stays on the canvas and stays editable."
        checked={Boolean(scene.suppressed)}
        onChange={(event) => onPatch(scene.id, { suppressed: event.target.checked })} />
      {/* Which projectors this scene actually reaches — the question the
          binding rule makes worth answering from the scene's own side, rather
          than opening each output in turn to find out. */}
      <p className="map-hint">
        {scene.suppressed
          ? "Suppressed, so nothing is projecting this scene."
          : outputs.length
            ? `Projecting on ${outputs.map((output) => output.name).join(", ")}.`
            : "No output is linked to this scene, so nothing is projecting it."}
      </p>

      </InspectorSection><div className="map-properties-footer">
        <Button disabled={show.scenes.length <= 1} onClick={() => onDelete(scene.id)}>Delete scene</Button>
      </div>
    </div>
  );
}
