import { AetherIcon, Button, EmptyState, FieldRow, InspectorActions, InspectorSection, NumberField, SegmentedControl, SelectField, TextField } from "@aether/ui";
import type { MapShow, OutputSchedule, ShowOutput } from "../document";
import { DAY_NAMES, clockMinutes, clockText, describeSchedule, scheduleActive } from "../output-schedule";
import type { OutputDisplay, WirelessKind } from "../output-session";
import { outputRegion } from "../output-crop";
import { MonitorPicker } from "./MonitorPicker";
import { WirelessOutput } from "./WirelessOutput";
import { canDeployToDevice } from '../device-capabilities';
import { useMapDevices } from "../use-map-devices";
import { RECORDING_SIZES, useRecording, type RecordingSize } from "../export-video";
import type { DisplayInfo } from "../screens";
import { OutputViewProperties } from './OutputViewProperties';
import { outputView, type OutputView } from '../output-view';

/**
 * The selected output's properties, the way a surface has its own. An output's
 * device is a property of it — which transport, and for an edge output which
 * paired player — not a separate panel you have to reconcile by hand. Managing
 * the players themselves stays in the Outputs tray's device manager.
 */
export function OutputProperties({ show, output, workspace = 'mapping', size = show.output, display, documentID, onChange, onOpen, onOpenWireless, onMatchDisplay, recordingSize, onRecordingSize }: {
  show: MapShow;
  output: ShowOutput | undefined;
  workspace?: OutputView;
  size?: { width: number; height: number };
  display: OutputDisplay | null;
  documentID: string | null;
  onChange: (patch: Partial<ShowOutput>) => void;
  onOpen: (display?: DisplayInfo) => void;
  onOpenWireless: (kind: WirelessKind) => void;
  onMatchDisplay: (width: number, height: number) => void;
  recordingSize: RecordingSize;
  onRecordingSize: (size: RecordingSize) => void;
}) {
  const { list, online } = useMapDevices();
  const recording = useRecording();
  if (!output) return <div className="map-feature-fields">
    <EmptyState compact icon={<AetherIcon name="window" />} title="No output selected"
      description="Choose an output to set the device it plays on and the region it projects." />
  </div>;

  const crop = outputRegion(show, output, size);
  const scene = show.scenes.find((entry) => entry.id === output.sceneId);
  // "wireless" is one choice here and two transports underneath; the kind stored
  // is whichever the operator picks in WirelessOutput.
  const group = output.kind === "cast" || output.kind === "airplay" ? "wireless" : output.kind;
  const mine = list.filter((device) => device.mine && canDeployToDevice(device));
  const device = mine.find((entry) => entry.id === output.deviceId);
  return <div className="map-feature-fields">
    <InspectorSection title="View"><OutputViewProperties show={show} output={output} workspace={workspace} onChange={onChange} /></InspectorSection>
    <InspectorSection title="Device"><FieldRow label="Connection" layout="stacked" help={group === "monitor" ? "A movable window for your projector or monitor."
      : group === "wireless" ? "Share this output wirelessly."
      : "A Raspberry Pi on the projector, running the show on its own."}>
      <SegmentedControl ariaLabel="Output device type" value={group}
        options={[{ id: "monitor", label: "Monitor" }, { id: "edge", label: "Edge device" }, { id: "wireless", label: "Wireless" }]}
        onChange={(id) => onChange({
          kind: id === "wireless" ? "cast" : (id as ShowOutput["kind"]),
          // A showtime belongs to a device that runs unattended. Carrying one
          // onto a monitor would leave a rule nothing in the panel shows,
          // blacking out a window for reasons an operator cannot see.
          ...(id === "edge" ? {} : { schedule: undefined }),
        })} />
    </FieldRow>

    {group === "monitor" && <MonitorPicker output={size} reported={display} onOpen={onOpen} onMatch={onMatchDisplay} />}
    {group === "wireless" && <WirelessOutput output={size} reported={display} onMatch={onMatchDisplay}
      onOpen={(kind) => { onChange({ kind }); onOpenWireless(kind); }} />}
    {group === "edge" && <>
      <FieldRow label="Player"><SelectField aria-label="Edge device for this output" value={output.deviceId ?? ""}
        options={[{ value: "", label: mine.length ? "Choose a paired device…" : "No devices paired" },
          ...mine.map((entry) => ({ value: entry.id, label: entry.name }))]}
        onChange={(event) => onChange({ deviceId: event.target.value || undefined })} /></FieldRow>
      {device && <p className="map-hint">
        {online(device) ? "Online" : "Offline"}
        {device.document === documentID ? " · playing this show" : device.document ? " · playing another show" : " · not assigned"}
        . Pair, deploy and stop players in the Show workspace’s Players tab.
      </p>}

      {/* Only an edge device has a showtime, because it is the only output
          that runs with nobody there. A monitor or a Cast window lives as long
          as the laptop driving it is awake — if you are present to open it,
          you are present to start the show. A Pi is handed the project and
          left, so it needs to know its own hours. */}
      <FieldRow label="Showtime" help="This device runs the show on its own clock, so it keeps these hours through a reboot and a dead network.">
        <SegmentedControl ariaLabel="Showtime" value={output.schedule ? "scheduled" : "always"}
          options={[{ id: "always", label: "Always on" }, { id: "scheduled", label: "On a schedule" }]}
          onChange={(id) => onChange({ schedule: id === "scheduled" ? DEFAULT_SCHEDULE : undefined })} />
      </FieldRow>

      {output.schedule && <ScheduleFields schedule={output.schedule} name={output.name}
        onChange={(schedule) => onChange({ schedule })} />}
    </>}

    </InspectorSection>
    <InspectorSection title="Scene & region"><FieldRow label="Scene" help="An output shows only the scene it is linked to. With no scene linked there is nothing connected to it, so it projects nothing.">
      <SelectField aria-label="Scene shown on this output" value={output.sceneId ?? ""}
        options={[{ value: "", label: "No scene — output dark" },
          ...show.scenes.map((entry) => ({ value: entry.id, label: entry.suppressed ? `${entry.name} (suppressed)` : entry.name }))]}
        onChange={(event) => onChange({ sceneId: event.target.value || undefined })} /></FieldRow>

    {!scene && <p className="map-hint">{output.name} has no scene linked, so it projects nothing. Pick a scene above to send it a picture.</p>}
    {scene?.suppressed && <p className="map-hint">{scene.name} is suppressed, so {output.name} projects nothing until the scene is restored to the show.</p>}

    {([['xPx', 'Crop left'], ['yPx', 'Crop top'], ['widthPx', 'Crop width'], ['heightPx', 'Crop height']] as const).map(([key, label]) =>
      <FieldRow key={key} label={label}><NumberField aria-label={label} value={crop[key]} unit="px"
        min={key.includes("width") || key.includes("height") ? 1 : undefined}
        onValueChange={(v) => v !== null && onChange({ crop: { ...crop, [key]: v } })} /></FieldRow>)}
    <FieldRow label="Fit on display"><SelectField aria-label="Output fit" value={crop.fit}
      options={[{ value: "contain", label: "Fit whole crop" }, { value: "cover", label: "Fill display" }, { value: "stretch", label: "Stretch to display" }]}
      onChange={(e) => onChange({ crop: { ...crop, fit: e.target.value as typeof crop.fit } })} /></FieldRow>
    <InspectorActions><Button disabled={!display} onClick={() => display && onChange({ crop: { ...crop, widthPx: display.width, heightPx: display.height } })}>Use output window size</Button>
    <Button onClick={() => onChange({ crop: { xPx: 0, yPx: 0, widthPx: size.width, heightPx: size.height, fit: "contain" } })}>Project whole scene</Button></InspectorActions></InspectorSection>
    {outputView(output, workspace) === 'visualization' && <FieldRow label="Record at" help={recording.status}>
      <SelectField aria-label="Recording size" value={recordingSize} disabled={recording.recording}
        options={Object.entries(RECORDING_SIZES).map(([value, entry]) => ({ value, label: entry.label }))}
        onChange={(event) => onRecordingSize(event.target.value as RecordingSize)} />
    </FieldRow>}
  </div>;
}

/** Dusk to eleven: the case a scheduled projector is nearly always set up for. */
const DEFAULT_SCHEDULE: OutputSchedule = { fromMinutes: 18 * 60, toMinutes: 23 * 60 };

/**
 * The hours an output runs. Days are toggles rather than a multi-select: the
 * question is "which nights", and seven small buttons answer it in one glance
 * where a list box would need opening to read back.
 */
function ScheduleFields({ schedule, name, onChange }: {
  schedule: OutputSchedule;
  name: string;
  onChange: (schedule: OutputSchedule) => void;
}) {
  // An absent list means every day, and the buttons show all seven pressed, so
  // a toggle has to start from all seven too — reading it as an empty
  // selection turned the first click into "Mondays only".
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  const days = schedule.days?.length ? schedule.days : ALL_DAYS;
  const toggle = (day: number) => {
    const next = days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day];
    // Turning the last day off would leave a schedule that never runs, which is
    // "Always off" spelled the long way — there is no such thing to mean, so
    // the last one stays on and the way out is Always on.
    if (!next.length) return;
    // Every day is stored as absent, not as all seven: one spelling of it.
    onChange({ ...schedule, days: next.length === 7 ? undefined : [...next].sort((a, b) => a - b) });
  };
  const time = (which: "fromMinutes" | "toMinutes", label: string) =>
    <FieldRow key={which} label={label}>
      <TextField type="time" aria-label={label} value={clockText(schedule[which])}
        onChange={(event) => {
          const minutes = clockMinutes(event.target.value);
          if (minutes !== null) onChange({ ...schedule, [which]: minutes });
        }} />
    </FieldRow>;
  return <>
    {time("fromMinutes", "Starts")}
    {time("toMinutes", "Ends")}
    <FieldRow label="Days" layout="stacked">
      <div className="map-schedule-days" role="group" aria-label="Days this output runs">
        {DAY_NAMES.map((label, day) => (
          <Button key={label} aria-label={label} aria-pressed={days.length === 0 || days.includes(day)}
            onClick={() => toggle(day)}>{label[0]}</Button>
        ))}
      </div>
    </FieldRow>
    <p className="map-hint">
      {describeSchedule(schedule)}
      {schedule.toMinutes < schedule.fromMinutes && " — runs through midnight"}
      {". "}
      {scheduleActive(schedule) ? `${name} is within its hours now.` : `${name} is dark until its next start.`}
    </p>
  </>;
}
