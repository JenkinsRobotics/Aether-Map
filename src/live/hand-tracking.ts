import type { HandSample } from "../features/types";
/** Inference runs away from the editor's render/interaction thread. One frame in flight. */
export function startHandTracking(
  stream: MediaStream,
  onHands: (hands: HandSample[]) => void,
  onError: (message: string) => void,
  subject: "hands" | "face" = "hands",
): () => void {
  const worker = new Worker(new URL("./hand-worker.ts", import.meta.url), { type: "module" });
  const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.srcObject = stream;
  let stopped = false, busy = true, timer = 0, lastTime = -1;
  const cleanup = () => { stopped = true; clearTimeout(timer); worker.terminate(); video.pause(); video.srcObject = null; };
  const tick = async () => {
    if (stopped) return;
    if (!busy && video.readyState >= 2 && lastTime !== video.currentTime) {
      busy = true; lastTime = video.currentTime;
      try {
        const image = await createImageBitmap(video);
        if (stopped) { image.close(); return; }
        worker.postMessage({ type: "frame", image, timeMs: performance.now() }, [image]);
      } catch (error) { cleanup(); onError((error as Error).message); return; }
    }
    timer = window.setTimeout(tick, 50);
  };
  worker.onmessage = (event) => {
    if (event.data.type === "error") { cleanup(); onError(event.data.message); return; }
    busy = false;
    if (event.data.type === "hands") onHands(event.data.hands);
    // A face arrives as one landmark set, which is the same shape a hand is, so
    // everything downstream — rendering, recording, replay — is already written.
    else if (event.data.type === "faces") {
      onHands((event.data.faces as { points: HandSample["points"] }[]).map((face) => ({ side: "Right", points: face.points })));
    }
  };
  worker.onerror = (event) => { cleanup(); onError(event.message); };
  const base = new URL("vendor/mediapipe", new URL(import.meta.env.BASE_URL, document.baseURI)).href;
  worker.postMessage({ type: "init", base, subject });
  void video.play().then(tick).catch((error: Error) => { cleanup(); onError(error.message); });
  return cleanup;
}
