import { afterEach, expect, it, vi } from "vitest";
import { watchDeployedLayout } from "./deployed-layout";
import { emptyShow } from "./document";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("loads changed deployments without restarting the same show and survives failed reads", async () => {
  vi.useFakeTimers();
  const first = emptyShow();
  const second = { ...first, activeSceneId: "replacement", scenes: [{ ...first.scenes[0], id: "replacement" }],
    // Bound to the scene that is actually there: an output renders only the
    // scene it is linked to, so a stale id would be rebound on parse and the
    // round trip would not match.
    outputs: first.outputs.map((output) => ({ ...output, sceneId: "replacement" })) };
  const response = (show: unknown) => ({ ok: true, text: async () => JSON.stringify(show) });
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response(first))
    .mockResolvedValueOnce(response(first))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(response({ invalid: true }))
    .mockResolvedValue(response(second));
  vi.stubGlobal("fetch", fetcher);
  const onShow = vi.fn();
  const stop = watchDeployedLayout(onShow, 100);
  await vi.advanceTimersByTimeAsync(0);
  expect(onShow).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(300);
  expect(onShow).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  expect(onShow).toHaveBeenLastCalledWith(second);
  stop();
  await vi.advanceTimersByTimeAsync(1000);
  expect(onShow).toHaveBeenCalledTimes(2);
});
