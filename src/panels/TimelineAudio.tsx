import { useTimelineAudioEngine } from '../live/TimelineAudioContext';
import type { TrackEQ } from '../live/timeline-audio-engine';
import './TimelineAudio.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@aether/ui';
import type { MapShow } from '../document';
import { timelineAudio } from '../timeline-audio';
import { useVideoSync } from '../video-sync';

/** Live output windows stay silent: the editing host owns the one soundtrack. */
export function TimelineAudio({ show, timeS, playing, urls }: { show: MapShow; timeS: number; playing: boolean; urls: Record<string, string> }) {
  const engine = useTimelineAudioEngine();
  const [blocked, setBlocked] = useState(false);
  const onBlocked = useCallback(() => setBlocked(true), []);
  const host = useRef<HTMLDivElement>(null);
  return <div ref={host} className="map-timeline-audio">
    {timelineAudio(show, timeS).map(voice => <Voice key={voice.id} {...voice} url={urls[voice.mediaID]} playing={playing} onBlocked={onBlocked} />)}
    {blocked && playing && <Button onClick={() => { const voices = Array.from(host.current?.querySelectorAll('audio') ?? []); void Promise.all([engine?.resume(), ...voices.map(v => v.play())]).then(() => setBlocked(false)).catch(() => setBlocked(true)); }}>Enable soundtrack audio</Button>}
  </div>;
}
function Voice({ url, volume, timeS, playing, onBlocked, trackID, eq }: { trackID: string; eq?: TrackEQ; url?: string; volume: number; timeS: number; playing: boolean; onBlocked: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const engine = useTimelineAudioEngine();
  useEffect(() => {
    if (!ref.current || !engine) return;
    try { return engine.connect(ref.current, trackID); }
    catch { onBlocked(); }
  }, [engine, trackID, onBlocked]);
  useEffect(() => { engine?.configure(trackID, eq); }, [engine, trackID, eq]);
  useEffect(() => { if (playing) void engine?.resume().catch(onBlocked); }, [engine, playing, onBlocked]);
  useVideoSync(ref, timeS, playing, false, url, onBlocked);
  useEffect(() => { if (ref.current) ref.current.volume = volume; }, [volume]);
  useEffect(() => { const audio = ref.current; return () => audio?.pause(); }, []);
  return <audio ref={ref} src={url} preload="auto" data-timeline-audio />;
}
