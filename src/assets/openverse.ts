/**
 * Openverse: openly-licensed images you can search and import without an
 * account.
 *
 * Chosen as the first provider because it needs no API key, which means the
 * Assets tab works on a fresh install with nothing to configure.
 *
 * Search goes through the Studio host (see ENDPOINT); the thumbnails and the
 * source files are fetched by the page, which they allow. Providers that need a
 * key — Pixabay now shares this host route — use server-held credentials,
 * because a key shipped in a browser bundle is a published key.
 *
 * `fetchImpl` is injected so the search and download paths are testable without
 * a network.
 */

export interface AssetResult {
  id: string;
  provider?: 'Openverse' | 'Pixabay';
  kind?: 'image' | 'video';
  durationS?: number;
  variants?: import('./pixabay').AssetRendition[];
  title: string;
  /** The full-size file to import. */
  url: string;
  /** Provider-hosted preview, safe to put straight in an <img>. */
  thumbnail: string;
  creator: string;
  /** Short licence code, e.g. "by", "cc0". */
  license: string;
  licenseVersion: string;
  /** The page this came from, for a human to check the terms. */
  sourceUrl: string;
  /** Ready-made credit line from the provider. */
  attribution: string;
  width: number;
  height: number;
}

export interface AssetSearch {
  results: AssetResult[];
  page: number;
  pageCount: number;
  total: number;
}

/**
 * Proxied by the Studio host rather than called from the page.
 *
 * The same request that succeeds from a server is answered 401 from a browser,
 * so direct calls are not dependable. Pixabay also uses this route and keeps
 * its API key on the host.
 */
const ENDPOINT = "/api/map/assets/search";

/** Openverse's own field names, before they are narrowed to what Map needs. */
interface RawResult {
  id?: unknown; title?: unknown; url?: unknown; thumbnail?: unknown;
  creator?: unknown; license?: unknown; license_version?: unknown;
  foreign_landing_url?: unknown; attribution?: unknown;
  width?: unknown; height?: unknown;
}

const text = (value: unknown, fallback = "") => typeof value === "string" && value ? value : fallback;
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/**
 * A result is only usable if it has an id and a file to fetch; everything else
 * has a sensible blank. Anything without those is dropped rather than rendered
 * as a broken tile.
 */
function readResult(raw: RawResult): AssetResult | null {
  const id = text(raw.id), url = text(raw.url);
  if (!id || !url) return null;
  return {
    id,
    title: text(raw.title, "Untitled"),
    url,
    thumbnail: text(raw.thumbnail, url),
    creator: text(raw.creator, "Unknown"),
    license: text(raw.license, "unknown"),
    licenseVersion: text(raw.license_version),
    sourceUrl: text(raw.foreign_landing_url),
    attribution: text(raw.attribution),
    width: count(raw.width),
    height: count(raw.height),
  };
}

export async function searchOpenverse(
  query: string,
  { page = 1, fetchImpl = fetch, signal }: {
    page?: number; fetchImpl?: typeof fetch; signal?: AbortSignal;
  } = {},
): Promise<AssetSearch> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], page: 1, pageCount: 0, total: 0 };
  // Built as a relative URL: the host serves the app, so there is no origin to
  // name, and nothing here should depend on `location`.
  const search = new URLSearchParams({ q: trimmed, page: String(Math.max(1, page)) });
  const response = await fetchImpl(`${ENDPOINT}?${search}`, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) {
    // The host phrases the upstream failures, including the rate limit an
    // operator will actually hit; fall back to the status when it cannot.
    const said = await response.json().then(
      (body: { error?: unknown }) => (typeof body?.error === "string" ? body.error : ""),
      () => "",
    );
    throw new Error(said || `Openverse search failed (${response.status}).`);
  }
  const body = await response.json() as { results?: unknown; page?: unknown; page_count?: unknown; result_count?: unknown };
  const raw = Array.isArray(body.results) ? body.results : [];
  return {
    results: raw.map((entry) => readResult((entry ?? {}) as RawResult)).filter((entry): entry is AssetResult => entry !== null),
    page: count(body.page) || 1,
    pageCount: count(body.page_count),
    total: count(body.result_count),
  };
}

/** A filename for the imported copy: the title, kept readable, plus the type. */
export function assetFileName(result: AssetResult, mime: string): string {
  const extension = (mime.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 4) || "jpg";
  const stem = result.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "asset";
  return `${stem}.${extension}`;
}

/**
 * Fetch the file itself, as a `File` the existing media import path accepts.
 *
 * Downloaded rather than linked on purpose: a show runs in a venue, or on a
 * paired Pi, where there may be no network at all. An asset that stayed a URL
 * would be a black surface on the night.
 */
async function downloadAssetBytes(
  result: AssetResult,
  { fetchImpl = fetch, signal }: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<File> {
  const response = await fetchImpl(result.url, { signal });
  if (!response.ok) throw new Error(`Could not download "${result.title}" (${response.status}).`);
  const limit = 512 * 1024 * 1024;
  if (Number(response.headers?.get('content-length')) > limit) throw new Error('Choose media smaller than 512 MB.');
  let blob: Blob;
  if (response.body) {
    const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = [];
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > limit) { await reader.cancel(); throw new Error('Choose media smaller than 512 MB.'); }
        chunks.push(new Uint8Array(chunk.value));
      }
    } finally { reader.releaseLock(); }
    blob = new Blob(chunks, { type: response.headers.get('content-type') ?? '' });
  } else blob = await response.blob();
  const mime = blob.type.split(';')[0] || (result.kind === 'video' ? '' : "image/jpeg");
  const expected = result.kind === 'video' ? 'video/' : 'image/';
  if (!mime.startsWith(expected)) throw new Error(`"${result.title}" is not an ${result.kind === 'video' ? 'importable video' : 'image'}.`);
  if (!blob.size) throw new Error(`"${result.title}" is empty.`);
  if (blob.size > 512 * 1024 * 1024) throw new Error('Choose media smaller than 512 MB.');
  return new File([blob], assetFileName(result, mime), { type: mime });
}

/** One deadline covers headers and all streamed bytes; caller cancellation also wins. */
export async function downloadAsset(result: AssetResult, { fetchImpl = fetch, signal }: {
  fetchImpl?: typeof fetch; signal?: AbortSignal;
} = {}): Promise<File> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new DOMException('Download timed out. Please try again.', 'TimeoutError')), 120_000);
  try { return await downloadAssetBytes(result, { fetchImpl, signal: controller.signal }); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

/** The credit stored with the imported media, so attribution survives the import. */
export function assetCredit(result: AssetResult) {
  return {
    provider: result.provider ?? "Openverse",
    creator: result.creator,
    license: result.licenseVersion ? `${result.license} ${result.licenseVersion}` : result.license,
    sourceUrl: result.sourceUrl,
    text: result.attribution,
  };
}
