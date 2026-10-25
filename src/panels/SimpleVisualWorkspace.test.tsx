// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SimpleVisualWorkspace } from './SimpleVisualWorkspace';
import { VisualInspector } from './VisualInspector';
import { VisualProperties } from './VisualProperties';
import { emptyShow, newSurface, type MapShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual, moveSimpleVisual, simpleVisuals } from '../simple-visuals';
import { duplicateVisual } from '../visual-document';
vi.mock('../features/ShaderThumbnail', () => ({ ShaderThumbnail: () => <span /> }));
vi.mock('./ShowPreview', () => ({ ShowPreview: ({ placement }: { placement?: unknown }) => <div data-placement={placement ? 'on' : 'off'}>Scene pixels</div> }));
vi.mock('./InputPreview', () => ({ InputPreview: () => <div>Source pixels</div> }));
afterEach(cleanup);
const white = (show: MapShow, name = 'White') => addSimpleVisual(show, { mediaId: null, rect: [0, 0, 100, 100], fill: '#fff' }, name);
// The shared Properties (both editors) plus the sidebar's Effects tab.
function Harness({ seed, timelines = false, onReplace = vi.fn() }: { seed: MapShow; timelines?: boolean; onReplace?: () => void }) {
  const [show, setShow] = useState(seed), [id, setID] = useState(seed.visuals!.at(-1)!.id);
  const visual = show.visuals!.find(v => v.id === id) ?? show.visuals!.at(-1);
  const change = (v: typeof visual) => setShow(s => ({ ...s, visuals: s.visuals!.map(old => old.id === v!.id ? v! : old) }));
  return <>{visual && <><VisualInspector show={show} visual={visual} timelines={timelines} onChange={change} onReplace={onReplace} onPickMedia={vi.fn()}
      onDuplicate={() => setShow(s => duplicateVisual(s, visual.id))} onMove={d => setShow(s => moveSimpleVisual(s, visual.id, d))}
      onRemove={() => setShow(s => ({ ...s, visuals: s.visuals!.filter(old => old.id !== visual.id) }))} />
    <VisualProperties only="effects" visual={visual} show={show} onChange={change} onPickMedia={vi.fn()} onDuplicate={vi.fn()} onMove={vi.fn()} /></>}
    <ul aria-label="Order">{[...simpleVisuals(show)].reverse().map(v => <li key={v.id}><button onClick={() => setID(v.id)}>Select {v.name}</button></li>)}</ul>
    <output data-testid="document">{JSON.stringify(show)}</output></>;
}
const value = () => JSON.parse(screen.getByTestId('document').textContent!) as MapShow;
const menu = (item: string) => {
  fireEvent.click(within(screen.getByRole('region', { name: 'Layer properties' })).getByRole('button', { name: /^Options for / }));
  fireEvent.click(screen.getByRole('menuitem', { name: item }));
};
test('the ⋮ menu replaces, duplicates, hides and deletes real uses', () => {
  const onReplace = vi.fn();
  render(<Harness seed={white(normalizeDocument(emptyShow()))} onReplace={onReplace} />);
  menu('Replace layer'); expect(onReplace).toHaveBeenCalled();
  menu('Duplicate'); expect(value().visuals).toHaveLength(2);
  menu('Hide layer'); expect(value().visuals!.some(v => v.enabled === false)).toBe(true);
  menu('Delete layer'); expect(value().visuals).toHaveLength(1);
});
test('Properties is plain categories, the same in both editors except timeline timing', () => {
  const seed = white(normalizeDocument(emptyShow()));
  const sections = () => [...document.querySelectorAll('[aria-label="Layer properties"] .aui-inspector-section-heading')].map(s => s.textContent);
  const view = render(<Harness seed={seed} />); const simple = sections();
  expect(simple).toEqual(expect.arrayContaining(['General', 'Surfaces']));
  expect(screen.queryAllByRole('radio', { name: /Adjust|Fit|Shapes/ })).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Add timing' })).toBeNull();
  // Several surfaces: a copy on each, or one picture across them.
  fireEvent.click(screen.getByRole('radio', { name: 'One across all' })); expect(value().visuals![0].mapping).toBe('span');
  view.unmount(); render(<Harness seed={seed} timelines />);
  // Advanced adds only change-over-time sections (motion) and timing.
  expect(sections().filter(name => !/motion/i.test(name ?? ''))).toEqual(simple);
  expect(screen.getByRole('button', { name: 'Add timing' })).toBeTruthy();
});
test('locked visuals disable editing', () => {
  let seed = white(normalizeDocument(emptyShow()));
  seed = { ...seed, tracks: seed.tracks!.map(t => ({ ...t, locked: true })) };
  render(<Harness seed={seed} />);
  fireEvent.click(within(screen.getByRole('region', { name: 'Layer properties' })).getByRole('button', { name: /^Options for / }));
  for (const item of ['Replace layer', 'Delete layer']) expect((screen.getByRole('menuitem', { name: item }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('textbox', { name: 'Asset name' }) as HTMLInputElement).disabled).toBe(true);
});

test('layer order buttons follow front-to-back composition', () => {
  let seed = normalizeDocument(emptyShow());
  for (const name of ['Red', 'Green', 'Blue']) seed = white(seed, name);
  render(<Harness seed={seed} />);
  const order = () => screen.getAllByRole('button', { name: /^Select / }).map(b => b.textContent);
  const disabled = (name: string) => (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;
  expect(order()).toEqual(['Select Blue', 'Select Green', 'Select Red']);
  expect(disabled('Bring to front')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Send to back' }));
  expect(order()).toEqual(['Select Green', 'Select Red', 'Select Blue']);
  expect(disabled('Move backward')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Move forward' }));
  expect(order()).toEqual(['Select Green', 'Select Blue', 'Select Red']);
  fireEvent.click(screen.getByRole('button', { name: 'Bring to front' }));
  expect(order()).toEqual(['Select Blue', 'Select Green', 'Select Red']);
});
test('effects support real ordering, toggling, removal and bounded integer amounts', () => {
  let seed = emptyShow(); seed.scenes[0].surfaces = [newSurface(seed.output, 0)];
  render(<Harness seed={white(normalizeDocument(seed))} />);
  const id = value().visuals!.at(-1)!.id;
  for (const kind of ['tile','kaleido','crt','vintage','fisheye']) {
    fireEvent.change(screen.getByRole('combobox',{name:'Effect type'}),{target:{value:kind}});
    fireEvent.click(screen.getByRole('button',{name:'Add effect'}));
  }
  const effects = () => value().visuals!.find(v => v.id === id)!.effects!;
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
test('the center workspace is the render and transport; empty state opens the gallery', () => {
  const onBrowse = vi.fn();
  render(<SimpleVisualWorkspace show={normalizeDocument(emptyShow())} urls={{}} selectedID={null} timeS={0} playing={false}
    onPlay={vi.fn()} onSeek={vi.fn()} onChange={vi.fn()} onBrowse={onBrowse} />);
  fireEvent.click(screen.getByRole('button', { name: 'Browse visual gallery' })); expect(onBrowse).toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Layer properties' })).toBeNull();
});
test('a clip picked on a surface gets placement handles, like any visual', async () => {
  const { createClip, ensureSurfaceTracks, assignClip, surfaceTrack } = await import('../compound-clips');
  const { MAIN_TIMELINE } = await import('../timelines');
  let show = normalizeDocument(emptyShow());
  show.scenes[0].surfaces = [{ ...newSurface(show.output, 0), id: 'wall' }];
  show = createClip(show, 'Card');
  const clip = show.activeClipID!;
  show = ensureSurfaceTracks(show, MAIN_TIMELINE);
  show = assignClip(show, clip, surfaceTrack(show, MAIN_TIMELINE, 'wall')!.id, 0);
  const use = show.visuals!.find(v => v.timelineRefID === clip)!;
  render(<SimpleVisualWorkspace show={show} urls={{}} selectedID={use.id} timeS={0} playing={false}
    onPlay={vi.fn()} onSeek={vi.fn()} onChange={vi.fn()} onBrowse={vi.fn()} onPlacement={vi.fn()} />);
  expect(screen.getByText('Scene pixels').getAttribute('data-placement')).toBe('on');
});
test("with Input on, a picked clip shows its own board there, and its layers' handles", async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const { createClip, ensureSurfaceTracks, assignClip, surfaceTrack } = await import('../compound-clips');
  const { MAIN_TIMELINE, timelineTracks } = await import('../timelines');
  let show = normalizeDocument(emptyShow());
  show.scenes[0].surfaces = [{ ...newSurface(show.output, 0), id: 'wall' }];
  show = createClip(show, 'Card');
  const clip = show.activeClipID!, track = timelineTracks(show, clip).find(t => t.kind === 'video')!;
  const layer = (id: string, name: string) => ({ ...white(normalizeDocument(emptyShow())).visuals![0], id, name, trackID: track.id, targets: [] });
  show = { ...show, visuals: [...(show.visuals ?? []), layer('back', 'Back'), layer('front', 'Front')] };
  show = ensureSurfaceTracks(show, MAIN_TIMELINE);
  show = assignClip(show, clip, surfaceTrack(show, MAIN_TIMELINE, 'wall')!.id, 0);
  const use = show.visuals!.find(v => v.timelineRefID === clip)!;
  const onPlacement = vi.fn();
  render(<SimpleVisualWorkspace show={show} urls={{}} selectedID={use.id} timeS={0} playing={false} showInput
    onPlay={vi.fn()} onSeek={vi.fn()} onChange={vi.fn()} onBrowse={vi.fn()} onPlacement={onPlacement} />);
  const input = screen.getByRole('region', { name: 'Input' });
  expect(within(input).getByLabelText('Clip board')).toBeTruthy();
  // The front layer is picked first; the picker switches which layer the handles move.
  const picker = within(input).getByRole('combobox', { name: 'Clip layer' }) as HTMLSelectElement;
  expect(picker.value).toBe('front');
  fireEvent.change(picker, { target: { value: 'back' } });
  expect(picker.value).toBe('back');
  expect(within(input).getByLabelText('Move visual')).toBeTruthy();
});
