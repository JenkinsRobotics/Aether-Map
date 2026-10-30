import { newOutput, type MapShow } from './document';
import { devices, library, fromBase64 } from './api';
import { parseShow, serializeShow } from './show-file';
import { deploymentReadiness } from './deployment-readiness';

/** A show deployed from the Players page plays its active scene on that player
 * unless it already names an output for it. */
export function routeToPlayer(show: MapShow, deviceID: string, deviceName: string): MapShow {
  if (show.outputs.some(o => o.kind === 'edge' && o.deviceId === deviceID)) return show;
  return { ...show, outputs: [...show.outputs, { ...newOutput(deviceName, show.activeSceneId, 'edge'), deviceId: deviceID }] };
}

/** Deploy a saved show without opening it: add the player's output when it has
 * none (a new saved revision, like an editor save), then assign it. */
export async function deploySavedShow(fileID: string, deviceID: string, deviceName: string): Promise<string[]> {
  const file = await library.read(fileID);
  const show = parseShow(fromBase64(file.data_base64 ?? ''));
  const routed = routeToPlayer(show, deviceID, deviceName);
  const { blockers, notes } = deploymentReadiness(routed, deviceID);
  if (blockers.length) throw new Error(blockers.join(' '));
  if (routed !== show) await library.save(file.id, file.revision, serializeShow(routed));
  await devices.assign(deviceID, file.id);
  return notes;
}
