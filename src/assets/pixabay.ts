import type { AssetResult, AssetSearch } from './openverse';

export interface AssetRendition { label: string; url: string; width: number; height: number; bytes: number; thumbnail: string }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
/** Provider JSON cannot introduce local-network/file/javascript URLs. */
export function pixabayUrl(value: unknown): string {
  try {
    const url = new URL(text(value));
    return url.protocol === 'https:' && ['pixabay.com', 'www.pixabay.com', 'cdn.pixabay.com'].includes(url.hostname)
      && !url.username && !url.password && !url.port ? url.href : '';
  } catch { return ''; }
}
export function readPixabayResult(value: unknown, kind: 'image' | 'video'): AssetResult | null {
  const raw = record(value), id = number(raw.id), sourceUrl = pixabayUrl(raw.pageURL);
  if (!Number.isSafeInteger(id) || !id || !sourceUrl) return null;
  const variants = Object.entries(record(raw.videos)).flatMap(([label, value]) => {
    const v = record(value), url = pixabayUrl(v.url), width = number(v.width), height = number(v.height);
    return url && width && height ? [{ label, url, width, height, bytes: number(v.size), thumbnail: pixabayUrl(v.thumbnail) }] : [];
  }).sort((a, b) => b.width - a.width);
  const variant = variants.find(v => v.height <= 1080) ?? variants.at(-1);
  const url = kind === 'video' ? variant?.url : pixabayUrl(raw.largeImageURL) || pixabayUrl(raw.webformatURL);
  if (!url) return null;
  const title = text(raw.tags) || `Pixabay ${kind} ${id}`, creator = text(raw.user) || 'Unknown';
  return { id: `pixabay-${kind}-${id}`, provider: 'Pixabay', kind, title, creator, sourceUrl, url,
    thumbnail: kind === 'video' ? variant?.thumbnail ?? '' : pixabayUrl(raw.previewURL),
    width: kind === 'video' ? variant!.width : number(raw.webformatWidth),
    height: kind === 'video' ? variant!.height : number(raw.webformatHeight),
    durationS: kind === 'video' ? number(raw.duration) : undefined,
    license: 'Pixabay Content License', licenseVersion: '',
    attribution: `${title} by ${creator} on Pixabay. ${sourceUrl}`,
    ...(kind === 'video' ? { variants } : {}),
  };
}
export async function searchPixabay(query: string, { kind = 'video', page = 1, signal, fetchImpl = fetch }: {
  kind?: 'image' | 'video'; page?: number; signal?: AbortSignal; fetchImpl?: typeof fetch;
} = {}): Promise<AssetSearch> {
  if (!query.trim()) return { results: [], page: 1, pageCount: 0, total: 0 };
  const params = new URLSearchParams({ provider: 'pixabay', kind, q: query.trim(), page: String(page) });
  const response = await fetchImpl(`/api/map/assets/search?${params}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : `Pixabay search failed (${response.status}).`);
  }
  const raw = record(await response.json());
  if (!Array.isArray(raw.hits) || typeof raw.totalHits !== 'number') throw new Error('This Studio server does not support Pixabay search yet. Use Browse Pixabay and import the downloaded file.');
  const total = Math.min(500, number(raw.totalHits));
  return { results: raw.hits.map(v => readPixabayResult(v, kind)).filter((v): v is AssetResult => !!v), total, page, pageCount: Math.ceil(total / 20) };
}
export function pixabayBrowseUrl(query: string, kind: 'image' | 'video') {
  const link = pixabayUrl(query.trim());
  if (link && new URL(link).hostname !== 'cdn.pixabay.com') return link;
  return `https://pixabay.com/${kind === 'video' ? 'videos' : 'images'}/search/${encodeURIComponent(query.trim())}/`;
}
