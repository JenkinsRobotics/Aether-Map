import type { MapDevice } from './api';
/** Legacy hosts only registered Pi players. Unknown future kinds fail closed. */
export function canDeployToDevice(device: MapDevice): boolean {
  return device.kind === undefined || device.kind === 'player';
}
