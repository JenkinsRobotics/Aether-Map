// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SceneProperties } from './SceneProperties';
import { emptyShow } from '../document';
afterEach(cleanup);

it('sets and clears the function key that switches a player to this scene', () => {
  const show = emptyShow(), onPatch = vi.fn();
  render(<SceneProperties show={show} scene={show.scenes[0]} onPatch={onPatch} onDelete={vi.fn()} />);
  const field = screen.getByRole('combobox', { name: 'Scene hotkey' });
  fireEvent.change(field, { target: { value: 'F3' } });
  expect(onPatch).toHaveBeenLastCalledWith(show.scenes[0].id, { hotkey: 'F3' });
  fireEvent.change(field, { target: { value: '' } });
  expect(onPatch).toHaveBeenLastCalledWith(show.scenes[0].id, { hotkey: undefined });
});
