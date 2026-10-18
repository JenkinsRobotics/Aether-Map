import { sceneSize } from "../scene-size";
import { backdropSurface } from "../background-layer";
import { TransformPanel } from "./TransformPanel";
import { Button, FieldRow, InspectorSection, ParameterRow, SelectField } from "@aether/ui";
import { activeScene, type MapShow, type Scene } from "../document";

export function SetupBackgroundPanel({ show, onChange }: {
  show: MapShow;
  onChange: (background: Scene["setupBackground"]) => void;
}) {
  const background = activeScene(show)?.setupBackground;
  return <div className="map-properties">
    <InspectorSection title="Backdrop"><FieldRow label="Image" help="Use a photo of the wall or stage to align surfaces. It appears only in the editor and is never projected.">
      <SelectField aria-label="Backdrop image" value={background?.mediaId ?? ""}
        options={[{ value: "", label: "No backdrop" }, ...show.media.filter((media) => media.kind === "image").map((media) => ({ value: media.id, label: media.name }))]}
        onChange={(event) => onChange(event.target.value
          ? { mediaId: event.target.value, visible: true, opacity: background?.opacity ?? 0.6 }
          : undefined)} />
    </FieldRow>
    {!background && <p className="map-hint">Choose Import backdrop in the toolbar to add a photo.</p>}
    {background && <>
      <FieldRow label="Visibility">
        <Button aria-pressed={background.visible} onClick={() => onChange({ ...background, visible: !background.visible })}>
          {background.visible ? "Hide backdrop" : "Show backdrop"}
        </Button>
      </FieldRow>
      <ParameterRow label="Opacity" ariaLabel="Backdrop opacity" min={0} max={100} step={1} unit="%" sliderRange={{ min: 0, max: 100 }}
        value={Math.round(background.opacity * 100)} onChange={opacity => onChange({ ...background, opacity: opacity / 100 })} />
      <TransformPanel surface={backdropSurface(show)} output={sceneSize(show)} onPatch={(_, patch) => onChange({ ...background,
        ...(patch.corners ? { corners: patch.corners } : {}), ...(patch.locked !== undefined ? { locked: patch.locked } : {}),
        ...(patch.lockAspectRatio !== undefined ? { lockAspectRatio: patch.lockAspectRatio } : {}) })} />
      <Button disabled={background.locked} onClick={() => onChange(undefined)}>Remove backdrop</Button>
    </>}</InspectorSection>
  </div>;
}
