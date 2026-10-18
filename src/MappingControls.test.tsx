// @vitest-environment jsdom
import { render, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { MappingControls } from './MappingControls';
import { emptyShow } from './document';
import { cubeSurfaces } from './features/shape-groups';
import { folderID } from './scene-tree';
import { DEFAULT_MAPPING_PREFERENCES } from './mapping-preferences';

test('one locked member prevents partial reflection of a compound', () => {
  const show = emptyShow(); show.scenes[0].surfaces = cubeSurfaces(show.output, 0);
  show.scenes[0].surfaces[1].locked = true;
  const onGeometry = vi.fn();
  const view = render(<MappingControls show={show} selectedID={folderID(show.activeSceneId, 'Cube')}
    handle={null} preferences={DEFAULT_MAPPING_PREFERENCES} onPreferences={() => {}} onGeometry={onGeometry} onRound={() => {}} />);
  const flip = view.getByRole('button', { name: 'Flip horizontal' });
  expect((flip as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(flip); expect(onGeometry).not.toHaveBeenCalled();
});

test('a point from another surface cannot round the current selection', () => {
  const show = emptyShow(); show.scenes[0].surfaces = cubeSurfaces(show.output, 0);
  const [first, second] = show.scenes[0].surfaces;
  const view = render(<MappingControls show={show} selectedID={first.id}
    handle={{ surfaceID: second.id, kind: 'mask', shape: 0, index: 0 }}
    preferences={DEFAULT_MAPPING_PREFERENCES} onPreferences={() => {}} onGeometry={() => {}} onRound={() => {}} />);
  expect(view.queryByRole('button', { name: 'Round selected point' })).toBeNull();
});
