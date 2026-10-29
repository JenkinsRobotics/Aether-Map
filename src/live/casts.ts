import { useEffect, useSyncExternalStore } from "react";

/** One cast per player: every Cast surface shows the same stream. The Pi's
 * kiosk hands it over through `window.aetherCast`; this Mac sets it while casting. */
let current: MediaStream | null = null, surfaces = 0;
const listeners = new Set<() => void>();
export function setCastStream(stream: MediaStream | null) {
  current = stream;
  for (const fn of listeners) fn();
}
export function useCastStream() {
  useEffect(() => { surfaces++; return () => { surfaces--; }; }, []);
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => current);
}
/** False when nothing on screen would show it, so the kiosk plays it full screen.
 * ponytail: counts surfaces in the visible scene only; a cast surface in another
 * scene is not reached until the player is cast to again. */
(window as unknown as { aetherCast?: (stream: MediaStream | null) => boolean }).aetherCast = stream => {
  setCastStream(stream); return surfaces > 0;
};
