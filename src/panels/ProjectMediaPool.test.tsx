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
  fireEvent.click(screen.getByRole('button', { name: 'Thumbnail view' }));
  expect(screen.getByRole('region', { name: 'Media pool' }).getAttribute('data-view')).toBe('gallery');
});

it('right-click on empty space offers New clip, New bin, Import media, Open gallery and View', () => {
  const a = actions();
  render(<Host a={a} />);
  fireEvent.contextMenu(screen.getByRole('list', { name: 'Media pool items' }));
  for (const name of [/New clip/, /New bin/, /Import media/, /Open gallery/, /View/]) expect(screen.getByRole('menuitem', { name })).toBeTruthy();
  fireEvent.click(screen.getByRole('menuitem', { name: /Import media/ }));
  expect(a.onImport).toHaveBeenCalledWith(undefined);
});

it('New bin adds a bin, and opening a bin imports into it', () => {
  const a = actions();
  render(<Host a={a} />);
  fireEvent.contextMenu(screen.getByRole('list', { name: 'Media pool items' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /New bin/ }));
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
