// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetBrowser } from "./AssetBrowser";

afterEach(cleanup);

const RESULT = {
  id: "abc", title: "Caustic light", url: "https://live.staticflickr.com/x.jpg",
  thumbnail: "https://api.openverse.org/thumb", creator: "fdecomite",
  license: "by", license_version: "2.0",
  foreign_landing_url: "https://flickr.com/p/1",
  attribution: '"Caustic light" by fdecomite is licensed under CC BY 2.0.',
  width: 1024, height: 766,
};

function stubSearch(body: unknown) {
  const impl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
  vi.stubGlobal("fetch", impl);
  return impl;
}

async function search(term = "caustics") {
  fireEvent.change(screen.getByLabelText("Online library"), { target: { value: "openverse" } });
  fireEvent.change(screen.getByLabelText("Search open-licensed assets"), { target: { value: term } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
}

describe("AssetBrowser", () => {
  it("invites a search before one has been run", () => {
    render(<AssetBrowser onImport={() => {}} targetLayer={null} />);
    expect(screen.getByText(/Search for something to project/)).toBeTruthy();
  });

  it("shows a result with the creator and licence, which is what decides if it can go on a wall", async () => {
    stubSearch({ results: [RESULT], result_count: 240, page: 1, page_count: 10 });
    render(<AssetBrowser onImport={() => {}} targetLayer="Surface 1" />);
    await search();
    await waitFor(() => expect(screen.getByText("Caustic light")).toBeTruthy());
    expect(screen.getByText(/fdecomite · BY/)).toBeTruthy();
    expect(screen.getByText(/240 results/)).toBeTruthy();
  });

  it("explains library import and surface or scene assignment", async () => {
    const { rerender } = render(<AssetBrowser onImport={() => {}} targetLayer="Surface 1" />);
    expect(screen.getByText(/apply media to Surface 1 or the scene/)).toBeTruthy();
    rerender(<AssetBrowser onImport={() => {}} targetLayer={null} />);
    expect(screen.getByText(/apply them to a surface or scene/)).toBeTruthy();
  });

  it("downloads the file and hands it over on click", async () => {
    const onImport = vi.fn();
    const impl = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ results: [RESULT], result_count: 1 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, blob: async () => new Blob(["b"], { type: "image/jpeg" }) });
    vi.stubGlobal("fetch", impl);
    render(<AssetBrowser onImport={onImport} targetLayer="Surface 1" />);
    await search();
    await waitFor(() => expect(screen.getByText("Caustic light")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Import Caustic light by fdecomite/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    const [file, result] = onImport.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    expect(result.id).toBe("abc");
  });

  it("reports a failed search instead of showing an empty grid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502,
      json: async () => ({ error: "Openverse is rate limiting searches. Wait a moment and try again." }) }));
    render(<AssetBrowser onImport={() => {}} targetLayer={null} />);
    await search();
    await waitFor(() => expect(within(screen.getByRole("alert")).getByText(/rate limiting/i)).toBeTruthy());
  });

  it("says plainly when a search found nothing", async () => {
    stubSearch({ results: [], result_count: 0 });
    render(<AssetBrowser onImport={() => {}} targetLayer={null} />);
    await search("zzzzzz");
    await waitFor(() => expect(screen.getByText("Nothing found")).toBeTruthy());
  });
});

describe('Pixabay browser', () => {
  const video = { id: 133142, pageURL: 'https://pixabay.com/videos/skull-133142/', user: 'patw64', tags: 'skull', duration: 20,
    videos: { medium: { url: 'https://cdn.pixabay.com/video/skull.mp4', thumbnail: 'https://cdn.pixabay.com/video/skull.jpg', width: 1920, height: 1080, size: 1234 } } };
  it('previews a linked video, then imports it with its provider credit', async () => {
    const onImport = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ hits: [video], totalHits: 1 }) })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['video'], { type:'video/mp4' }) }));
    render(<AssetBrowser onImport={onImport} targetLayer={null} />);
    fireEvent.change(screen.getByLabelText('Search Pixabay or paste a link'), { target: { value:video.pageURL } });
    fireEvent.click(screen.getByRole('button', { name:'Search' }));
    fireEvent.click(await screen.findByRole('button', { name:'Preview skull by patw64' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name:'Import into project' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0][0].type).toBe('video/mp4');
    expect(onImport.mock.calls[0][1].provider).toBe('Pixabay');
    await waitFor(() => expect(screen.getByText(/Imported skull/)).toBeTruthy());
  });
  it('offers the website popup and file chooser without an API key', () => {
    const open = vi.spyOn(window,'open').mockImplementation(() => null), choose = vi.fn();
    render(<AssetBrowser onImport={() => {}} onChooseFile={choose} targetLayer={null} />);
    fireEvent.change(screen.getByLabelText('Search Pixabay or paste a link'), { target: { value:'skull' } });
    fireEvent.click(screen.getByRole('button', { name:'Browse Pixabay' }));
    expect(open).toHaveBeenCalledWith('https://pixabay.com/videos/search/skull/', '_blank', expect.stringContaining('noopener'));
    fireEvent.click(screen.getByRole('button', { name:'Import downloaded file…' }));
    expect(choose).toHaveBeenCalledOnce(); open.mockRestore();
  });
  it('does not report success when project import fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok:true, json:async () => ({ hits:[video], totalHits:1 }) })
      .mockResolvedValueOnce({ ok:true, blob:async () => new Blob(['video'], { type:'video/mp4' }) }));
    render(<AssetBrowser onImport={async () => { throw new Error('Upload failed'); }} targetLayer={null} />);
    fireEvent.change(screen.getByLabelText('Search Pixabay or paste a link'), { target:{value:'skull'} });
    fireEvent.click(screen.getByRole('button', { name:'Search' }));
    fireEvent.click(await screen.findByRole('button', { name:'Preview skull by patw64' }));
    fireEvent.click(screen.getByRole('button', { name:'Import into project' }));
    await screen.findByText('Upload failed'); expect(screen.queryByText(/Imported skull/)).toBeNull();
  });
});
