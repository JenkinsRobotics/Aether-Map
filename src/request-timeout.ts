/** Cancel requests on timeout or parent disposal, including older WebRTC browsers
 * that have AbortController but do not implement AbortSignal.any. */
export async function withRequestTimeout<T>(milliseconds: number, run: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  if (parent?.aborted) { cancel(); throw controller.signal.reason; }
  parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('The request timed out. Check the connection and try again.', 'TimeoutError')), milliseconds);
  try { return await run(controller.signal); }
  finally { clearTimeout(timer); parent?.removeEventListener('abort', cancel); }
}
