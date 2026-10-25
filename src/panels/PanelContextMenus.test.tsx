// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApplicationContextMenu } from '@aether/ui/ApplicationContextMenu';
import { emptyShow } from '../document';
import { OutputsPanel } from './OutputsPanel';
import { LayersPanel, type LayersPanelProps } from './LayersPanel';
import { TreeContextArea } from './TreeContextArea';

vi.mock('../use-map-devices', () => ({ useMapDevices: () => ({ list: [], online: () => false }) }));
vi.mock('../export-video', () => ({ useRecording: () => ({ recording: false }), startRecording: vi.fn(), stopRecording: vi.fn() }));
afterEach(cleanup);

function background(name: string) {
  return screen.getByRole('tree', { name }).closest('.aui-tree-panel')!.querySelector('.aui-tree-panel-content')!;
}

it('output background retains creation, device and recording controls under the shared menu policy', () => {
  const add = vi.fn(), devices = vi.fn();
  render(<><ApplicationContextMenu name="Map" /><OutputsPanel show={emptyShow()} selectedID={null} displays={{}} documentID={null}
    onSelect={vi.fn()} onAdd={add} onPatch={vi.fn()} onDelete={vi.fn()} onOpen={vi.fn()} onClose={vi.fn()} onDevices={devices} showName="Test" /></>);
  fireEvent.contextMenu(background('Outputs'));
  expect(screen.getAllByRole('menuitem', { name: 'New output' })).toHaveLength(1);
  expect(screen.getByRole('menuitem', { name: 'Record the output to a file' })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: /Undo|Redo|settings/ })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Devices' }));
  expect(devices).toHaveBeenCalledOnce();
  fireEvent.contextMenu(background('Outputs'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'New output' }));
  expect(add).toHaveBeenCalledOnce();
});

it('layer background offers all creation choices and controlled tree filtering', () => {
  const props: LayersPanelProps = {
    show: emptyShow(), selectedID: null, selectedLayerIDs: [], selectedClipID: null,
    onTreeEdit: vi.fn(), onSelectLayers: vi.fn(), onSelectAsset: vi.fn(), onEditAsset: vi.fn(),
    onChangeAsset: vi.fn(), onDeleteAsset: vi.fn(), onDuplicateAsset: vi.fn(), onMoveAsset: vi.fn(), onDropAsset: vi.fn(),
    onSelect: vi.fn(), onPatch: vi.fn(), onReorder: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), onEdit: vi.fn(), onAdd: vi.fn(),
    onSetFolder: vi.fn(), onRenameFolder: vi.fn(), onDissolveFolder: vi.fn(), onNewFolder: vi.fn(),
    scenes: { select: vi.fn(), add: vi.fn(), duplicate: vi.fn(), delete: vi.fn(), move: vi.fn(), patch: vi.fn(), addPreset: vi.fn(), openProperties: vi.fn(), openPresets: vi.fn() },
  };
  render(<><ApplicationContextMenu name="Map" /><LayersPanel {...props} /></>);
  fireEvent.contextMenu(background('Layers'));
  for (const name of ['New Surface', 'New canvas', 'New folder', 'Add a ready-made canvas', 'Show in tree']) {
    expect(screen.getAllByRole('menuitem', { name })).toHaveLength(1);
  }
  expect(screen.queryByRole('menuitem', { name: /Undo|Redo|settings/ })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'New canvas' }));
  expect(props.scenes.openProperties).toHaveBeenCalledExactlyOnceWith(null);
  fireEvent.contextMenu(background('Layers'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'New folder' }));
  expect(props.onTreeEdit).toHaveBeenCalledOnce();
});

it('outer card menus preserve editable fields and do not replace child item menus', () => {
  const select = vi.fn();
  render(<TreeContextArea label="Cards" items={[{ id: 'add', label: 'Add card' }]} onSelect={select}>
    <input aria-label="Card name" /><ul><li>Existing card</li></ul>
  </TreeContextArea>);
  expect(fireEvent.contextMenu(screen.getByRole('textbox'))).toBe(true);
  fireEvent.contextMenu(screen.getByRole('listitem'));
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.contextMenu(screen.getByRole('list'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Add card' }));
  expect(select).toHaveBeenCalledExactlyOnceWith('add');
});
