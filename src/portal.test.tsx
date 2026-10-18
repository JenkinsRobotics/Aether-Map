// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PortalView } from './portal';
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => { history.replaceState(null, '', '/index.html?portal'); fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); history.replaceState(null, '', '/'); });
it('reads only local public daemon status and shows its rotating QR image', async () => {
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ code: '001234', claimed: false, pairingUrl: 'https://studio.local/map/index.html?pair=001234' }) });
  render(<PortalView />);
  expect((await screen.findByRole('img', { name: 'Scan to pair this player' })).getAttribute('src')).toBe('/pairing.svg?code=001234');
  expect(fetcher).toHaveBeenCalledWith('/player-status', expect.objectContaining({ credentials: 'omit', cache: 'no-store' }));
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('announce'))).toBe(false);
});
it('never registers a device from the hosted browser page', async () => {
  history.replaceState(null, '', '/map/index.html?portal'); render(<PortalView />);
  expect(await screen.findByRole('alert')).toBeTruthy(); expect(fetcher).not.toHaveBeenCalled();
});
it('hides pairing details after the daemon reports a claimed player', async () => {
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ code: '001234', claimed: true, pairingUrl: '' }) });
  render(<PortalView />); await screen.findByRole('heading', { name: 'Ready' });
  expect(screen.queryByRole('img')).toBeNull(); expect(screen.queryByText('001234')).toBeNull();
});
