// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { emptyShow } from '../document';
import { parseShow } from '../show-file';
import type { LiveFeed } from '../live-cast';

const calls: { deviceID: string; feed: LiveFeed; signal: AbortSignal }[] = [];
vi.mock('../live-cast', () => ({
  mirrorDevice: vi.fn((deviceID: string, signal: AbortSignal, status: (s: string) => void, _d: unknown, _c: boolean, feed: LiveFeed) => {
    calls.push({ deviceID, feed, signal }); status('Mirroring');
    return new Promise<void>(resolve => signal.addEventListener('abort', () => resolve()));
  }),
}));
const { startLiveEdit, stopLiveEdit, publishLiveShow, liveEditState } = await import('./live-edit');
afterEach(() => { stopLiveEdit(); calls.length = 0; });

it('streams the editor show to one player until stopped', async () => {
  const show = emptyShow();
  startLiveEdit('pi', show);
  expect(liveEditState()).toMatchObject({ deviceID: 'pi', status: 'Mirroring' });
  const { feed, signal } = calls[0];
  expect(parseShow(feed.current()).scenes[0].id).toBe(show.scenes[0].id);
  const heard = vi.fn(); feed.subscribe(heard);
  publishLiveShow({ ...show, scenes: [{ ...show.scenes[0], name: 'Edited' }] });
  expect(heard).toHaveBeenCalledTimes(1);
  expect(parseShow(feed.current()).scenes[0].name).toBe('Edited');
  stopLiveEdit();
  expect(signal.aborted).toBe(true);
  await Promise.resolve(); await Promise.resolve();
  expect(liveEditState()).toBeNull();
});

it('replaces a live session on another player instead of running two', () => {
  startLiveEdit('pi', emptyShow());
  startLiveEdit('tv', emptyShow());
  expect(calls[0].signal.aborted).toBe(true);
  expect(liveEditState()?.deviceID).toBe('tv');
});

it('reads only well-formed live show messages', async () => {
  const { liveShowMessage } = await import('./live-edit');
  const text = new TextDecoder().decode((await import('../show-file')).serializeShow(emptyShow()));
  expect(liveShowMessage({ aetherLiveShow: text })?.scenes).toHaveLength(1);
  expect(liveShowMessage({ aetherLiveShow: null })).toBeNull();
  expect(liveShowMessage({ aetherLiveShow: '{broken' })).toBeUndefined();
  expect(liveShowMessage({ aetherHotkey: 'F1' })).toBeUndefined();
});
