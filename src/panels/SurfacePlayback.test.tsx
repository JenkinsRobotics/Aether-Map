// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyShow, newSurface } from '../document';
import { assignClip, createClip, ensureSurfaceTracks, surfaceTrack } from '../compound-clips';
import { MAIN_TIMELINE } from '../timelines';
import { SurfacePlayback } from './SurfacePlayback';

afterEach(cleanup);

function wall() {
  let show = emptyShow();
  const surface = { ...newSurface(show.output, 0), id: 'wall', name: 'Wall' };
  show.scenes[0].surfaces = [surface];
  show = createClip(show, 'Card'); const card = show.activeClipID!;
  show = createClip(show, 'Snow'); const snow = show.activeClipID!;
  show = { ...show, timelines: show.timelines!.map(t => ({ ...t, durationS: 10 })) };
  show = ensureSurfaceTracks(show, MAIN_TIMELINE);
  const track = surfaceTrack(show, MAIN_TIMELINE, 'wall')!.id;
  show = assignClip(show, card, track, 0);
  show = assignClip(show, snow, track, 10);
  return { show, surface, card };
}

it('shows now and next for the surface', () => {
  const { show, surface } = wall();
  render(<SurfacePlayback show={show} sceneTimelineID={MAIN_TIMELINE} surface={surface} timeS={4} onChange={vi.fn()} onOpenClip={vi.fn()} />);
  expect(document.body.textContent).toContain('Now playingCard');
  expect(document.body.textContent).toContain('NextSnow');
});

it('transition writes transitionS and Open clip in Content opens it', () => {
  const { show, surface, card } = wall();
  const onChange = vi.fn(), onOpenClip = vi.fn();
  render(<SurfacePlayback show={show} sceneTimelineID={MAIN_TIMELINE} surface={surface} timeS={4} onChange={onChange} onOpenClip={onOpenClip} />);
  const field = screen.getByLabelText('Transition') as HTMLInputElement;
  fireEvent.change(field, { target: { value: '2' } }); fireEvent.keyDown(field, { key: 'Enter' }); fireEvent.blur(field);
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ timelineRefID: card, transitionS: 2 }));
  fireEvent.click(screen.getByRole('button', { name: 'Open clip in Content' }));
  expect(onOpenClip).toHaveBeenCalledWith(card);
});
