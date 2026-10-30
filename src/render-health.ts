/** What a player's show page says about its own drawing: proof of a picture
 * that a heartbeat from the player process cannot give. */
export interface RenderHealth { fps: number; webgl: boolean; error: string }

const supportsWebGL = () => {
  try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; }
};

/** Counts animation frames and reports every `periodMs`. A page that has hung
 * or gone black reports few or none, which is the point. */
export function startRenderHealth(report: (health: RenderHealth) => void, periodMs = 10000, webgl = supportsWebGL): () => void {
  let frames = 0, request = 0, error = '';
  const counted = () => { frames++; request = requestAnimationFrame(counted); };
  request = requestAnimationFrame(counted);
  const failed = (event: ErrorEvent | PromiseRejectionEvent) => {
    const reason = 'message' in event ? event.message : String((event as PromiseRejectionEvent).reason);
    error = reason.slice(0, 300);
  };
  addEventListener('error', failed);
  addEventListener('unhandledrejection', failed);
  const canDraw = webgl();
  const timer = setInterval(() => { report({ fps: Math.round(frames * 1000 / periodMs), webgl: canDraw, error }); frames = 0; }, periodMs);
  return () => {
    clearInterval(timer); cancelAnimationFrame(request);
    removeEventListener('error', failed); removeEventListener('unhandledrejection', failed);
  };
}

/** Generators need a GPU these boards' browsers do not offer usably.
 * ponytail: by model name until every player reports render health. */
export function lowPowerPlayer(status: { model?: string; render?: (RenderHealth & { age_s: number }) | null } | null | undefined): boolean {
  if (!status) return false;
  if (status.render && !status.render.webgl) return true;
  return /Raspberry Pi (Model [AB]|[123]|Zero)/i.test(status.model ?? '');
}
