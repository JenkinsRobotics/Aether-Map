import { Button, FieldRow, InspectorSection, NumberField, SelectField } from "@aether/ui";
import type { MapShow, Surface } from "../document";
import type { Visual } from "../visual-model";
import { surfaceTrack } from "../compound-clips";

/** What a surface plays in this scene: the clip now and the one after, how the
 * current clip fits the surface and fades in, and a way back to edit it. */
export function SurfacePlayback({ show, sceneTimelineID, surface, timeS, onChange, onOpenClip }: {
  show: MapShow; sceneTimelineID: string; surface: Surface; timeS: number;
  onChange: (use: Visual) => void; onOpenClip: (clipID: string) => void;
}) {
  const track = surfaceTrack(show, sceneTimelineID, surface.id);
  const uses = (show.visuals ?? []).filter(v => track && v.trackID === track.id && v.timelineRefID).sort((a, b) => a.startS - b.startS);
  const now = uses.find(v => v.continuous || (timeS >= v.startS && timeS < v.startS + v.durationS));
  const next = uses.find(v => v !== now && v.startS > timeS);
  const name = (use?: Visual) => use ? show.timelines?.find(t => t.id === use.timelineRefID)?.name ?? use.name : "Nothing";
  return <InspectorSection title="Plays on this surface">
    <FieldRow label="Now playing"><span>{name(now)}</span></FieldRow>
    <FieldRow label="Next"><span>{name(next)}</span></FieldRow>
    {now && <>
      <FieldRow label="Fit" help="Fill keeps the clip's proportions and crops the overflow; Stretch makes it match the surface exactly.">
        <SelectField aria-label="Fit" value={now.clipFit ?? "stretch"} options={[{ value: "cover", label: "Fill" }, { value: "stretch", label: "Stretch" }]}
          onChange={event => onChange({ ...now, clipFit: event.target.value === "cover" ? "cover" : "stretch" })} />
      </FieldRow>
      <FieldRow label="Transition" help="Seconds this clip takes to fade in.">
        <NumberField aria-label="Transition" value={now.transitionS ?? 0} min={0} max={10} unit="s" precision={1}
          onValueChange={value => value !== null && onChange({ ...now, transitionS: value > 0 ? value : undefined })} />
      </FieldRow>
      <div className="map-feature-buttons"><Button onClick={() => onOpenClip(now.timelineRefID!)}>Open clip in Content</Button></div>
    </>}
  </InspectorSection>;
}
