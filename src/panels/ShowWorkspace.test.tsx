// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyShow, newScene, type MapShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { createTimeline } from '../timelines';
import { activeShow, withActiveShow, type ShowTimeline } from '../show-timeline';
import { CueList, CueProperties, SceneClipProperties, ShowPlaybackFields, ShowTimelinePanel, ShowWorkspace } from './ShowWorkspace';
vi.mock('../use-map-devices', () => ({ useMapDevices: () => ({ list: [], online: () => false }) }));
vi.mock('../export-video', () => ({ RECORDING_SIZES: {}, useRecording: () => ({ recording: false, status: '' }), startRecording: vi.fn(), stopRecording: vi.fn() }));
vi.mock('./ShowPreview', () => ({ ShowPreview: () => <div>Canvas pixels</div> }));
vi.mock('./WorkspaceTray', () => ({ ExportWorkspace: () => null }));
afterEach(cleanup);

const seed = () => {
  const show = emptyShow();
  return createTimeline(normalizeDocument({ ...show, scenes: [show.scenes[0], { ...newScene('Tree'), durationS: 30 }] }), 'Ghosts');
};
function Harness({ initial = seed() }: { initial?: MapShow }) {
  const [show, setShow] = useState(initial), [clip, setClip] = useState<string | null>(null), [cue, setCue] = useState<string | null>(null);
  const edit = (change: (t: ShowTimeline) => ShowTimeline) => setShow(s => withActiveShow(s, p => ({ ...p, ...change(p) })));
  const selected = activeShow(show)!.tracks.flatMap(t => t.clips).find(c => c.id === clip);
  const selectedCue = activeShow(show)!.cues.find(c => c.id === cue);
  return <>
    <ShowWorkspace show={show} urls={{}} timeS={10} playing={false} onPlay={vi.fn()} onSeek={vi.fn()} onGo={vi.fn()} onSelectCanvas={vi.fn()} />
    <ShowTimelinePanel show={show} timeS={10} selectedClipID={clip} onSelectClip={setClip} onSeek={vi.fn()} onEdit={edit} />
    {selected && <SceneClipProperties show={show} clip={selected} onEdit={edit} />}
    <CueList show={show} selectedID={cue} onSelect={setCue} onEdit={edit} />
    {selectedCue && <CueProperties cue={selectedCue} onEdit={edit} />}
    <ShowPlaybackFields show={show} onEdit={edit} onPlayback={vi.fn()} />
    <output data-testid="show">{JSON.stringify(activeShow(show))}</output>
  </>;
}
const timeline = () => JSON.parse(screen.getByTestId('show').textContent!) as ShowTimeline;

it('renders every canvas live with the scene on air, and GO waits for a manual cue', () => {
  render(<Harness />);
  const wall = screen.getByRole('list', { name: 'Canvases' });
  expect(within(wall).getAllByRole('listitem')).toHaveLength(2);
  expect(within(wall).getByRole('listitem', { name: /Tree: Main/ })).toBeTruthy();
  expect((screen.getByRole('button', { name: 'GO' }) as HTMLButtonElement).disabled).toBe(true);
});

it('adds a scene clip to a canvas track and edits it in Properties', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Add a scene clip to Tree' }));
  const added = timeline().tracks[1].clips.at(-1)!;
  expect(added.startS).toBe(30);
  fireEvent.pointerDown(screen.getByRole('button', { name: /^Main on Tree at 0:30/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Clip scene' }), { target: { value: timeline().tracks[1].clips[0].sceneID === 'main' ? seed().timelines!.at(-1)!.id : 'main' } });
  expect(timeline().tracks[1].clips.at(-1)!.sceneID).not.toBe('main');
  fireEvent.click(screen.getByRole('button', { name: 'Remove clip' }));
  expect(timeline().tracks[1].clips).toHaveLength(1);
});

it('creates cues with a trigger and an action, and sets the show length', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Create in Cue controls' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'New cue' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Cue trigger' }), { target: { value: 'timeline' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Cue action' }), { target: { value: 'blackout-on' } });
  expect(timeline().cues[0]).toMatchObject({ trigger: 'timeline', action: 'blackout-on' });
  const length = screen.getByRole('textbox', { name: 'Show length' });
  fireEvent.change(length, { target: { value: '120' } }); fireEvent.blur(length);
  expect(timeline().durationS).toBe(120);
});

it('adds show audio from the media library and edits it', () => {
  const show = { ...seed(), media: [{ id: 'song', kind: 'audio' as const, name: 'Song', file: 'song.mp3', bytes: 1, duration: 30, width: 0, height: 0 }] };
  render(<Harness initial={show} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add show audio' }));
  expect(timeline().audio).toEqual([expect.objectContaining({ mediaId: 'song', startS: 0, durationS: 30 })]);
  fireEvent.pointerDown(screen.getByRole('button', { name: /^Audio Song at/ }));
});
