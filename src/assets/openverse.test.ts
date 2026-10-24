import { describe, expect, it, vi } from "vitest";
import { assetCredit, assetFileName, downloadAsset, searchOpenverse, type AssetResult } from "./openverse";

/** One real result, field-for-field as api.openverse.org returned it. */
const REAL = {
  id: "ce1e03a6-0a04-44da-b94f-a0d0a9108dca",
  title: "Caustic light",
  url: "https://live.staticflickr.com/97/244887979_12c2e11225_b.jpg",
  thumbnail: "https://api.openverse.org/v1/images/ce1e03a6-0a04-44da-b94f-a0d0a9108dca/thumb/",
  creator: "fdecomite",
  license: "by",
  license_version: "2.0",
  foreign_landing_url: "https://www.flickr.com/photos/21649179@N00/244887979",
  attribution: '"Caustic light" by fdecomite is licensed under CC BY 2.0.',
  width: 1024,
  height: 766,
};

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe("searchOpenverse", () => {
  it("asks the host's proxy for the query and the page", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ results: [REAL], page: 2, page_count: 9, result_count: 240 }));
    await searchOpenverse("caustics", { page: 2, fetchImpl: fetchImpl as unknown as typeof fetch });
    // Relative, and to the host rather than straight to Openverse: the same
    // request that works from a server is refused from a page.
    const url = new URL(fetchImpl.mock.calls[0][0] as string, "http://host.invalid");
    expect(url.pathname).toBe("/api/map/assets/search");
    expect(url.searchParams.get("q")).toBe("caustics");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("narrows a result to what the panel needs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ results: [REAL], page: 1, page_count: 10, result_count: 240 }));
    const found = await searchOpenverse("caustics", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(found.results[0]).toMatchObject({
      id: REAL.id, title: "Caustic light", url: REAL.url, thumbnail: REAL.thumbnail,
      creator: "fdecomite", license: "by", licenseVersion: "2.0",
      sourceUrl: REAL.foreign_landing_url, width: 1024, height: 766,
    });
    expect(found).toMatchObject({ page: 1, pageCount: 10, total: 240 });
  });

  it("drops a result with no file to fetch rather than drawing a broken tile", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ results: [REAL, { ...REAL, id: "x", url: "" }, { title: "no id" }] }));
    const found = await searchOpenverse("caustics", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(found.results).toHaveLength(1);
  });

  it("fills in blanks the provider left out", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ results: [{ id: "a", url: "https://x/y.jpg" }] }));
    const found = await searchOpenverse("caustics", { fetchImpl: fetchImpl as unknown as typeof fetch });
    // Thumbnail falls back to the file itself, so the tile still draws.
    expect(found.results[0]).toMatchObject({ title: "Untitled", creator: "Unknown", thumbnail: "https://x/y.jpg" });
  });

  it("searches for nothing when the query is blank, rather than asking the provider", async () => {
    const fetchImpl = vi.fn();
    expect(await searchOpenverse("   ", { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .toEqual({ results: [], page: 1, pageCount: 0, total: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes on what the host said went wrong", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502,
      json: async () => ({ error: "Openverse is rate limiting searches. Wait a moment and try again." }) } as unknown as Response);
    await expect(searchOpenverse("caustics", { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toThrow(/rate limiting/i);
  });

  it("falls back to the status when the host said nothing readable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503,
      json: async () => { throw new Error("not json"); } } as unknown as Response);
    await expect(searchOpenverse("caustics", { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toThrow(/503/);
  });
});

const result: AssetResult = {
  id: REAL.id, title: REAL.title, url: REAL.url, thumbnail: REAL.thumbnail,
  creator: REAL.creator, license: REAL.license, licenseVersion: REAL.license_version,
  sourceUrl: REAL.foreign_landing_url, attribution: REAL.attribution, width: 1024, height: 766,
};

describe("downloadAsset", () => {
  it("returns a File the existing media import accepts", async () => {
    const blob = new Blob(["bytes"], { type: "image/jpeg" });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => blob } as unknown as Response);
    const file = await downloadAsset(result, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toBe("Caustic-light.jpeg");
  });

  it("refuses something that is not an image", async () => {
    const blob = new Blob(["<html>"], { type: "text/html" });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => blob } as unknown as Response);
    await expect(downloadAsset(result, { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toThrow(/not an image/i);
  });

  it("names the asset in a download failure, so the tile that failed is obvious", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(downloadAsset(result, { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toThrow(/Caustic light/);
  });
});

describe("assetFileName", () => {
  it("keeps the title readable and strips what a filename cannot hold", () => {
    expect(assetFileName({ ...result, title: 'Fire & "smoke" / loop' }, "image/png")).toBe("Fire-smoke-loop.png");
  });

  it("falls back when a title has nothing usable left", () => {
    expect(assetFileName({ ...result, title: "///" }, "image/jpeg")).toBe("asset.jpeg");
  });
});

describe("assetCredit", () => {
  it("keeps the licence and the source with the imported copy", () => {
    expect(assetCredit(result)).toEqual({
      provider: "Openverse",
      creator: "fdecomite",
      license: "by 2.0",
      sourceUrl: REAL.foreign_landing_url,
      text: REAL.attribution,
    });
  });
});
