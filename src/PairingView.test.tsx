// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PairingView } from './PairingView';
import { devices } from './api';
import { pairingRoute, pairingSignInURL } from './pairing-route';
vi.mock('./api', () => ({ hosted: true, devices: { claim: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); history.replaceState(null, '', '/map/index.html?pair=123456'); });
afterEach(() => { cleanup(); history.replaceState(null, '', '/'); });
it('prefills a scanned code but claims only after an explicit submit', async () => {
  vi.mocked(devices.claim).mockResolvedValue({ device_id: 'pi' });
  render(<PairingView />); expect((screen.getByRole('textbox', { name: 'Pairing code' }) as HTMLInputElement).value).toBe('123456');
  expect(devices.claim).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Pair' }));
  await screen.findByRole('heading', { name: 'Player paired' });
  expect(devices.claim).toHaveBeenCalledExactlyOnceWith('123456');
  expect(location.search).toBe('?paired=1'); expect(screen.getByRole('button', { name: 'Open Players' })).toBeTruthy();
});
it('retains expired-code errors and accepts the replacement shown on the player', async () => {
  vi.mocked(devices.claim).mockRejectedValueOnce(new Error('That code expired.')).mockResolvedValue({ device_id: 'pi' });
  render(<PairingView />); fireEvent.click(screen.getByRole('button', { name: 'Pair' }));
  await screen.findByRole('alert'); const input = screen.getByRole('textbox', { name: 'Pairing code' });
  expect((input as HTMLInputElement).value).toBe('123456');
  fireEvent.change(input, { target: { value: '987654' } }); fireEvent.submit(input.closest('form')!);
  await screen.findByRole('heading', { name: 'Player paired' });
  expect(devices.claim).toHaveBeenLastCalledWith('987654');
});
it('offers same-host sign-in when the session has expired', async () => {
  vi.mocked(devices.claim).mockRejectedValue({ status: 401, message: 'Sign in again.' });
  render(<PairingView />); fireEvent.click(screen.getByRole('button', { name: 'Pair' }));
  const link = await screen.findByRole('link', { name: 'Sign in to pair this player' });
  expect(link.getAttribute('href')).toBe('/?next=%2Fmap%2Findex.html%3Fpair%3D123456');
  expect(location.search).toBe('?pair=123456');
});
it('does not submit malformed or duplicate query codes and ignores redirect parameters', async () => {
  history.replaceState(null, '', '/map/index.html?pair=123456&pair=654321&next=https://evil.test');
  render(<PairingView />); expect(screen.getByRole('alert').textContent).toContain('invalid code');
  expect((screen.getByRole('button', { name: 'Pair' }) as HTMLButtonElement).disabled).toBe(true);
  expect(devices.claim).not.toHaveBeenCalled();
});
it('prevents repeated submits while the claim is pending', async () => {
  let resolve!: (result: { device_id: string }) => void;
  vi.mocked(devices.claim).mockReturnValue(new Promise(finish => { resolve = finish; }));
  render(<PairingView />); const form = screen.getByRole('textbox', { name: 'Pairing code' }).closest('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(devices.claim).toHaveBeenCalledOnce(); expect((screen.getByRole('button', { name: 'Pairing…' }) as HTMLButtonElement).disabled).toBe(true);
  resolve({ device_id: 'pi' }); await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Player paired'));
});
describe('bounded pairing routes', () => {
  it.each(['', '?pair=', '?pair=12345', '?pair=１２３４５６', '?pair=<script>', '?pair=1234567', '?pair=123456&pair=123456'])('rejects ambiguous/invalid codes %s', search => {
    expect(pairingRoute(search).code).toBe('');
  });
  it('has no general redirect input', () => {
    expect(pairingRoute('?pair=123456&next=//evil.test')).toEqual({ requested: true, code: '123456', invalid: false });
    expect(pairingSignInURL('//evil.test')).toBe('/?next=%2Fmap%2Findex.html%3Fpair%3D');
  });
});
