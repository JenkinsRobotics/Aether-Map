import type { ShowOutput } from "./document";
import type { OutputDisplay } from "./output-session";
import { canDeployToDevice } from './device-capabilities';
import type { MapDevice } from "./api";

export interface OutputConnection { live: boolean; label: string }

/**
 * Is this output actually reaching something right now? A window output is
 * connected while its window is open; an edge output while its paired player is
 * checked in *and* playing this show — an online player showing something else
 * is not this output's picture. Either way the row says so with the same link
 * icon, so "configured" never reads as "live".
 */
export function outputConnection(
  output: ShowOutput,
  window_: OutputDisplay | undefined,
  device: MapDevice | undefined,
  online: (device: MapDevice) => boolean,
  documentID: string | null,
): OutputConnection | null {
  if (output.kind === "edge") {
    if (!device) return null;
    if (!canDeployToDevice(device)) return { live: false, label: `${device.name} receives live mirroring only; choose a standalone player for this output` };
    if (!online(device)) return { live: false, label: `${device.name} is offline` };
    return !!documentID && device.document === documentID
      ? { live: true, label: `Connected · ${device.name} is playing this show` }
      : { live: false, label: `${device.name} is online but not playing this show` };
  }
  return window_
    ? { live: true, label: `Connected · ${window_.width} × ${window_.height}${window_.fullscreen ? " · fullscreen" : ""}` }
    : { live: false, label: "No output window open" };
}

/**
 * What kind of thing an output plays on. One table keeps the Outputs tree and
 * Output panel from inventing different words for the same four kinds.
 */
export const OUTPUT_KIND_LABEL = {
  monitor: "Output window", cast: "Cast", airplay: "AirPlay", edge: "Edge device",
} as const;

/** The device an output plays on, named: the paired player, or the kind. */
export function outputDeviceName(output: ShowOutput, device: MapDevice | undefined): string {
  return output.kind === "edge" ? device?.name ?? "No device chosen" : OUTPUT_KIND_LABEL[output.kind];
}

export interface SceneOutput {
  output: ShowOutput;
  /** Device name retained for output status/detail surfaces. */
  device: string;
  connection: OutputConnection | null;
}

/**
 * The outputs aimed at one scene, so the canvas can mark an artboard with what
 * is projecting it. An output bound to the scene but not reaching anything is
 * included and reads as not live: it is still aimed here, and an operator
 * setting a show up needs to see the aim before the projector is plugged in.
 */
export function sceneOutputs(
  outputs: ShowOutput[],
  sceneID: string,
  displays: Record<string, OutputDisplay>,
  deviceList: MapDevice[],
  online: (device: MapDevice) => boolean,
  documentID: string | null,
): SceneOutput[] {
  return outputs.filter((output) => output.sceneId === sceneID).map((output) => {
    const device = deviceList.find((entry) => entry.id === output.deviceId);
    return {
      output,
      device: outputDeviceName(output, device),
      connection: outputConnection(output, displays[output.id], device, online, documentID),
    };
  });
}
