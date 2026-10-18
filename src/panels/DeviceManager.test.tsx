// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DeviceManager } from './DeviceManager';
import { devices, androidReceiverAvailable, type MapDevice } from '../api';
import { mirrorDevice } from '../live-cast';
const store = vi.hoisted(() => ({
  list: [{ id: 'pi', name: 'Porch', mine: true, claimed: true, document: null, seen: 0 }] as MapDevice[],
  nowS: 0, error: '', setError: vi.fn(), refresh: vi.fn(), online: () => true,
}));
vi.mock('../use-map-devices', () => ({ useMapDevices: () => store, ago: () => '' }));
vi.mock('../api', () => ({ hosted: true, androidReceiverAvailable: vi.fn(), androidReceiverDownloadURL: () => '/api/map/aether-map-receiver.apk', installerDownloadURL: () => '/installer', devices: { claim: vi.fn(), assign: vi.fn(), forget: vi.fn(), rename: vi.fn() } }));
vi.mock('../live-cast', () => ({ mirrorDevice: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(androidReceiverAvailable).mockResolvedValue(false); store.list = [{ id: 'pi', name: 'Porch', mine: true, claimed: true, document: null, seen: 0 }]; store.refresh.mockResolvedValue(undefined); });
afterEach(cleanup);
const mount = () => render(<DeviceManager documentID={null} dirty={false} installerURL="https://studio.test/api/map/install.sh" />);

it('keeps a failed pairing visible and preserves its code for correction', async () => {
  vi.mocked(devices.claim).mockRejectedValueOnce(new Error('Code expired. Use the new code on the player.')).mockResolvedValue({ device_id: 'pi' });
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Pair a device' }));
  const input = screen.getByRole('textbox', { name: 'Pairing code' });
  expect((screen.getByRole('button', { name: 'Pair' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(input, { target: { value: '12345x' } });
  expect((input as HTMLInputElement).value).toBe('12345');
  fireEvent.change(input, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pair' }));
  await screen.findByRole('alert'); expect(screen.getByRole('alert').textContent).toContain('expired');
  expect((input as HTMLInputElement).value).toBe('123456');
  fireEvent.change(input, { target: { value: '654321' } }); fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pair a device' })).toBeNull());
  expect(devices.claim).toHaveBeenNthCalledWith(2, '654321'); expect(store.refresh).toHaveBeenCalledOnce();
});
it('reports actual video measurements and limitation guidance and stops on demand', async () => {
  let signal!: AbortSignal;
  vi.mocked(mirrorDevice).mockImplementation((_id, stop, status, diagnostics) => {
    signal = stop; status('Mirroring');
    diagnostics?.({ audio: false, width: 1920, height: 1080, fps: 29.7, videoMbps: 4.2, roundTripMs: 21, limitation: 'bandwidth' });
    return new Promise(resolve => stop.addEventListener('abort', () => resolve(), { once: true }));
  });
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Mirror live' }));
  expect(screen.getByLabelText('Live connection details').textContent).toContain('1920 × 1080 · 30 fps · 4.20 Mbps video · 21 ms network round trip');
  expect(screen.getByText(/Network bandwidth is limiting/)).toBeTruthy();
  expect(screen.getByText(/Video only/)).toBeTruthy();
  expect(screen.getByText(/does not include rendering/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Stop mirroring' })); expect(signal.aborted).toBe(true);
  await waitFor(() => expect(screen.queryByLabelText('Live connection details')).toBeNull());
});
it('cancels sharing when the Players panel unmounts', async () => {
  let signal!: AbortSignal;
  vi.mocked(mirrorDevice).mockImplementation((_id, stop) => {
    signal = stop; return new Promise(resolve => stop.addEventListener('abort', () => resolve(), { once: true }));
  });
  const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Mirror live' })); view.unmount();
  expect(signal.aborted).toBe(true);
});

it('offers live mirroring without offline deployment on a TV receiver', () => {
  store.list[0].kind = 'live_receiver';
  render(<DeviceManager documentID="saved" dirty={false} installerURL="https://studio.test/api/map/install.sh" />);
  expect(screen.getByRole('button', { name: 'Mirror live' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Deploy this show' })).toBeNull();
  expect(screen.getByText(/live receiver/)).toBeTruthy();
  expect(screen.getByText(/Saved shows require/)).toBeTruthy();
});

it('offers a TV installer only when the host has the verified artifact', async () => {
  vi.mocked(androidReceiverAvailable).mockResolvedValue(true);
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Set up a new one' }));
  expect(await screen.findByRole('button', { name: 'Download TV receiver' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Android TV receiver setup' }).textContent).toContain('HTTPS');
});
it('keeps a legacy Pi-only host free of an unavailable TV download', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Set up a new one' }));
  await waitFor(() => expect(androidReceiverAvailable).toHaveBeenCalledOnce());
  expect(screen.queryByRole('button', { name: 'Download TV receiver' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Download projector installer' })).toBeTruthy();
});
