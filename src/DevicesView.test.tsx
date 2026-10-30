// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DevicesView } from './DevicesView';
import type { MapDevice } from './api';
const store = vi.hoisted(() => ({
  list: [{ id: 'pi', name: 'raspberrypi2', mine: true, claimed: true, document: null, seen: 0 }] as MapDevice[],
  nowS: 0, error: '', setError: vi.fn(), refresh: vi.fn(), online: () => true,
}));
vi.mock('./use-map-devices', () => ({ useMapDevices: () => store, ago: () => '' }));
vi.mock('./api', () => ({ library: { shows: async () => [] }, hosted: true, installerURL: () => 'https://studio.test/api/map/install.sh', androidReceiverAvailable: vi.fn().mockResolvedValue(false), androidReceiverDownloadURL: () => '', installerDownloadURL: () => '', devices: {} }));
afterEach(cleanup);

it('lists paired players on their own page, without an open show', () => {
  render(<DevicesView />);
  expect(screen.getByRole('heading', { name: 'Players' })).toBeTruthy();
  expect(screen.getByText('raspberrypi2')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pair a device' })).toBeTruthy();
  expect(document.title).toBe('Aether Map — Players');
});
