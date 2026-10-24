// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { emptyShow } from './document';
import { normalizeDocument } from './normalize-document';
import { useDocumentHistory } from './history';
import { useMapAgent } from './use-map-agent';

it('uses the actual React undo history and reads committed state between sequential tool calls', async () => {
  const hook = renderHook(({ contextKey, writable }) => {
    const history = useDocumentHistory(() => normalizeDocument(emptyShow()));
    const interaction = useMapAgent({ contextKey, writable, available: true, show: history.present,
      selection: { surface_ids: [], clip_id: null, asset_id: null },
      canUndo: history.canUndo, canRedo: history.canRedo, commit: history.set, undo: history.undo, redo: history.redo });
    return { history, interaction };
  }, { initialProps: { contextKey: 'draft-session:Main', writable: true } });
  const initial = hook.result.current.history.present;
  const interaction = hook.result.current.interaction;
  const call = (name: string, args: Record<string, unknown> = {}) => interaction.execute({ id: crypto.randomUUID(), name: 'aether_map_' + name, arguments: args }, new AbortController().signal);
  await act(async () => {
    await call('surface_create', { scene_id: initial.activeSceneId, name: 'Wall' });
    // This uses the old interaction closure, as the polling chat does.
    expect(await call('show_inspect', { section: 'surfaces' })).toMatchObject({ total: 1, items: [{ name: 'Wall' }], can_undo: true });
    await call('undo');
  });
  expect(hook.result.current.history.present).toBe(initial);
  await act(async () => { await call('redo'); });
  expect(hook.result.current.history.present.scenes[0].surfaces[0].name).toBe('Wall');
  hook.rerender({ contextKey: 'draft-session:Main', writable: false });
  await expect(call('undo')).rejects.toThrow('read-only');
  hook.rerender({ contextKey: 'another-document:Main', writable: true });
  await expect(call('undo')).rejects.toThrow('changed');
});
