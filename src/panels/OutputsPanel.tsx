import { useState } from "react";
import { AetherIcon, TreePanel, type MenuItem, type TreeControl, type TreeNode } from "@aether/ui";
import type { MapShow, ShowOutput } from "../document";
import type { OutputDisplay } from "../output-session";
import { outputRegion } from "../output-crop";
import { sceneSize } from "../scene-size";
import { useMapDevices } from "../use-map-devices";
import { startRecording, stopRecording, useRecording } from "../export-video";
import { outputConnection, outputDeviceName } from "../output-connection";
import { describeSchedule } from "../output-schedule";

export interface OutputsPanelProps {
  show: MapShow;
  selectedID: string | null;
  /** Open output windows, by output id. */
  displays: Record<string, OutputDisplay>;
  documentID: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<ShowOutput>) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
  /** Opens the workspace's device manager — pairing and deployment. */
  onDevices: () => void;
  /** The show's name, which the recording is saved under. */
  showName: string;
}

/**
 * An output's icon says what kind of thing it is, because that is the one fact
 * about it you need before you have clicked on it: a window on this machine, a
 * projector on a Pi, or something being cast across the room.
 */
const KIND_ICON = { monitor: "window", cast: "wireless", airplay: "wireless", edge: "hardware" } as const;

/**
 * The show's outputs: which devices it plays to, what each one covers, and
 * which scene it shows. Deliberately not rows in Layers — an output is a
 * viewport onto a scene, not content within one, and it has no z-order,
 * opacity or animation for a layer command to act on.
 */
export function OutputsPanel({ show, selectedID, displays, documentID, onSelect, onAdd, onPatch, onDelete, onOpen, onClose, onDevices, showName }: OutputsPanelProps) {
  const [renamingID, setRenamingID] = useState<string | null>(null);
  const { list, online } = useMapDevices();
  const recording = useRecording();
  const selected = show.outputs.find((output) => output.id === selectedID);
  const sceneOf = (output: ShowOutput) => show.scenes.find((scene) => scene.id === output.sceneId);
  const deviceOf = (output: ShowOutput) => list.find((entry) => entry.id === output.deviceId);
  const connection = (output: ShowOutput) =>
    outputConnection(output, displays[output.id], deviceOf(output), online, documentID);
  // An output has no children. Its device, scene and region are properties of
  // it, and rows that cannot be selected, opened, renamed or deleted are not
  // items in a tree — they only look like a hierarchy that is not there. They
  // live in the Output panel, where every other property of a thing lives.
  const nodes: TreeNode[] = show.outputs.map((output) => {
    // Against the scene this output projects, not the show default: a scene
    // with its own artboard is the raster going out, and the row said 1920×1080
    // while the projector showed 1280×720.
    const region = outputRegion(show, output, sceneSize(show, sceneOf(output)));
    const scene = sceneOf(output);
    const device = deviceOf(output);
    const state = connection(output);
    // The connection leads, because that is what the icon means; the rest is
    // the detail you would otherwise have opened the row to find.
    const summary = [
      state?.label,
      outputDeviceName(output, device),
      scene ? (scene.suppressed ? `${scene.name} — suppressed` : scene.name) : "No scene — dark",
      // Only when there is one: "Always on" on every row would be noise.
      output.schedule ? describeSchedule(output.schedule) : null,
      `${Math.round(region.widthPx)} × ${Math.round(region.heightPx)}`,
    ].filter(Boolean).join(" · ");
    return {
      id: output.id,
      category: output.kind,
      label: output.name,
      // The kind's own icon, so the list reads as what each output is without
      // opening anything.
      icon: <AetherIcon name={KIND_ICON[output.kind]} />,
      // Dim an output that is not reaching anything: configured, not playing.
      dimmed: !state?.live,
      status: state
        ? [{ id: "link", label: summary, icon: <AetherIcon name={state.live ? "link" : "hidden"} /> }]
        : [{ id: "kind", label: summary, icon: <AetherIcon name="hidden" /> }],
    };
  });
  const menuItems = (id: string): MenuItem[] => {
    const output = show.outputs.find((entry) => entry.id === id);
    if (!output) return [];
    return [
      { id: "properties", label: "Properties", icon: <AetherIcon name="settings" /> },
      { id: "open", label: displays[output.id] ? "Show output window" : "Open output window", icon: <AetherIcon name="window" /> },
      ...(displays[output.id] ? [{ id: "close", label: "Close output window", icon: <AetherIcon name="close" /> }] : []),
      { id: "rename", label: "Rename", icon: <AetherIcon name="notes" />, shortcut: "F2", separatorBefore: true },
      // An output shows the scene it is bound to and nothing else; unbound is
      // the deliberate "park this projector dark" state, not a scene of its own.
      { id: "scene:", label: "No scene — output dark", icon: <AetherIcon name="hidden" />, checked: !output.sceneId },
      ...show.scenes.map((scene) => ({ id: "scene:" + scene.id, icon: <AetherIcon name="scene" />,
        label: `Show ${scene.name}${scene.suppressed ? " (suppressed — renders nothing)" : ""}`,
        checked: output.sceneId === scene.id })),
      { id: "delete", label: "Delete output", icon: <AetherIcon name="delete" />, shortcut: "Delete", danger: true,
        separatorBefore: true },
    ];
  };
  const command = (id: string, action: string) => {
    const output = show.outputs.find((entry) => entry.id === id);
    if (!output) return;
    if (action === "properties") onSelect(id);
    else if (action === "open") onOpen(id);
    else if (action === "close") onClose(id);
    else if (action === "rename") setRenamingID(id);
    else if (action === "delete") onDelete(id);
    else if (action.startsWith("scene:")) onPatch(id, { sceneId: action.slice("scene:".length) || undefined });
  };
  const controls: TreeControl[] = [
    { id: "new", label: "New output", icon: <AetherIcon name="new" />, onClick: onAdd },
    // Devices sits in the tray beside New output: managing players is a tool of
    // this collection, not a panel of its own competing with it.
    { id: "devices", label: "Devices", icon: <AetherIcon name="hardware" />, onClick: onDevices },
    // Recording belongs with the outputs: it captures one of these windows.
    { id: "record", label: recording.recording ? "Stop recording" : "Record the output to a file",
      icon: <AetherIcon name={recording.recording ? "status-error" : "play"} />, separatorBefore: true,
      onClick: () => (recording.recording ? stopRecording() : void startRecording(showName)) },
    { id: "properties", label: "Properties", icon: <AetherIcon name="settings" />, disabled: !selected,
      onClick: () => selected && onSelect(selected.id) },
    { id: "open", label: selected && displays[selected.id] ? "Show output window" : "Open output window",
      icon: <AetherIcon name="window" />, disabled: !selected,
      onClick: () => selected && onOpen(selected.id) },
    { id: "close", label: "Close output window", icon: <AetherIcon name="close" />, disabled: !selected || !displays[selected.id],
      onClick: () => selected && onClose(selected.id) },
    { id: "rename", label: "Rename output", icon: <AetherIcon name="notes" />, disabled: !selected, shortcut: "F2",
      onClick: () => setRenamingID(selectedID) },
    { id: "delete", label: "Delete output", icon: <AetherIcon name="delete" />,
      disabled: !selected, shortcut: "Delete",
      onClick: () => selectedID && onDelete(selectedID) },
  ];
  return <TreePanel ariaLabel="Outputs" rootInset={0} nodes={nodes}
    selectedIDs={new Set(selectedID ? [selectedID] : [])}
    onSelect={(ids) => { const id = ids.at(-1); if (id) onSelect(id); }}
    onActivate={onOpen}
    controls={controls} controlsLabel="Output controls" menuLabel="Output options" menuItems={menuItems}
    onCommand={command} onAction={command}
    renamingID={renamingID} onCancelRename={() => setRenamingID(null)}
    onRename={(id, name) => { onPatch(id, { name }); setRenamingID(null); }} />;
}
