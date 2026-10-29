// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WebWindowMedia } from './WebWindowMedia';
let posted: unknown[] = [];
const parent = { postMessage: (message: unknown) => { posted.push(message); } };
beforeEach(() => { posted = []; vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); history.replaceState(null, '', '/'); });
const rect = { x: 100.4, y: 50, width: 480, height: 270, top: 50, left: 100.4, right: 580.4, bottom: 320, toJSON() {} };

it('tells the player where its window goes when it plays on a player, and closes it when removed', () => {
  history.replaceState(null, '', '/index.html?output=1'); vi.stubGlobal('parent', parent);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
  const view = render(<WebWindowMedia url="https://www.disneyplus.com/" style={{}} />);
  expect(posted).toEqual([{ aetherWebWindow: { url: 'https://www.disneyplus.com/', x: 100, y: 50, width: 480, height: 270 } }]);
  vi.advanceTimersByTime(5000); expect(posted).toHaveLength(2);
  view.unmount(); expect(posted.at(-1)).toEqual({ aetherWebWindow: null });
});

it('shows only a labelled placeholder in the editor', () => {
  vi.stubGlobal('parent', parent);
  render(<WebWindowMedia url="https://www.disneyplus.com/" style={{}} placeholder />);
  expect(screen.getByText('Web window · www.disneyplus.com')).toBeTruthy(); expect(posted).toEqual([]);
});
