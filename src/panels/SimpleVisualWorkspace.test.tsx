// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { SimpleVisualWorkspace } from './SimpleVisualWorkspace';
import { emptyShow, newSurface, type MapShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual, replaceSimpleVisual, moveSimpleVisual } from '../simple-visuals';
import { BUNDLED_LOOPS } from '../features/bundled-loops';
import { duplicateVisual } from '../visual-document';
vi.mock('../features/ShaderThumbnail', () => ({ ShaderThumbnail: () => <span /> }));
vi.mock('./ShowPreview', () => ({ ShowPreview: () => <div>Scene pixels</div> }));
vi.mock('./InputPreview', () => ({ InputPreview: () => <div>Source pixels</div> }));
vi.mock('./VisualGallery', () => ({ VisualGallery: (p: { onChoose: (v: unknown) => void; onClose: () => void; onImport: () => void; onChooseLoop?:(file:File,loop:typeof BUNDLED_LOOPS[number])=>Promise<boolean> }) => <div><button onClick={()=>void p.onChooseLoop?.(new File(['video'],'test.mp4'),BUNDLED_LOOPS[0])}>Choose loop</button><button onClick={() => { p.onChoose({ name: 'Neon', shader: { preset: 'neon-beams', parameters: {}, colors: ['#fff'], time: { speed: 1 } } }); p.onClose(); }}>Choose neon</button><button onClick={p.onImport}>Import a visual</button><button onClick={p.onClose}>Cancel gallery</button></div> }));
afterEach(cleanup);
function Harness({ seed, onAdvanced = vi.fn(), onImport = vi.fn(), onLoop = vi.fn().mockResolvedValue(true) }: { onLoop?: (file:File,loop:typeof BUNDLED_LOOPS[number],id?:string)=>Promise<boolean>; seed?: MapShow; onAdvanced?: () => void; onImport?: (id?: string) => void }) {
  const [show, setShow] = useState(seed ?? normalizeDocument(emptyShow())), [id, setID] = useState<string | null>(null);
  return <><SimpleVisualWorkspace show={show} urls={{}} selectedID={id} timeS={0} playing={false} onPlay={vi.fn()} onSeek={vi.fn()}
    onSelect={setID} onScene={scene => setShow(s => ({ ...s, activeSceneId: scene }))} onMapping={vi.fn()} onAdvanced={onAdvanced} onImport={onImport} onLoop={onLoop}
    onAdd={(source, name, pool) => setShow(s => addSimpleVisual(s, source, name, pool))}
    onReplace={(id, source, name) => setShow(s => replaceSimpleVisual(s, id, source, name))}
    onChange={v => setShow(s => ({ ...s, visuals: s.visuals!.map(old => old.id === v.id ? v : old) }))}
    onDuplicate={v => setShow(s => duplicateVisual(s, v.id))} onMove={(v, d) => setShow(s => moveSimpleVisual(s, v.id, d))}
    onRemove={v => setShow(s => ({ ...s, visuals: s.visuals!.filter(old => old.id !== v.id) }))}/><output data-testid="document">{JSON.stringify(show)}</output></>;
}
const value = () => JSON.parse(screen.getByTestId('document').textContent!) as MapShow;
test('gallery inserts a continuous visual and Shapes actions duplicate, hide and delete real uses', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Add visual' }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose neon' }));
  expect(value().visuals).toHaveLength(1); expect(value().visuals![0].continuous).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
  expect(value().visuals).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Hide visual' }));
  expect(value().visuals!.at(-1)!.enabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Delete visual' }));
  expect(value().visuals).toHaveLength(1);
});
test('assignment and effect edits use the same saved visual; entering advanced does not change it', () => {
  let seed = emptyShow(); seed.scenes[0].surfaces = [newSurface(seed.output, 0)];
  seed = addSimpleVisual(normalizeDocument(seed), { mediaId: null, rect: [0, 0, 100, 100], fill: '#fff' }, 'White');
  const onAdvanced = vi.fn(); render(<Harness seed={seed} onAdvanced={onAdvanced} />);
  const visual = value().visuals!.at(-1)!;
  fireEvent.click(screen.getByRole('button', { name: `Assign to ${seed.scenes[0].surfaces[0].name}` }));
  expect(value().visuals!.at(-1)!.targets).toEqual([]);
  fireEvent.click(screen.getByRole('tab', { name: 'Effects' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add effect' }));
  expect(value().visuals!.at(-1)!.effects?.[0].kind).toBe('blur');
  expect(value().visuals!.at(-1)!.id).toBe(visual.id);
  const before = value(); fireEvent.click(screen.getByRole('button', { name: 'Advanced editor' }));
  expect(onAdvanced).toHaveBeenCalledOnce(); expect(value()).toEqual(before);
});
test('canceling replacement preserves the visual and locked tracks disable editing', () => {
  let seed = addSimpleVisual(normalizeDocument(emptyShow()), { mediaId: null, rect: [0, 0, 100, 100], fill: '#fff' }, 'White');
  const view = render(<Harness seed={seed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Replace visual' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel gallery' })); expect(value()).toEqual(seed);
  view.unmount(); seed = { ...seed, tracks: seed.tracks!.map(t => ({ ...t, locked: true })) };
  render(<Harness seed={seed} />);
  expect((screen.getByRole('button', { name: 'Replace visual' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Delete visual' }) as HTMLButtonElement).disabled).toBe(true);
  const assignments = screen.getByRole('group', { name: 'Asset surface assignments' });
  expect((within(assignments).getByRole('button') as HTMLButtonElement).disabled).toBe(true);
});

test('layer controls stay visible across inspector tabs and the rail follows front-to-back composition', () => {
  let seed = normalizeDocument(emptyShow());
  for (const name of ['Red', 'Green', 'Blue']) seed = addSimpleVisual(seed, { mediaId: null, rect: [0, 0, 100, 100], fill: '#fff' }, name);
  render(<Harness seed={seed} />);
  const rail = screen.getByRole('group', { name: 'Layers, front to back' });
  const order = () => within(rail).getAllByRole('button').map(b => b.getAttribute('aria-label'));
  const disabled = (name: string) => (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;
  expect(order()).toEqual(['Select Blue', 'Select Green', 'Select Red']);
  expect(disabled('Bring to front')).toBe(true);
  fireEvent.click(screen.getByRole('tab', { name: 'Effects' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send to back' }));
  expect(order()).toEqual(['Select Green', 'Select Red', 'Select Blue']);
  expect(disabled('Move backward')).toBe(true);
  expect(disabled('Send to back')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Move forward' }));
  expect(order()).toEqual(['Select Green', 'Select Blue', 'Select Red']);
  fireEvent.click(screen.getByRole('button', { name: 'Bring to front' }));
  expect(order()).toEqual(['Select Blue', 'Select Green', 'Select Red']);
  expect(screen.getByRole('tab', { name: 'Effects' }).getAttribute('aria-selected')).toBe('true');
});

test('new effects support real ordering, toggling, removal and bounded integer amounts', () => {
  const seed = addSimpleVisual(normalizeDocument(emptyShow()), { mediaId: null, rect: [0, 0, 100, 100], fill: '#fff' }, 'White');
  render(<Harness seed={seed}/>);
  fireEvent.click(screen.getByRole('tab', {name:'Effects'}));
  for (const kind of ['tile','kaleido','crt','vintage','fisheye']) {
    fireEvent.change(screen.getByRole('combobox',{name:'Effect type'}),{target:{value:kind}});
    fireEvent.click(screen.getByRole('button',{name:'Add effect'}));
  }
  const effects = () => value().visuals!.at(-1)!.effects!;
  expect(effects().map(e=>e.kind)).toEqual(['tile','kaleido','crt','vintage','fisheye']);
  fireEvent.change(screen.getByRole('textbox',{name:'tile amount'}),{target:{value:'3.8'}});
  fireEvent.blur(screen.getByRole('textbox',{name:'tile amount'}));
  expect(effects()[0].amount).toBe(4);
  fireEvent.click(screen.getAllByRole('button',{name:'Move effect down'})[0]);
  expect(effects().slice(0,2).map(e=>e.kind)).toEqual(['kaleido','tile']);
  fireEvent.click(screen.getByRole('checkbox',{name:'CRT'}));
  expect(effects()[2].enabled).toBe(false);
  fireEvent.click(screen.getAllByRole('button',{name:'Remove effect'})[2]);
  expect(effects().map(e=>e.kind)).toEqual(['kaleido','tile','vintage','fisheye']);
});

test('simple video imports distinguish adding from replacing the selected layer',async()=>{
 const onLoop=vi.fn().mockResolvedValue(true);
 const seed=addSimpleVisual(normalizeDocument(emptyShow()),{mediaId:null,rect:[0,0,100,100],fill:'#fff'},'White');
 render(<Harness seed={seed} onLoop={onLoop}/>);
 fireEvent.click(screen.getByRole('button',{name:'Add visual'}));fireEvent.click(screen.getByRole('button',{name:'Choose loop'}));
 await waitFor(()=>expect(onLoop).toHaveBeenCalledWith(expect.any(File),BUNDLED_LOOPS[0],undefined));
 fireEvent.click(screen.getByRole('button',{name:'Cancel gallery'}));
 fireEvent.click(screen.getByRole('button',{name:'Replace visual'}));fireEvent.click(screen.getByRole('button',{name:'Choose loop'}));
 await waitFor(()=>expect(onLoop).toHaveBeenLastCalledWith(expect.any(File),BUNDLED_LOOPS[0],seed.visuals![0].id));
});
