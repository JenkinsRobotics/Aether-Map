import { useSyncExternalStore } from 'react';
import type { MapShow } from '../document';
import { parseShow, serializeShow } from '../show-file';
import { mirrorDevice, type CastStatus } from '../live-cast';

/** One player shows the open show live while it is edited. The session lives
 * here, not in the Devices dialog, so editing with the dialog closed keeps it. */
type LiveEdit = { deviceID: string; status: CastStatus; error: string };
let state: LiveEdit | null = null, controller: AbortController | null = null, text = '';
const watchers = new Set<() => void>(), edits = new Set<() => void>();
const set = (next: LiveEdit | null) => { state = next; watchers.forEach(fn => fn()); };
const encode = (show: MapShow) => new TextDecoder().decode(serializeShow(show));

export const liveEditState = () => state;
export function useLiveEdit() {
  return useSyncExternalStore(fn => { watchers.add(fn); return () => { watchers.delete(fn); }; }, liveEditState);
}
/** Called with every editor show; costs nothing while no player is live. */
export function publishLiveShow(show: MapShow) {
  if (!controller) return;
  text = encode(show);
  edits.forEach(fn => fn());
}
export function startLiveEdit(deviceID: string, show: MapShow) {
  stopLiveEdit();
  const mine = new AbortController(); controller = mine; text = encode(show);
  set({ deviceID, status: 'Connecting', error: '' });
  void mirrorDevice(deviceID, mine.signal, status => { if (controller === mine) set({ deviceID, status, error: '' }); }, undefined, false,
    { current: () => text, subscribe: fn => { edits.add(fn); return () => { edits.delete(fn); }; } })
    .then(() => { if (controller === mine) { controller = null; set(null); } },
      problem => { if (controller === mine) { controller = null; set({ deviceID, status: 'Connecting', error: (problem as Error).message }); } });
}
export function stopLiveEdit() {
  const current = controller; controller = null; edits.clear();
  current?.abort();
  if (current || state) set(null);
}

/** The kiosk relays `{aetherLiveShow}`: show text while live, null when it ends.
 * Anything else, or text that is not a show, is not for us. */
export function liveShowMessage(data: unknown): MapShow | null | undefined {
  if (!data || typeof data !== 'object' || !('aetherLiveShow' in data)) return undefined;
  const value = (data as { aetherLiveShow: unknown }).aetherLiveShow;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  try { return parseShow(value); } catch { return undefined; }
}
