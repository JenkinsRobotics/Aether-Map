import { describe, expect, it, vi } from 'vitest';
import { pixabayBrowseUrl, readPixabayResult, searchPixabay } from './pixabay';
import { assetCredit, downloadAsset } from './openverse';

const rendition = (height: number) => ({ url: `https://cdn.pixabay.com/video/skull-${height}.mp4`, thumbnail: `https://cdn.pixabay.com/video/skull-${height}.jpg`, width: height * 16 / 9, height, size: 3000 });
export const HIT = { id: 133142, pageURL: 'https://pixabay.com/videos/skull-skeleton-halloween-scary-133142/', tags: 'skull, skeleton', user: 'patw64', duration: 20,
  videos: { large: rendition(2160), medium: rendition(1080), small: rendition(720), tiny: { url: '', width: 0, height: 0 } } };

describe('Pixabay assets', () => {
  it('chooses a full HD copy, keeps real renditions, credit and duration', () => {
    const result = readPixabayResult(HIT, 'video')!;
    expect(result.height).toBe(1080); expect(result.variants).toHaveLength(3);
    expect(result.durationS).toBe(20);
    expect(assetCredit(result)).toMatchObject({ provider: 'Pixabay', creator: 'patw64', sourceUrl: HIT.pageURL, license: 'Pixabay Content License' });
  });
  it('rejects untrusted provider URLs and malformed or empty renditions', () => {
    for (const url of ['javascript:alert(1)', 'https://127.0.0.1/private', 'https://pixabay.com.evil.test/file', 'https://user:password@cdn.pixabay.com/file']) {
      expect(readPixabayResult({ ...HIT, videos: { medium: { ...rendition(1080), url } } }, 'video')).toBeNull();
    }
    expect(readPixabayResult(null, 'video')).toBeNull();
    expect(readPixabayResult({ ...HIT, videos: {} }, 'video')).toBeNull();
  });
  it('uses the authenticated host without putting a provider key in browser requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hits: [HIT], totalHits: 70 }) });
    const found = await searchPixabay(HIT.pageURL, { fetchImpl, page: 2 });
    const params = new URL(fetchImpl.mock.calls[0][0], 'https://studio.test').searchParams;
    expect(params.get('q')).toBe(HIT.pageURL); expect(params.get('provider')).toBe('pixabay'); expect(params.has('key')).toBe(false);
    expect(found.pageCount).toBe(4); expect(found.page).toBe(2);
  });
  it('detects old hosts instead of claiming a search had no results', async () => {
    await expect(searchPixabay('skull', { fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }) })).rejects.toThrow(/does not support/);
  });
  it('imports video bytes as a video file and rejects HTML downloads', async () => {
    const result = readPixabayResult(HIT, 'video')!;
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['mp4 bytes'], { type: 'video/mp4' }) });
    const file = await downloadAsset(result, { fetchImpl });
    expect(file.type).toBe('video/mp4'); expect(file.name).toMatch(/\.mp4$/);
    fetchImpl.mockResolvedValue({ ok: true, blob: async () => new Blob(['login'], { type: 'text/html' }) });
    await expect(downloadAsset(result, { fetchImpl })).rejects.toThrow(/video/);
  });
  it('opens the actual linked page or an encoded website search', () => {
    expect(pixabayBrowseUrl(HIT.pageURL, 'video')).toBe(HIT.pageURL);
    expect(pixabayBrowseUrl('smoke & fire', 'video')).toBe('https://pixabay.com/videos/search/smoke%20%26%20fire/');
  });
});

describe('bounded online imports', () => {
  it('rejects oversized downloads before reading their bodies', async () => {
    const blob = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({ ok:true, headers:new Headers({ 'content-length': String(513*1024*1024) }), blob });
    await expect(downloadAsset(readPixabayResult(HIT,'video')!, {fetchImpl})).rejects.toThrow(/512 MB/);
    expect(blob).not.toHaveBeenCalled();
  });
  it('forwards caller cancellation while downloading', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve,reject) => {
      options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason));
    }));
    const pending = downloadAsset(readPixabayResult(HIT,'video')!, {fetchImpl, signal:controller.signal});
    controller.abort();
    await expect(pending).rejects.toMatchObject({name:'AbortError'});
  });
});
