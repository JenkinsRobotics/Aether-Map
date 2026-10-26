// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { emptyShow, type MapShow } from '../document';
import { createClip } from '../compound-clips';
import { addPoolAsset } from '../media-pool';
import { addBin } from '../media-bins';
import { ProjectMediaPool } from './ProjectMediaPool';

afterEach(() => { cleanup(); localStorage.clear(); });

const start = () => addBin(addPoolAsset(createClip(emptyShow(), 'Clip 1'), { mediaId: null, rect: [0, 0, 10, 10], fill: '#f00' }, 'Red'), 'Footage');
const actions = () => ({ onPick: vi.fn(), onOpenClip: vi.fn(), onNewClip: vi.fn(), onImport: vi.fn(), onGallery: vi.fn(), onRemoveClip: vi.fn() });
function Host({ a, initial = start() }: { a: ReturnType<typeof actions>; initial?: MapShow }) {
  const [show, setShow] = useState(initial);
  return <ProjectMediaPool show={show} urls={{}} edit={fn => setShow(fn)} {...a} />;
}
const items = () => within(screen.getByRole('list', { name: 'Media pool items' }));

it('lists the project media and clips with its bins, in list or thumbnails', () => {
  render(<Host a={actions()} />);
  expect(items().getByRole('button', { name: /^Red/ })).toBeTruthy();
  expect(items().getByRole('button', { name: /^Clip 1/ })).toBeTruthy();
  expect(items().getByRole('button', { name: /^Footage/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Media view' }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Thumbnails' }));
  expect(screen.getByRole('region', { name: 'Media pool' }).getAttribute('data-view')).toBe('gallery');
});

it('right-click on empty space offers New clip, New folder, Import media, Add from gallery and View', () => {
  const a = actions();
  render(<Host a={a} />);
  fireEvent.contextMenu(screen.getByRole('list', { name: 'Media pool items' }));
  for (const name of [/New clip/, /New folder/, /Import media/, /Add from gallery/, /View/]) expect(screen.getByRole('menuitem', { name })).toBeTruthy();
  fireEvent.click(screen.getByRole('menuitem', { name: /Import media/ }));
  expect(a.onImport).toHaveBeenCalledWith(undefined);
});

it('New folder adds a bin, and opening a bin imports into it', () => {
  const a = actions();
  render(<Host a={a} />);
  fireEvent.contextMenu(screen.getByRole('list', { name: 'Media pool items' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /New folder/ }));
  expect(items().getByRole('button', { name: /^Bin 1/ })).toBeTruthy();
  fireEvent.click(items().getByRole('button', { name: /^Footage/ }));
  expect(screen.getByText('Footage', { selector: '[aria-current="page"]' })).toBeTruthy();
  fireEvent.contextMenu(screen.getByRole('list', { name: 'Media pool items' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Import media/ }));
  expect(a.onImport).toHaveBeenCalledWith('Footage');
});

it('Ctrl-click picks several; their menu moves them into a bin together', () => {
  render(<Host a={actions()} />);
  fireEvent.click(items().getByRole('button', { name: /^Red/ }));
  fireEvent.click(items().getByRole('button', { name: /^Clip 1/ }), { ctrlKey: true });
  fireEvent.contextMenu(items().getByRole('button', { name: /^Clip 1/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Move 2 items to bin/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Footage' }));
  expect(items().queryByRole('button', { name: /^Red/ })).toBeNull();
  fireEvent.click(items().getByRole('button', { name: /^Footage/ }));
  expect(items().getByRole('button', { name: /^Red/ })).toBeTruthy();
  expect(items().getByRole('button', { name: /^Clip 1/ })).toBeTruthy();
});

it('a clip opens in Content on double-click and from its menu; an asset duplicates', () => {
  const a = actions();
  render(<Host a={a} />);
  fireEvent.doubleClick(items().getByRole('button', { name: /^Clip 1/ }));
  expect(a.onOpenClip).toHaveBeenCalledTimes(1);
  fireEvent.contextMenu(items().getByRole('button', { name: /^Red/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Duplicate/ }));
  expect(items().getByRole('button', { name: /^Red copy/ })).toBeTruthy();
});

it('has the Comments widget tabs: Media pool, and Browse for what can be imported', () => {
  const a = actions();
  const Browse = () => <p>Online library</p>;
  const { container } = render(<ProjectMediaPool show={start()} urls={{}} edit={() => {}} {...a} browse={<Browse />} />);
  const tabs = screen.getByRole('radiogroup', { name: 'Media tabs' });
  expect(container.querySelector('.ps-review-conversation-tabs')).toBe(tabs);
  expect(screen.getByRole('region', { name: 'Media pool' })).toBeTruthy();
  expect(screen.queryByText('Online library')).toBeNull();
  fireEvent.click(within(tabs).getByRole('radio', { name: /Browse/ }));
  expect(screen.getByText('Online library')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Media pool' })).toBeNull();
});


it('media and bin row menus match their ellipsis, preserve native text and run keyboard commands', () => {
  render(<Host a={actions()}/>);
  for (const name of ['Red','Footage']) {
    fireEvent.contextMenu(items().getByRole('button',{name:new RegExp('^'+name)}));
    const labels = screen.getAllByRole('menuitem').map(item=>item.textContent);
    expect(screen.queryByRole('menuitem',{name:/^View|^Sort by|Undo|Redo|settings/})).toBeNull();
    fireEvent.keyDown(document,{key:'Escape'});
    fireEvent.click(screen.getByRole('button',{name:'Options for '+name}));
    expect(screen.getAllByRole('menuitem').map(item=>item.textContent)).toEqual(labels);
    fireEvent.keyDown(document,{key:'Escape'});
  }
  const red = items().getByRole('button',{name:/^Red/});
  fireEvent.click(red); fireEvent.keyDown(red,{key:'F2'});
  const rename = screen.getByRole('textbox',{name:'Rename Red'});
  expect(fireEvent.contextMenu(rename)).toBe(true);
  fireEvent.change(rename,{target:{value:'Crimson'}}); fireEvent.keyDown(rename,{key:'Enter'});
  const crimson = items().getByRole('button',{name:/^Crimson/});
  fireEvent.keyDown(crimson,{key:'Backspace'});
  expect(items().queryByRole('button',{name:/^Crimson/})).toBeNull();
});

// Files › This show: CAD's design contents — the document's shows and scenes head the pool.
it('lists, opens, creates and renames the shows and scenes it is given', () => {
  const documents = { entries: [{ id: 'show:s1', label: 'Show 1', kind: 'show' as const, icon: <span /> }, { id: 'scene:main', label: 'Main', kind: 'scene' as const, icon: <span /> }],
    activeID: 'scene:main', onOpen: vi.fn(), onCreate: vi.fn(), onRename: vi.fn() };
  render(<ProjectMediaPool show={start()} urls={{}} edit={() => {}} {...actions()} documents={documents} rootLabel="DEMO" />);
  expect(screen.getByRole('button', { name: 'DEMO' })).toBeTruthy();
  expect(items().getByRole('button', { name: /^Main/ }).getAttribute('aria-current')).toBe('page');
  fireEvent.click(items().getByRole('button', { name: /^Show 1/ }));
  expect(documents.onOpen).toHaveBeenCalledWith(documents.entries[0]);
  fireEvent.contextMenu(screen.getByRole('list', { name: 'Media pool items' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /New scene/ }));
  expect(documents.onCreate).toHaveBeenCalledWith('scene');
  fireEvent.contextMenu(items().getByRole('button', { name: /^Main/ }));
  expect((screen.getByRole('menuitem', { name: /Rename/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  fireEvent.doubleClick(items().getByRole('button', { name: /^Show 1/ }));
  const field = screen.getByRole('textbox', { name: 'Rename Show 1' });
  fireEvent.keyDown(field, { key: 'Enter', target: { value: 'Opening' } });
  expect(documents.onRename).toHaveBeenCalledWith(documents.entries[0], 'Opening');
});
