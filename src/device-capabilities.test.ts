import { expect, it } from 'vitest';
import { canDeployToDevice } from './device-capabilities';
import type { MapDevice } from './api';
it('keeps legacy Pi deployments compatible and refuses live or unknown device kinds', () => {
  const device = { id: 'tv', kind: undefined } as MapDevice;
  expect(canDeployToDevice(device)).toBe(true);
  expect(canDeployToDevice({ ...device, kind: 'player' })).toBe(true);
  expect(canDeployToDevice({ ...device, kind: 'live_receiver' })).toBe(false);
  expect(canDeployToDevice({ ...device, kind: 'future' } as unknown as MapDevice)).toBe(false);
});
