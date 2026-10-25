import { Button, FieldRow, InspectorSection, NumberField, SelectField } from "@aether/ui";
import type { MapShow } from "../document";
import type { MapTimeline } from "../timelines";
import { clipUses } from "../compound-clips";
import { SceneSizeFields, useSceneDraft } from "./SceneSizeFields";

/** A compound clip's own settings in Content: name and board (a standard size,
 * or the proportions of a surface it is meant for), length, and where it plays. */
export function ClipProperties({ show, clip, onChange }: {
  show: MapShow; clip: MapTimeline & { board: { widthPx: number; heightPx: number } };
  onChange: (patch: Partial<MapTimeline>) => void;
}) {
  const size = { width: clip.board.widthPx, height: clip.board.heightPx };
  const draft = useSceneDraft(clip.name, size);
  const changed = draft.name.trim() !== clip.name || draft.width !== size.width || draft.height !== size.height;
  const surfaces = show.scenes.flatMap(canvas => canvas.surfaces.filter(s => !s.sceneCanvas && s.kind !== 'mask').map(s => ({ canvas, surface: s })));
  const uses = clipUses(show, clip.id);
  const where = (sceneID: string, surfaceID?: string) => {
    const canvas = show.scenes.find(s => s.id === sceneID);
    return `${canvas?.name ?? 'Canvas'} › ${surfaceID ? canvas?.surfaces.find(s => s.id === surfaceID)?.name ?? 'Surface' : 'Whole canvas'}`;
  };
  return <div className="map-properties">
    <InspectorSection title="Clip">
      <SceneSizeFields draft={draft} size={size} />
      <FieldRow label="Match surface" help="Size the board to a surface's proportions, to design right on its shape.">
        <SelectField aria-label="Match surface" value="" options={[{ value: "", label: "Choose a surface…" },
          ...surfaces.map(({ canvas, surface }) => ({ value: surface.id, label: `${canvas.name} › ${surface.name}` }))]}
          onChange={(event) => {
            const found = surfaces.find(s => s.surface.id === event.target.value)?.surface;
            if (found) onChange({ board: { widthPx: Math.max(1, Math.round(found.source.rect[2])), heightPx: Math.max(1, Math.round(found.source.rect[3])) } });
          }} />
      </FieldRow>
      <div className="map-feature-buttons">
        <Button primary disabled={!draft.valid || !changed} onClick={() => draft.valid && onChange({ name: draft.name.trim(),
          board: { widthPx: Math.round(draft.width!), heightPx: Math.round(draft.height!) } })}>Apply</Button>
      </div>
    </InspectorSection>
    <InspectorSection title="Timeline">
      <FieldRow label="Length" help="How long the clip runs before it ends or loops where it is used.">
        <NumberField aria-label="Clip length" value={clip.durationS} min={1} max={86400} unit="s" precision={0}
          onValueChange={(value) => value !== null && onChange({ durationS: value })} />
      </FieldRow>
    </InspectorSection>
    <InspectorSection title="Used on">
      <p className="map-hint">{uses.length ? `Used on ${uses.length} ${uses.length === 1 ? 'surface' : 'surfaces'}.` : 'Not used yet. Assign it to a surface in the Scene workspace.'}</p>
      {uses.map(u => <p key={`${u.sceneID}:${u.surfaceID ?? ''}`} className="map-hint">{where(u.sceneID, u.surfaceID)}</p>)}
    </InspectorSection>
  </div>;
}
