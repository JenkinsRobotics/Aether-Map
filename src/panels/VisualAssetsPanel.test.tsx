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
