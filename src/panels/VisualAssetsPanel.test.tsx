// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyShow } from '../document';
import { addSimpleVisual } from '../simple-visuals';
import { VisualAssetsPanel } from './VisualAssetsPanel';

afterEach(cleanup);

const show = () => addSimpleVisual(emptyShow(), { kind: 'colour', color: '#ff0000' } as never, 'Red');
const props = () => ({ selectedID: null, onSelect: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(), onDuplicate: vi.fn(), onMove: vi.fn(), onDrop: vi.fn(), onAdd: vi.fn(), onView: vi.fn(), ariaLabel: 'Visuals', addLabel: 'Add layer' });
const menuLabels = () => screen.getAllByRole('menuitem').concat(screen.queryAllByRole('menuitemradio')).map(item => item.textContent?.replace(/\s+/g, ' ').trim());

for (const view of ['cards', 'tree'] as const) {
  it(`${view}: right-click on a visual offers its controls, Add layer and View`, () => {
    const p = props();
    render(<VisualAssetsPanel show={show()} {...p} view={view} />);
    const row = view === 'cards' ? screen.getByRole('button', { name: 'Select Red' }) : screen.getByRole('treeitem', { name: /Red/ });
    fireEvent.contextMenu(row);
    const labels = menuLabels();
    for (const name of ['Rename asset', 'Duplicate asset', 'Delete asset', 'Add layer', 'View']) expect(labels.some(l => l?.startsWith(name))).toBe(true);
  });

  it(`${view}: right-click on empty space offers Add layer and View, and View switches`, () => {
    const p = props();
    const { container } = render(<VisualAssetsPanel show={show()} {...p} view={view} />);
    fireEvent.contextMenu(container.querySelector('.map-tree-context-area')!);
    expect(screen.getByRole('menuitem', { name: /Add layer/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /View/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: view === 'cards' ? /List/ : /Cards/ }));
    expect(p.onView).toHaveBeenCalledWith(view === 'cards' ? 'tree' : 'cards');
  });
}

const two = () => addSimpleVisual(show(), { kind: 'colour', color: '#0000ff' } as never, 'Blue');

it('cards: Ctrl-click picks several, and their menu deletes them all at once', () => {
  const p = { ...props(), onRemoveMany: vi.fn() };
  const s = two();
  render(<VisualAssetsPanel show={s} {...p} view="cards" />);
  fireEvent.click(screen.getByRole('button', { name: 'Select Red' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select Blue' }), { ctrlKey: true });
  expect(screen.getByRole('button', { name: 'Select Red' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Select Blue' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Select Blue' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Delete 2 assets/ }));
  expect(new Set(p.onRemoveMany.mock.calls[0][0])).toEqual(new Set(s.visuals!.map(v => v.id)));
});

it('tree: Ctrl-click picks several, and Delete removes them all at once', () => {
  const p = { ...props(), onRemoveMany: vi.fn() };
  const s = two();
  render(<VisualAssetsPanel show={s} {...p} view="tree" />);
  fireEvent.click(screen.getByRole('treeitem', { name: /Red/ }));
  fireEvent.click(screen.getByRole('treeitem', { name: /Blue/ }), { ctrlKey: true });
  expect(screen.getAllByRole('treeitem').filter(r => r.getAttribute('aria-selected') === 'true')).toHaveLength(2);
  fireEvent.keyDown(screen.getByRole('treeitem', { name: /Blue/ }), { key: 'Delete' });
  expect(new Set(p.onRemoveMany.mock.calls[0][0])).toEqual(new Set(s.visuals!.map(v => v.id)));
});
