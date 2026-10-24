import { useCallback, useSyncExternalStore } from "react";
import { devices, hosted, type MapDevice } from "./api";

/** A device is considered present if it has checked in recently. */
const ONLINE_WINDOW_SECONDS = 60;
const POLL_MS = 10000;

interface DevicesState { list: MapDevice[]; nowS: number; error: string }

/**
 * The workspace's paired players, polled once for the whole app.
 *
 * Devices check in on their own schedule, so this polls rather than holding a
 * socket. It is a module store, not per-mount state: the Outputs tree, the
 * Output panel, the device manager and the canvas all read the same list, and
 * one timer serves them however many are mounted. Held per hook instead, each
 * consumer ran its own request every ten seconds and they could disagree about
 * what was online between ticks.
 */
let state: DevicesState = { list: [], nowS: Date.now() / 1000, error: "" };
const listeners = new Set<() => void>();
const publish = (next: DevicesState) => { state = next; for (const fn of listeners) fn(); };
const devicesState = () => state;

export async function refreshDevices(): Promise<void> {
  if (!hosted) return;
  try {
    publish({ list: await devices.list(), nowS: Date.now() / 1000, error: "" });
  } catch (problem) {
    publish({ ...state, error: (problem as Error).message });
  }
}

/** One timer for the app: it runs while anything is listening and stops after. */
let timer: ReturnType<typeof setInterval> | null = null;
function subscribeDevices(fn: () => void) {
  listeners.add(fn);
  if (timer === null) {
    void refreshDevices();
    timer = setInterval(() => void refreshDevices(), POLL_MS);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== null) { clearInterval(timer); timer = null; }
  };
}

export function useMapDevices() {
  const { list, nowS, error } = useSyncExternalStore(subscribeDevices, devicesState);
  const online = useCallback((device: MapDevice) => nowS - device.seen < ONLINE_WINDOW_SECONDS, [nowS]);
  // Kept for the device manager, which clears the banner after a failed pair.
  const setError = useCallback((message: string) => publish({ ...state, error: message }), []);
  return { list, nowS, error, setError, refresh: refreshDevices, online };
}

/** Test seam: drop the polled list so one spec cannot leak into the next. */
export function resetMapDevices() {
  if (timer !== null) { clearInterval(timer); timer = null; }
  publish({ list: [], nowS: Date.now() / 1000, error: "" });
}

export function ago(seconds: number, nowS: number): string {
  if (!seconds) return "never";
  const delta = Math.max(nowS - seconds, 0);
  if (delta < 90) return "moments ago";
  if (delta < 3600) return `${Math.round(delta / 60)} min ago`;
  if (delta < 86400) return `${Math.round(delta / 3600)} h ago`;
  return `${Math.round(delta / 86400)} d ago`;
}
