// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { replaceLocationQuery } from "./location-history";

describe("replaceLocationQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    history.replaceState(null, "", "/");
  });

  it("does not write browser history when repeated autosave updates keep the same URL", () => {
    history.replaceState({ workspace: true }, "", "/map/?document=show-1");
    const replace = vi.spyOn(history, "replaceState");
    const query = new URLSearchParams("document=show-1");

    for (let edit = 0; edit < 150; edit += 1) replaceLocationQuery(query);

    expect(replace).not.toHaveBeenCalled();
  });

  it("writes once when document identity changes and preserves state and hash", () => {
    history.replaceState({ workspace: true }, "", "/map/?draft=draft-1#canvas");
    const replace = vi.spyOn(history, "replaceState");
    const query = new URLSearchParams("document=show-1");

    expect(replaceLocationQuery(query)).toBe(true);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      { workspace: true },
      "",
      "/map/?document=show-1#canvas",
    );
    expect(replaceLocationQuery(query)).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
