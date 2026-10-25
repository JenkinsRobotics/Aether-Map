// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyShow, newSurface } from '../document';
import { assignClip, createClip, ensureSurfaceTracks, surfaceTrack } from '../compound-clips';
import { MAIN_TIMELINE } from '../timelines';
import { ClipPoolTree } from './ClipPoolTree';

afterEach(cleanup);

function pool() {
  let show = emptyShow();
  show.scenes[0].surfaces = [{ ...newSurface(show.output, 0), id: 'wall', name: 'Wall' }, { ...newSurface(show.output, 1), id: 'top', name: 'Top' }];
  show = createClip(show, 'Card');
  const card = show.activeClipID!;
  show = createClip(show, 'Spare');
  show = ensureSurfaceTracks(show, MAIN_TIMELINE);
  show = assignClip(show, card, surfaceTrack(show, MAIN_TIMELINE, 'wall')!.id, 0);
  show = assignClip(show, card, surfaceTrack(show, MAIN_TIMELINE, 'top')!.id, 0);
  return { show, card };
}
const actions = () => ({ onSelect: vi.fn(), onCreate: vi.fn(), onRename: vi.fn(), onDuplicate: vi.fn(), onRemove: vi.fn(), onFolder: vi.fn() });

it('lists clips with where they are used', () => {
  const { show } = pool();
  render(<ClipPoolTree show={show} selectedID={null} {...actions()} />);
  expect(screen.getByRole('treeitem', { name: /Card/ }).textContent).toContain('2 surfaces');
  expect(screen.getByRole('treeitem', { name: /Spare/ }).textContent).toContain('unused');
});

it('right-click offers New clip, New folder, Rename, Duplicate, Delete', () => {
  const { show } = pool();
  render(<ClipPoolTree show={show} selectedID={null} {...actions()} />);
  fireEvent.contextMenu(screen.getByRole('treeitem', { name: /Spare/ }));
  for (const name of ['New clip', 'New folder', 'Rename clip', 'Duplicate clip', 'Delete clip']) expect(screen.getByRole('menuitem', { name: new RegExp(name) })).toBeTruthy();
});

it('delete is disabled for a clip in use', () => {
  const { show } = pool();
  render(<ClipPoolTree show={show} selectedID={null} {...actions()} />);
  fireEvent.contextMenu(screen.getByRole('treeitem', { name: /Card/ }));
  const item = screen.getByRole('menuitem', { name: /Delete clip/ });
  expect(item.hasAttribute('disabled') || item.getAttribute('aria-disabled') === 'true').toBe(true);
});
