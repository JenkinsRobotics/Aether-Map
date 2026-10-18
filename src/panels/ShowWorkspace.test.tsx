// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyShow, newScene, newOutput, type MapShow } from '../document';
import { ShowWorkspace } from './ShowWorkspace';
vi.mock('../use-map-devices', () => ({ useMapDevices: () => ({ list: [] }) }));
vi.mock('../export-video', () => ({ RECORDING_SIZES: {}, useRecording: () => ({ recording: false, status: '' }), startRecording: vi.fn(), stopRecording: vi.fn() }));
vi.mock('./ShowPreview', () => ({ ShowPreview: () => <div>Output preview</div> }));
vi.mock('./DeviceManager', () => ({ DeviceManager: () => null }));
vi.mock('./WorkspaceTray', () => ({ ExportWorkspace: () => null }));
afterEach(cleanup);
function setup(unassigned = false, playing = false) {
  const front = { ...newScene('Front'), durationS: 30 }, lobby = { ...newScene('Lobby'), durationS: 75 };
  const output = newOutput('Projector', lobby.id);
  if (unassigned) delete output.sceneId;
  const show: MapShow = { ...emptyShow(), scenes: [front, lobby], activeSceneId: front.id, outputs: [output] };
  const onPatchScene = vi.fn(), onEdit = vi.fn(), onPlay = vi.fn(), onSeek = vi.fn();
  render(<ShowWorkspace show={show} name="Show" documentID="saved" dirty={false} urls={{}} selectedOutputID={output.id}
    onSelectOutput={vi.fn()} onAddOutput={vi.fn()} onOpenOutput={vi.fn()} onSave={vi.fn()} onExportProject={vi.fn()} onExportWireframe={vi.fn()}
    onEdit={onEdit} onPatchScene={onPatchScene} timeS={0} playing={playing} onPlay={onPlay} onSeek={onSeek}/>);
  return { show, front, lobby, onPatchScene, onEdit, onPlay, onSeek };
}
describe('Show playback rules', () => {
  it('edits the selected output scene even when another scene was being authored', () => {
    const { lobby, onPatchScene } = setup();
    expect((screen.getByLabelText('Playback scene') as HTMLSelectElement).value).toBe(lobby.id);
    const length = screen.getByLabelText('Main show length');
    expect((length as HTMLInputElement).value).toBe('75');
    fireEvent.change(length, { target: { value: '90' } });
    fireEvent.blur(length);
    expect(onPatchScene).toHaveBeenCalledWith(lobby.id, { durationS: 90 });
    expect(screen.getByLabelText('Rehearsal position').getAttribute('max')).toBe('75');
  });
  it('changes the output assignment without changing the authoring scene', () => {
    const { show, front, onEdit } = setup();
    fireEvent.change(screen.getByLabelText('Playback scene'), { target: { value: front.id } });
    expect(onEdit).toHaveBeenCalledWith({ ...show, outputs: [{ ...show.outputs[0], sceneId: front.id }] });
  });
  it('does not rehearse or edit a fallback scene for an unassigned output', () => {
    const { onPatchScene, onPlay, onSeek } = setup(true);
    expect((screen.getByLabelText('Playback scene') as HTMLSelectElement).value).toBe('');
    for (const label of ['Main show length', 'Play rehearsal', 'Restart rehearsal', 'Rehearsal position']) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    }
    fireEvent.click(screen.getByLabelText('Play rehearsal'));
    expect(onPatchScene).not.toHaveBeenCalled();
    expect(onPlay).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
  });
  it('keeps Pause available if the output is unassigned while transport is running', () => {
    const { onPlay } = setup(true, true);
    const pause = screen.getByLabelText('Pause rehearsal');
    expect((pause as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(pause);
    expect(onPlay).toHaveBeenCalledOnce();
  });

});
