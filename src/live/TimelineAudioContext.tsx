import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { TimelineAudioEngine } from './timeline-audio-engine';

const Context = createContext<TimelineAudioEngine | null>(null);
export function TimelineAudioProvider({ children }: { children: ReactNode }) {
  const [engine] = useState(() => new TimelineAudioEngine());
  const disposal = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(disposal.current);
    // React StrictMode immediately reattaches effects; keep its existing sources.
    return () => { disposal.current = setTimeout(() => engine.dispose(), 0); };
  }, [engine]);
  return <Context.Provider value={engine}>{children}</Context.Provider>;
}
export function useTimelineAudioEngine() { return useContext(Context); }
const SILENT: Record<string, number> = {};
const subscribeSilent = () => () => {};
const silent = () => SILENT;
export function useTrackLevels() {
  const engine = useTimelineAudioEngine();
  return useSyncExternalStore(engine?.subscribe ?? subscribeSilent, engine?.snapshot ?? silent);
}
