import { useEffect, useRef, useState } from 'react';
import { AetherIcon, Button, Checkbox, Dialog, EmptyState, FieldRow, SearchField, SelectField } from '@aether/ui';
import { downloadAsset, searchOpenverse, type AssetResult, type AssetSearch } from '../assets/openverse';
import { pixabayBrowseUrl, searchPixabay } from '../assets/pixabay';
import { accessLabel, EXTERNAL_SOURCES } from '../assets/sources';
import { formatBytes } from '../format';
import './AssetBrowser.css';

export interface AssetBrowserProps {
  onImport: (file: File, result: AssetResult) => Promise<void> | void;
  onChooseFile?: () => void;
  targetLayer: string | null;
  destination?: 'show' | 'pool';
}
const EMPTY: AssetSearch = { results: [], page: 1, pageCount: 0, total: 0 };
export function AssetBrowser({ onImport, onChooseFile, targetLayer, destination = 'show' }: AssetBrowserProps) {
  const [provider, setProvider] = useState('pixabay-video');
  const [query, setQuery] = useState(''), [submitted, setSubmitted] = useState('');
  const [greenScreen, setGreenScreen] = useState(false);
  const [found, setFound] = useState<AssetSearch>(EMPTY);
  const [searching, setSearching] = useState(false), [searched, setSearched] = useState(false);
  const [problem, setProblem] = useState(''), [notice, setNotice] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const [preview, setPreview] = useState<AssetResult | null>(null);
  const [importPhase, setImportPhase] = useState<'download' | 'save' | null>(null);
  const running = useRef<AbortController | null>(null), downloading = useRef<AbortController | null>(null);
  const busyImport = useRef(false);
  const pixabay = provider.startsWith('pixabay'), kind = provider === 'pixabay-video' ? 'video' : 'image';
  useEffect(() => () => { running.current?.abort(); downloading.current?.abort(); }, []);

  async function run(term: string, page = 1, reuseTerm = false) {
    if (!term.trim() || busyImport.current) return;
    running.current?.abort();
    const controller = new AbortController(); running.current = controller;
    const actual = !reuseTerm && pixabay && greenScreen && kind === 'video' && !term.includes('://') ? `${term.trim()} green screen` : term.trim();
    setSearching(true); setProblem(''); setNotice('');
    try {
      const result = pixabay ? await searchPixabay(actual, { kind, page, signal: controller.signal })
        : await searchOpenverse(actual, { page, signal: controller.signal });
      if (controller.signal.aborted) return;
      setFound(result); setSubmitted(actual); setSearched(true);
    } catch (error) {
      if (!controller.signal.aborted) { setProblem((error as Error).message); setFound(EMPTY); }
    } finally { if (!controller.signal.aborted) setSearching(false); }
  }
  function changeProvider(value: string) {
    running.current?.abort(); setSearching(false); setProvider(value); setFound(EMPTY); setSearched(false); setProblem(''); setNotice(''); setPreview(null);
  }
  async function bring(result: AssetResult) {
    if (busyImport.current) return;
    busyImport.current = true;
    const controller = new AbortController(); downloading.current = controller;
    setImporting(result.id); setImportPhase('download'); setProblem(''); setNotice('');
    try {
      const file = await downloadAsset(result, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setImportPhase('save');
      await onImport(file, result);
      setNotice(`Imported ${result.title}. Find it in ${destination === 'pool' ? 'the Media Pool' : 'In this show'}.`);
      setPreview(null);
    } catch (error) { if (!controller.signal.aborted) setProblem((error as Error).message); }
    finally { busyImport.current = false; setImporting(null); setImportPhase(null); }
  }
  function browse() {
    const url = pixabayBrowseUrl(greenScreen && !query.includes('://') ? `${query} green screen`.trim() : query, kind);
    window.open(url, '_blank', 'popup,width=1100,height=800,noopener,noreferrer');
  }
  return <div className="map-asset-browser">
    <FieldRow label="Library"><SelectField aria-label="Online library" value={provider} disabled={!!importing} onChange={e => changeProvider(e.target.value)} options={[
      { value: 'pixabay-video', label: 'Pixabay · Videos' }, { value: 'pixabay-image', label: 'Pixabay · Images' }, { value: 'openverse', label: 'Openverse · Images' },
    ]} /></FieldRow>
    <form className="map-asset-search" role="search" onSubmit={e => { e.preventDefault(); void run(query); }}>
      <SearchField value={query} ariaLabel={pixabay ? 'Search Pixabay or paste a link' : 'Search open-licensed assets'} placeholder={pixabay ? 'Search or paste a Pixabay link…' : 'caustics, smoke, particles, ink…'} onQueryChange={setQuery} onSearch={next => void run(next)} />
      <Button type="submit" disabled={!query.trim() || searching || !!importing}>{searching ? 'Searching…' : 'Search'}</Button>
    </form>
    {pixabay && kind === 'video' && <Checkbox label="Search green-screen footage" checked={greenScreen} onChange={e => setGreenScreen(e.target.checked)} />}
    {pixabay && <div className="map-online-actions"><Button onClick={browse}>Browse Pixabay</Button>{onChooseFile && <Button onClick={onChooseFile} disabled={!!importing}>Import downloaded file…</Button>}</div>}
    <p className="map-hint">{pixabay
      ? 'Search Pixabay here when connected, or browse its website in a popup. Website downloads go to your browser’s download folder; choose Import downloaded file to add one to this project.'
      : 'Openly licensed images from Openverse. No account needed — importing downloads the file into this show, so it still plays with no network.'}
      {destination === 'pool' ? ' Imports appear in the Media Pool. Drag them onto a timeline or append them to a track.' : targetLayer ? ` After importing, apply media to ${targetLayer} or the scene from In this show.` : ' Imports appear in In this show, where you can apply them to a surface or scene.'}
    </p>
    {problem && !preview && <p className="map-asset-problem" role="alert">{problem}</p>}
    {importPhase === 'download' && <Button onClick={() => { downloading.current?.abort(); setNotice('Download cancelled.'); }}>Cancel download</Button>}
    {notice && <p role="status" className="map-hint">{notice}</p>}
    {!searched && !searching && !problem && <EmptyState compact icon={<AetherIcon name="import" />} title="Search for something to project" description="Try skull, smoke, fire or a green-screen animation. You can also paste a Pixabay asset link." />}
    {searched && !searching && !found.results.length && !problem && <EmptyState compact icon={<AetherIcon name="import" />} title="Nothing found" description="Try a broader word, or turn off the green-screen search." />}
    {found.results.length > 0 && !searching && <>
      <div className="map-asset-count" role="status">{found.results.length} of {found.total.toLocaleString()} results · {pixabay ? 'Pixabay' : 'Openverse'} · Page {found.page}</div>
      <ul className="map-asset-grid">{found.results.map(result => <li key={result.id} className="map-asset-tile">
        <button type="button" disabled={!!importing} aria-label={`${result.kind === 'video' ? 'Preview' : 'Import'} ${result.title} by ${result.creator}`} onClick={() => result.kind === 'video' ? setPreview(result) : void bring(result)}>
          {result.thumbnail ? <img src={result.thumbnail} alt="" loading="lazy" /> : <AetherIcon name="file-video" />}
          {importing === result.id && <span className="map-asset-importing" role="status">Importing…</span>}
        </button>
        <div className="map-asset-meta"><span className="map-asset-title" title={result.title}>{result.title}</span>
          {result.kind === 'video' && <span>{result.durationS}s · {result.width}×{result.height}</span>}
          <a className="map-asset-license" href={result.sourceUrl} target="_blank" rel="noreferrer noopener" title={result.attribution}>{result.creator} · {result.license.toUpperCase()}</a>
        </div>
      </li>)}</ul>
      <div className="map-online-actions"><Button disabled={found.page <= 1 || !!importing} onClick={() => void run(submitted, found.page - 1, true)}>Previous</Button><Button disabled={found.page >= found.pageCount || !!importing} onClick={() => void run(submitted, found.page + 1, true)}>Next</Button></div>
    </>}
    <details className="map-asset-sources"><summary>More places to find content</summary>
      <div className="map-source-grid">{EXTERNAL_SOURCES.map(source => <a key={source.url} className="map-source-card" href={source.url} target="_blank" rel="noreferrer noopener" data-access={source.access}>
        <span className="map-source-head"><span className="map-source-name">{source.name}</span><span className="map-source-access">{accessLabel(source)}</span></span><span className="map-source-note">{source.note}</span>
      </a>)}</div>
      <p className="map-hint">Download a file from a source, then import it into this project. Check the source’s terms for that clip.</p>
    </details>
    <Dialog open={!!preview} title={preview?.title ?? 'Preview asset'} onClose={() => { if (!importing) setPreview(null); }} actions={<>
      {importPhase === 'download' ? <Button onClick={() => downloading.current?.abort()}>Cancel download</Button> : <Button disabled={!!importing} onClick={() => setPreview(null)}>Close</Button>}<Button disabled={!!importing || !preview} onClick={() => preview && void bring(preview)}>{importPhase === 'download' ? 'Downloading…' : importing ? 'Adding to project…' : 'Import into project'}</Button>
    </>}>
      {preview && <div className="map-online-preview"><video key={preview.url} src={preview.url} poster={preview.thumbnail} controls muted playsInline preload="metadata" />
        <FieldRow label="Resolution"><SelectField aria-label="Import resolution" disabled={!!importing} value={preview.url} options={(preview.variants ?? []).map(v => ({ value: v.url, label: `${v.width}×${v.height} · ${formatBytes(v.bytes)}` }))} onChange={e => {
          const variant = preview.variants?.find(v => v.url === e.target.value);
          if (variant) setPreview({ ...preview, ...variant });
        }} /></FieldRow>
        <p className="map-hint">{preview.creator} · <a href={preview.sourceUrl} target="_blank" rel="noreferrer noopener">View on Pixabay</a> · <a href="https://pixabay.com/service/license-summary/" target="_blank" rel="noreferrer noopener">Content license</a></p>
        <p className="map-hint">Imports save a copy in this project. For green-screen footage, select the imported asset and enable Remove background color in Properties.</p>
        {problem && <p role="alert" className="map-asset-problem">{problem}</p>}
      </div>}
    </Dialog>
  </div>;
}
