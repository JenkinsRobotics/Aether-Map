// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AutosaveSession, readRecovery, recoveryKey, SaveError } from '@aether/session/autosave';
const sessions: AutosaveSession<number>[] = [];
beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { sessions.forEach(s => s.dispose()); sessions.length = 0; vi.restoreAllMocks(); vi.useRealTimers(); });
function make(save: (text: string, base: number) => Promise<number>) {
  const s = new AutosaveSession({ key: 'draft', base: 0, text: 'initial', save }); sessions.push(s); return s;
}
it('protects edits synchronously before the autosave delay or a refresh', async () => {
  const save = vi.fn(async (_text: string, base: number) => base + 1);
  const s = make(save); s.write('edited');
  expect(save).not.toHaveBeenCalled(); expect(readRecovery('draft')).toEqual({ text: 'edited', base: 0 });
  s.dispose(); const restored = make(save); restored.recover(readRecovery<number>('draft')!);
  await vi.advanceTimersByTimeAsync(1200);
  expect(save).toHaveBeenCalledWith('edited', 0); expect(restored.dirty).toBe(false); expect(readRecovery('draft')).toBeNull();
});
it('protects navigation when browser storage is full until the server confirms the save', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  const s = make(async (_text, base) => base + 1); s.write('irreplaceable edit');
  expect(s.state.durable).toBe(false);
  const beforeSave = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(beforeSave);
  expect(beforeSave.defaultPrevented).toBe(true);
  await s.flush();
  const afterSave = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(afterSave);
  expect(afterSave.defaultPrevented).toBe(false); expect(s.state.phase).toBe('saved');
});
it('retains a newer edit and rebases its recovery revision when an older save completes', async () => {
  let resolve!: (n: number) => void;
  const save = vi.fn((_text: string, _base: number) => new Promise<number>(r => { resolve = r; }));
  const s = make(save); s.write('A'); const pending = s.flush();
  s.write('B'); resolve(1); await pending;
  expect(s.dirty).toBe(true); expect(readRecovery('draft')).toEqual({ text: 'B', base: 1 });
  const second = s.flush(); expect(save).toHaveBeenLastCalledWith('B', 1); resolve(2); await second;
  expect(s.state.phase).toBe('saved'); expect(s.dirty).toBe(false);
});
it('serializes manual and automatic saves and retries a network failure without losing the draft', async () => {
  const save = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(1);
  const s = make(save); s.write('work'); await expect(s.flush()).rejects.toThrow('offline');
  expect(s.state.phase).toBe('offline'); expect(readRecovery('draft')?.text).toBe('work');
  await vi.advanceTimersByTimeAsync(5000); expect(save).toHaveBeenCalledTimes(2); expect(s.dirty).toBe(false);
});
it('never retries a revision conflict or clears that draft when more edits arrive', async () => {
  const save = vi.fn().mockRejectedValue(new SaveError('changed elsewhere', 409));
  const s = make(save); s.write('mine'); await expect(s.flush()).rejects.toThrow();
  s.write('more edits'); await vi.advanceTimersByTimeAsync(12000);
  expect(save).toHaveBeenCalledTimes(1); expect(readRecovery('draft')).toEqual({ text: 'more edits', base: 0, blocked: 'changed elsewhere', blockedStatus: 409 });
  s.dispose();
  const reopened = make(save); reopened.recover(readRecovery<number>('draft')!);
  await vi.advanceTimersByTimeAsync(12000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(reopened.state.phase).toBe('conflict');
  expect(s.state.phase).toBe('conflict');
});
it('keeps a feature draft local until accepted, and saves the reverted state on discard', async () => {
  const save = vi.fn(async (_text: string, base: number) => base + 1);
  const s = make(save); s.pause(true); s.write('feature preview'); await vi.advanceTimersByTimeAsync(3000);
  expect(save).not.toHaveBeenCalled(); expect(readRecovery('draft')?.text).toBe('feature preview');
  s.write('initial'); s.pause(false); await vi.advanceTimersByTimeAsync(1200);
  expect(save).toHaveBeenCalledWith('initial', 0);
});
it('separates accounts and documents and retains a new file edit after assigning its server ID', async () => {
  expect(recoveryKey('map', 'one', 'file')).not.toBe(recoveryKey('map', 'two', 'file'));
  let resolve!: (n: number) => void;
  const s = new AutosaveSession({ key: 'untitled', base: 0, keyForBase: b => `file-${b}`, save: () => new Promise<number>(r => { resolve = r; }) });
  sessions.push(s); s.write('A'); const pending = s.flush(); s.write('B'); resolve(1); await pending;
  expect(readRecovery('untitled')).toBeNull(); expect(readRecovery('file-1')).toEqual({ text: 'B', base: 1 });
});
