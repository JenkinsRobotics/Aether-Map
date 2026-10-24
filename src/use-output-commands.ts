import { useCallback } from "react";
import { findOutput, newOutput, type MapShow, type ShowOutput } from "./document";
import type { DisplayInfo } from "./screens";
import type { OutputDisplay, WirelessKind } from "./output-session";

/**
 * Every command that acts on the show's outputs.
 *
 * Opening a window is session state and closing one is too, so those arrive as
 * dependencies rather than living here; everything else is a plain edit to the
 * output list. Separated from `App` for the same reason the scene commands
 * were: this is a closed set with one subject.
 */
export interface OutputCommandDeps {
  show: MapShow;
  edit: (next: MapShow | ((current: MapShow) => MapShow), coalesceKey?: string) => void;
  selectedID: string | null;
  onSelect: (id: string | null) => void;
  displays: Record<string, OutputDisplay>;
  openOutput: (outputID: string, display?: DisplayInfo) => void;
  openWirelessOutput: (outputID: string, kind: WirelessKind) => void;
  closeOutput: (outputID: string) => void;
  /** An edge output has no window here; opening it means deploying. */
  onManageDevices: () => void;
}

export function useOutputCommands(deps: OutputCommandDeps) {
  const { show, edit, selectedID, onSelect, openOutput, openWirelessOutput, closeOutput, onManageDevices } = deps;
  const selectedOutput = findOutput(show, selectedID);
  const deviceSize = (selectedOutput && deps.displays[selectedOutput.id]) ?? null;

  const patchOutput = useCallback((id: string, patch: Partial<ShowOutput>) =>
    edit((current) => ({ ...current, outputs: current.outputs.map((output) =>
      output.id === id ? { ...output, ...patch } : output) }), "output-" + id), [edit]);

  // Born bound to the scene being edited. An output renders only what it is
  // linked to, so one created unbound would be a projector that arrives dark —
  // a puzzle to solve rather than an output you just added.
  const addOutput = useCallback(() => {
    const created = newOutput(`Output ${show.outputs.length + 1}`, show.activeSceneId);
    edit((current) => ({ ...current, outputs: [...current.outputs, created] }));
    onSelect(created.id);
  }, [edit, show.outputs.length, show.activeSceneId, onSelect]);

  const deleteOutput = useCallback((id: string) => {
    if (!show.outputs.some(output => output.id === id)) return;
    closeOutput(id);
    edit((current) => ({ ...current, outputs: current.outputs.filter((output) => output.id !== id) }));
    if (selectedID === id) onSelect(null);
  }, [edit, closeOutput, show.outputs, selectedID, onSelect]);

  const openOutputWindow = useCallback((id: string) => {
    const output = show.outputs.find((entry) => entry.id === id);
    if (!output) return;
    onSelect(id);
    // An edge output has no window here: its player runs the show on the
    // projector, and "open" means deploy.
    if (output.kind === "edge") { onManageDevices(); return; }
    if (output.kind === "monitor") openOutput(id);
    else openWirelessOutput(id, output.kind);
  }, [show.outputs, openOutput, openWirelessOutput, onSelect, onManageDevices]);

  return { selectedOutput, deviceSize, patchOutput, addOutput, deleteOutput, openOutputWindow };
}
