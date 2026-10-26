// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { carryLeftSidebar } from './carry-left-sidebar';
afterEach(() => localStorage.clear());
const saved = (key: string) => JSON.parse(localStorage.getItem(key)!).layouts.docked;
const aux = ['comments', 'files'];

it('carries the left aux panels and pinned panel into the next room, keeping its own right side', () => {
  localStorage.setItem('a', JSON.stringify({ version: 1, layouts: { docked: { files: { placement: 'docked' }, layers: { placement: 'hidden' } } } }));
  localStorage.setItem('b', JSON.stringify({ version: 1, layouts: { docked: { comments: { placement: 'docked' }, 'show-outputs': { placement: 'docked' }, properties: { placement: 'docked' } } } }));
  carryLeftSidebar({ key: 'a', pinned: 'layers' }, { key: 'b', pinned: 'show-outputs' }, 'docked', aux);
  expect(saved('b')).toEqual({ comments: { placement: 'hidden' }, files: { placement: 'docked' }, 'show-outputs': { placement: 'hidden' }, properties: { placement: 'docked' } });
});

it('seeds a room that has no saved layout, and leaves it alone when the old room has none', () => {
  carryLeftSidebar({ key: 'a', pinned: 'layers' }, { key: 'b', pinned: 'layers' }, 'docked', aux);
  expect(localStorage.getItem('b')).toBeNull();
  localStorage.setItem('a', JSON.stringify({ version: 1, layouts: { docked: { comments: { placement: 'docked' } } } }));
  carryLeftSidebar({ key: 'a', pinned: 'layers' }, { key: 'b', pinned: 'layers' }, 'docked', aux);
  expect(saved('b')).toEqual({ comments: { placement: 'docked' }, files: { placement: 'hidden' }, layers: { placement: 'hidden' } });
});
