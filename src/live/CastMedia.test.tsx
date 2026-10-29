// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CastMedia } from './CastMedia';
import { setCastStream } from './casts';
afterEach(() => { cleanup(); setCastStream(null); });

const handOver = (stream: MediaStream | null) => (window as unknown as { aetherCast: (s: MediaStream | null) => boolean }).aetherCast(stream);
it('tells the player whether any Cast surface is showing, so it can fall back to full screen', () => {
  expect(handOver({} as MediaStream)).toBe(false);
  const view = render(<CastMedia style={{}} />);
  expect(handOver({} as MediaStream)).toBe(true);
  view.unmount(); expect(handOver({} as MediaStream)).toBe(false);
});
it('shows the current cast and its placeholder when none arrives', () => {
  render(<CastMedia style={{}} placeholder />);
  const video = document.querySelector('video')!;
  expect(video.srcObject).toBeNull(); expect(screen.getByText('Waiting for a cast')).toBeTruthy();
  const stream = {} as MediaStream;
  act(() => { handOver(stream); });
  expect(video.srcObject).toBe(stream); expect(screen.queryByText('Waiting for a cast')).toBeNull();
  act(() => setCastStream(null));
  expect(video.srcObject).toBeNull();
});
