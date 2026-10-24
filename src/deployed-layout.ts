import { parseShow } from "./show-file";
import type { MapShow } from "./document";

/** Follow atomic local deployments; a failed read retains the last good show. */
export function watchDeployedLayout(onShow: (show: MapShow) => void, pollMs = 2000): () => void {
  let stopped = false;
  let previous = "";
  let timer: ReturnType<typeof setTimeout>;
  const controller = new AbortController();
  const read = async () => {
    try {
      const response = await fetch("layout.json", { cache: "no-store", signal: controller.signal });
      if (!response.ok) return;
      const text = await response.text();
      if (stopped || text === previous) return;
      const show = parseShow(text);
      previous = text;
      onShow(show);
    } catch { /* A failed transfer must not interrupt offline playback. */ }
    finally { if (!stopped) timer = setTimeout(() => void read(), pollMs); }
  };
  void read();
  return () => { stopped = true; clearTimeout(timer); controller.abort(); };
}
