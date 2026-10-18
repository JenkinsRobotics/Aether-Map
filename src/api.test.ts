// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { library } from "./api";
const file = { id: "show", name: "Show.aethermap", revision: 2, writable: true };
afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, "", "/"); });
it("uses the shared document protocol for a Map save", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(file)));
  vi.stubGlobal("fetch", fetcher);
  expect(await library.save("show", 1, new TextEncoder().encode("{}"))).toEqual(file);
  const [url, request] = fetcher.mock.calls[0];
  expect(url).toBe("/api/library/save");
  expect(JSON.parse(request.body)).toEqual({ app: "map", id: "show", expected_revision: 1, branch: "Main", data_base64: "e30=", operation_id: expect.any(String) });
});
it("preserves Drive's creation destination and blocks uncertain create retries", async () => {
  history.replaceState(null, "", "/map/?driveOrganization=company&driveWorkspace=design&driveParent=folder");
  const fetcher = vi.fn().mockRejectedValue(new TypeError("Lost create reply"));
  vi.stubGlobal("fetch", fetcher);
  await expect(library.create("Show", new TextEncoder().encode("{}"))).rejects.toMatchObject({ retryable: false, detail: { code: "outcome_unknown" } });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ organization: "company", workspace: "design", parent: "folder", scope: "workspace" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
