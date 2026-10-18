import { useCallback, useEffect, useRef, useState } from "react";
import type { MapShow } from "./document";
import { playbackEnded, showTime, transportTime, type Transport } from "./playback";

export function useTransport(show: MapShow) {
  const [transport, setTransport] = useState<Transport>(() => ({ playing: false, timeS: 0, anchorMs: Date.now() }));
  const [timeS, setTimeS] = useState(0);
  // While playing, the playhead advances from the animation frame only. While
  // paused it changes from events (seek, pause), never from an effect.
  // The loop reads the document and the anchor through a ref rather than
  // depending on them: every edit produces a new show object, so listing `show`
  // here tore down and restarted the playhead on every pointer move of a drag
  // made during playback — cancelling a frame that had already been scheduled,
  // once per move, for as long as the drag lasted.
  const latest = useRef({ show, transport });
  useEffect(() => { latest.current = { show, transport }; }, [show, transport]);
  useEffect(() => {
    if (!transport.playing) return;
    let frame = 0;
    const tick = () => {
      const now = latest.current;
      const elapsed = transportTime(now.transport);
      const at = showTime(now.show, elapsed);
      setTimeS(at);
      if (playbackEnded(now.show, elapsed)) {
        setTransport({ playing: false, timeS: at, anchorMs: Date.now() });
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Restarts only when playback starts, or the anchor moves: play, pause, seek.
  }, [transport.playing, transport.timeS, transport.anchorMs]);

  const seek = useCallback(
    (next: number) => {
      setTimeS(showTime(show, next));
      setTransport((current) => ({ ...current, timeS: next, anchorMs: Date.now() }));
    },
    [show],
  );

  const togglePlay = useCallback(() => {
    setTransport((current) => {
      const elapsed = transportTime(current);
      const at = !current.playing && playbackEnded(show, elapsed) ? 0 : elapsed;
      if (current.playing) setTimeS(showTime(show, at));
      return { playing: !current.playing, timeS: at, anchorMs: Date.now() };
    });
  }, [show]);

  const playFrom = useCallback((at: number) => {
    setTimeS(showTime(show, at));
    setTransport({ playing: true, timeS: at, anchorMs: Date.now() });
  }, [show]);

  return { transport, timeS, seek, togglePlay, playFrom };
}
