import { useEffect, type RefObject } from "react";

/** Beyond this the clip is audibly/visibly out of step and worth a seek. */
const DRIFT_TOLERANCE_S = 0.25;

/**
 * Hold a clip to the show clock.
 *
 * Without this a `<video loop>` runs on its own clock: the projector's picture
 * depends on when the page happened to load, two devices never agree, and
 * restarting a show does not restart its clips. A show has to be a function of
 * time, video included.
 */
export function useVideoSync(
  ref: RefObject<HTMLMediaElement | null>,
  timeS: number,
  playing: boolean,
  loop = true,
  source?: string,
  onBlocked?: () => void,
): void {
  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const sync = () => {
      const duration = video.duration;
      const atEnd = !loop && Number.isFinite(duration) && duration > 0 && timeS >= duration;
      if (Number.isFinite(duration) && duration > 0) {
        const target = loop ? timeS % duration : Math.min(timeS, Math.max(0, duration - 0.001));
        // Paused scrubbing must be exact; playing media tolerates small drift.
        if (Math.abs(video.currentTime - target) > (playing && !atEnd ? DRIFT_TOLERANCE_S : 0.001))
          video.currentTime = target;
      }
      if (playing && !atEnd && video.paused) void video.play().catch(() => onBlocked?.());
      else if ((!playing || atEnd) && !video.paused) video.pause();
    };
    sync();
    video.addEventListener("loadedmetadata", sync);
    return () => video.removeEventListener("loadedmetadata", sync);
  }, [ref, timeS, playing, loop, source, onBlocked]);
}
