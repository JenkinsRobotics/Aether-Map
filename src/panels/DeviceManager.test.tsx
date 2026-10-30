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
vi.mock('../api', () => ({ hosted: true, library: { shows: vi.fn(async () => [{ id: 'cube', name: 'Cube demo.aethermap' }]) }, androidReceiverAvailable: vi.fn(), androidReceiverDownloadURL: () => '/api/map/aether-map-receiver.apk', installerDownloadURL: () => '/installer', devices: { claim: vi.fn(), assign: vi.fn(), forget: vi.fn(), rename: vi.fn(), command: vi.fn() } }));
vi.mock('../live-cast', () => ({ mirrorDevice: vi.fn() }));
vi.mock('../deploy-to-player', () => ({ deploySavedShow: vi.fn(async () => ['The show plays once and holds its last moment.']) }));
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

it('casts into the show on a standalone player, but only mirrors to a TV receiver', async () => {
  vi.mocked(mirrorDevice).mockImplementation((_id, stop, status) => {
    status('Mirroring'); return new Promise(resolve => stop.addEventListener('abort', () => resolve(), { once: true }));
  });
  const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Cast into show' }));
  expect(vi.mocked(mirrorDevice).mock.calls[0][4]).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Cast surfaces');
  fireEvent.click(screen.getByRole('button', { name: 'Stop casting' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cast into show' })).toBeTruthy());
  view.unmount(); store.list[0].kind = 'live_receiver'; mount();
  expect(screen.queryByRole('button', { name: 'Cast into show' })).toBeNull();
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

it('a server with its own HTTPS authority pins it before installing', async () => {
  const { bootstrapCommand } = await import('./DeviceManager');
  expect(bootstrapCommand('http://localhost:8780/api/map/install.sh', null)).toBe('curl -sSL http://localhost:8780/api/map/install.sh | bash');
  const pinned = bootstrapCommand('https://aetherstudio.local:8443/api/map/install.sh', 'ab'.repeat(32));
  expect(pinned).toContain('curl -sk https://aetherstudio.local:8443/api/network/ca.pem -o aether-ca.pem');
  expect(pinned).toContain(`echo "${'ab'.repeat(32)}  aether-ca.pem" | sha256sum -c`);
  expect(pinned).toContain('curl --cacert aether-ca.pem -sSL https://aetherstudio.local:8443/api/map/install.sh | bash');
});

const status = { player_version: 'abc123def456', app_release: 'release-1', show: { id: 'saved', revision: 4 }, uptime_s: 7200,
  system_uptime_s: 90000, disk_free_mb: 12000, temperature_c: 52.4, model: 'Raspberry Pi 5 Model B', os: 'Debian GNU/Linux 12',
  hostname: 'porch-pi', address: '10.0.0.5', permissions: { keep_display_awake: true, play_audio: true, allow_updates: true },
  last_error: '2026-10-27 12:00:00 /api/map/media/a.png failed (timed out)', update_pending: false };
const withStatus = (extra: Partial<MapDevice> = {}) => { store.list = [{ ...store.list[0], status, ...extra }]; vi.mocked(devices.command).mockResolvedValue({ id: 'c1' }); };

it('keeps remote controls off a host that does not report device status', () => {
  mount();
  expect(screen.queryByRole('button', { name: 'Restart player' })).toBeNull();
});
it('shows what a remote player reports and sends it commands', async () => {
  withStatus(); mount();
  const details = screen.getByLabelText('Porch details').textContent!;
  for (const text of ['Player abc123', '10.0.0.5', '52 °C', 'up 2 h', 'Raspberry Pi 5 Model B']) expect(details).toContain(text);
  expect(screen.getByText(/a\.png failed/)).toBeTruthy();
  for (const [name, type] of [['Identify', 'identify'], ['Sync now', 'sync'], ['Update player', 'update'], ['Restart player', 'restart']] as const) {
    fireEvent.click(screen.getByRole('button', { name }));
    await waitFor(() => expect(devices.command).toHaveBeenLastCalledWith('pi', type, type === 'identify' ? { seconds: 20 } : {}));
  }
  expect(store.refresh).toHaveBeenCalled();
});
it('asks before rebooting a remote player', async () => {
  withStatus(); mount();
  fireEvent.click(screen.getByRole('button', { name: 'Reboot' }));
  expect(devices.command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reboot Porch' }));
  await waitFor(() => expect(devices.command).toHaveBeenCalledWith('pi', 'reboot', {}));
});
it('shows the result of the latest command, including logs', async () => {
  withStatus({ commands: [{ id: 'c2', type: 'logs', state: 'done', ok: true, detail: 'line one\nline two', created: 1 }] });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Logs' }));
  await waitFor(() => expect(devices.command).toHaveBeenCalledWith('pi', 'logs', { lines: 100 }));
  expect(screen.getByRole('dialog', { name: 'Porch logs' }).textContent).toContain('line two');
  cleanup();
  withStatus({ commands: [{ id: 'c3', type: 'set_server', state: 'done', ok: false, detail: 'could not reach https://x', created: 2 }] });
  mount();
  expect(screen.getByRole('status', { name: 'Porch last command' }).textContent).toContain('could not reach');
});
it('changes Wi-Fi, host and permissions from the network', async () => {
  withStatus(); mount();
  fireEvent.click(screen.getByRole('button', { name: 'Device settings' }));
  const dialog = screen.getByRole('dialog', { name: 'Porch settings' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Wi-Fi network' }), { target: { value: 'Venue' } });
  fireEvent.change(screen.getByLabelText('Wi-Fi password'), { target: { value: 'correct horse' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save network' }));
  await waitFor(() => expect(devices.command).toHaveBeenCalledWith('pi', 'add_wifi', { ssid: 'Venue', password: 'correct horse' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Host address' }), { target: { value: 'studio.example:8780' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use this host' }));
  await waitFor(() => expect(devices.command).toHaveBeenCalledWith('pi', 'set_server', { url: 'studio.example:8780' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Play audio' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }));
  await waitFor(() => expect(devices.command).toHaveBeenCalledWith('pi', 'set_permissions', { keep_display_awake: true, play_audio: false, allow_updates: true }));
  expect(dialog).toBeTruthy();
});

it('deploys a saved show from the Players page and names what each player runs', async () => {
  const { deploySavedShow } = await import('../deploy-to-player');
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Deploy a show…' }));
  await waitFor(() => expect((screen.getByLabelText('Show to deploy') as HTMLSelectElement).value).toBe('cube'));
  fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));
  await waitFor(() => expect(deploySavedShow).toHaveBeenCalledWith('cube', 'pi', 'Porch'));
  expect(await screen.findByText('The show plays once and holds its last moment.')).toBeTruthy();
  store.list = [{ ...store.list[0], document: 'cube' }];
  cleanup(); mount();
  expect(await screen.findByText(/playing Cube demo/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open show' })).toBeTruthy();
});
