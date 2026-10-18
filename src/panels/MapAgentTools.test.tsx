// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { GALLERY_VISUALS } from '../features/visual-gallery';
import { MapAgentTools } from './MapAgentTools';
import { useDocumentHistory } from '../history';
import { normalizeDocument } from '../normalize-document';
import { emptyShow } from '../document';
import { useMapAgent } from '../use-map-agent';
afterEach(cleanup);
function Fixture({writable=true}:{writable?:boolean}) {
  const history=useDocumentHistory(()=>normalizeDocument(emptyShow()));
  const interaction=useMapAgent({contextKey:'fixture',show:history.present,writable,available:true,canUndo:history.canUndo,canRedo:history.canRedo,
    selection:{surface_ids:[],clip_id:null,asset_id:null},commit:history.set,undo:history.undo,redo:history.redo});
  return <><MapAgentTools interaction={interaction} sceneID={history.present.activeSceneId} show={history.present}/>
    <output aria-label="Scene count">{history.present.scenes.length}</output><button onClick={history.undo}>Undo fixture</button></>;
}
it('runs the displayed recipe through live commands as one undoable edit',async()=>{
  render(<Fixture/>);fireEvent.click(screen.getByRole('button',{name:'Agent tools'}));
  fireEvent.click(screen.getByRole('button',{name:'Run program'}));
  await waitFor(()=>expect(screen.getByLabelText('Agent tool result').textContent).toContain('"passed": true'));
  expect(screen.getByLabelText('Scene count').textContent).toBe('2');
  expect(screen.getByRole('button',{name:'Preview shader source'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Close'}));
  fireEvent.click(screen.getByRole('button',{name:'Undo fixture'}));
  expect(screen.getByLabelText('Scene count').textContent).toBe('1');
});
it('reports validation/permission refusal and allows read-only discovery',async()=>{
  render(<Fixture writable={false}/>);fireEvent.click(screen.getByRole('button',{name:'Agent tools'}));
  fireEvent.click(screen.getByRole('button',{name:'Run program'}));
  await waitFor(()=>expect(screen.getByLabelText('Agent tool result').textContent).toContain('read-only'));
  expect(screen.getByLabelText('Scene count').textContent).toBe('1');
  fireEvent.click(screen.getByRole('button',{name:'Discover gallery'}));
  await waitFor(()=>expect(screen.getByLabelText('Agent tool result').textContent).toContain(`"total": ${GALLERY_VISUALS.length}`));
});
