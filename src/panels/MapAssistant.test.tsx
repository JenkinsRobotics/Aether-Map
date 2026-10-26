// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MapAssistant } from './MapAssistant';
import { useDocumentHistory } from '../history';
import { normalizeDocument } from '../normalize-document';
import { emptyShow } from '../document';
import { useMapAgent } from '../use-map-agent';
afterEach(cleanup);
function Fixture() {
  const history=useDocumentHistory(()=>normalizeDocument(emptyShow()));
  const interaction=useMapAgent({contextKey:'fixture',show:history.present,writable:true,available:true,canUndo:false,canRedo:false,
    selection:{surface_ids:[],clip_id:null,asset_id:null},commit:history.set,undo:history.undo,redo:history.redo});
  const show=history.present, scene=show.scenes[0];
  return <MapAssistant show={show} scene={scene} surfaceIDs={[]} mediaUrls={{}} session={{messages:[],durationS:15,target:'scene'}} onSession={()=>{}} interaction={interaction}/>;
}
// The suite's agent (CAD): sharing lives in the header's Agent connections, not a banner above it.
it('uses the standard agent header with no sharing banner or second New chat',()=>{
  history.replaceState(null,'','/?document=doc-1');
  render(<Fixture/>);
  expect(screen.queryByRole('button',{name:/Share this editor/})).toBeNull();
  expect(screen.getAllByRole('button',{name:'New chat'})).toHaveLength(1);
  expect(screen.getByRole('button',{name:'Agent connections'})).toBeTruthy();
});
