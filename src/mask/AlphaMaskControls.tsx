import { subjectAlphaMask } from './subject';
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, FieldRow, NumberField, TextField } from '@aether/ui';
import type { Surface } from '../document';
import { imageAlphaMask, textAlphaMask, type AlphaMask } from './alpha';
export function AlphaMaskControls({ surface, onPatch, defaultOpen = false, initialMode = 'text' }: { defaultOpen?: boolean; initialMode?: 'text' | 'image' | 'subject'; surface: Surface; onPatch: (id: string, patch: Partial<Surface>) => void }) {
  const [text, setText] = useState(surface.alphaMask?.text ?? 'AETHER'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [removeLight, setRemoveLight] = useState(false), [threshold, setThreshold] = useState(235);
  const [automatic, setAutomatic] = useState(initialMode === 'subject');
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const picker = useRef<HTMLInputElement>(null);
  const apply = async (create: (signal: AbortSignal) => Promise<AlphaMask>) => {
    const id = surface.id, controller = new AbortController(); operation.current?.abort(); operation.current = controller; setBusy(true); setError('');
    try { const alphaMask = await create(controller.signal); if (!controller.signal.aborted) onPatch(id, { alphaMask }); } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); } finally { setBusy(false); }
  };
  return <details className="map-alpha-mask" open={defaultOpen || undefined}><summary>Text and image silhouette</summary>
    <FieldRow label="Text"><TextField aria-label="Mask text" value={text} maxLength={500} onChange={e => setText(e.target.value)} /></FieldRow>
    <Button disabled={busy || surface.locked || !text.trim()} onClick={() => void apply(() => textAlphaMask(text, surface.source.rect[2] / surface.source.rect[3]))}>Use text silhouette</Button>
    <p className="map-hint">Content shows through the letters. The saved mask preserves letter shapes and holes on every output.</p>
    <Checkbox label="Automatically detect image subject" checked={automatic} onChange={e => setAutomatic(e.target.checked)} />
    <Checkbox disabled={automatic} label="Remove a light image background" checked={removeLight} onChange={e => setRemoveLight(e.target.checked)} />
    {removeLight && <FieldRow label="White threshold"><NumberField aria-label="White threshold" value={threshold} min={0} max={255} onValueChange={v => v !== null && setThreshold(v)} /></FieldRow>}
    <input ref={picker} type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void apply(signal => automatic ? subjectAlphaMask(file, signal) : imageAlphaMask(file, removeLight, threshold)); }} />
    <Button disabled={busy || surface.locked} onClick={() => picker.current?.click()}>Import image silhouette</Button>
    <p className="map-hint">Uses transparency by default. Subject detection runs locally and may need manual edge refinement.</p>
    {surface.alphaMask && <Button disabled={busy || surface.locked} onClick={() => onPatch(surface.id, { alphaMask: undefined })}>Remove silhouette</Button>}
    {busy && <><p role="status">Creating mask…</p><Button onClick={() => operation.current?.abort()}>Cancel mask creation</Button></>}{error && <p role="alert">{error}</p>}
  </details>;
}
