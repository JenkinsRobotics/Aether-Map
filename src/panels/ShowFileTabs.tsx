import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AetherIcon, Button, WorkspaceFileBar, type DocumentConnection, type DocumentFileManagerProps } from '@aether/ui';
import { NewDesignDialog } from '@aether/ui/NewDesignDialog';
import type { ReactElement } from 'react';
import { sessionOwner, type SaveState } from '@aether/session/autosave';
import type { StoredFile } from '../api';
import { readShowTabs, reorderShowTabs, showTabURL, showTabLabel, storeShowTabs, tabKey, upsertShowTab, type OpenShowTab } from '../open-show-tabs';
import './ShowFileTabs.css';

/** One entry of the open document: its Show, Canvases and Scenes, typed. */
export interface DocumentEntry { id: string; label: string; kind: 'show' | 'scene'; icon: ReactElement }
const KIND_LABEL = { show: 'Show', scene: 'Scene' } as const;

/** The one file row: open files and, for the open document, its typed entries
 * (Show · Scene · Canvas), as CAD's tray lists Part Studios and Assemblies.
 * "+" asks what to create. */
export function ShowFileTabs({ file, saveState, connection, onSaveCopy, contents, status, fileActions, entries = [], activeEntry, onEntry, onCreate }: { file: StoredFile | null; saveState: SaveState; connection: DocumentConnection; onSaveCopy: () => void; status?:string; fileActions?:ReactNode; contents: Omit<DocumentFileManagerProps,"connection">;
  entries?: readonly DocumentEntry[]; activeEntry?: string; onEntry?: (entry: DocumentEntry) => void; onCreate?: (kind: 'scene' | 'show' | 'file') => void }) {
  const [creating, setCreating] = useState(false);
  const [owner, setOwner] = useState<string | null>(null);
  const [tabs, setTabs] = useState<OpenShowTab[]>([]);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const branch = connection.branch ?? 'Main';
  const fileID=file?.id, fileName=file?.name, branchLabel=file?.branch_label ?? file?.branch ?? connection.branchLabel;
  const saveLabel = saveState.phase === "saved" ? "Saved" : saveState.phase === "saving" || saveState.phase === "pending" ? "Saving…" : saveState.durable ? "Saved in this tab" : "Not saved";
  const tabStatus = {status:saveLabel, statusTitle:saveState.message ?? "Autosave is always on."};
  const active = file ? tabKey({id:file.id,branch}) : 'draft';
  useEffect(() => {
    let disposed = false;
    void sessionOwner().then(value => { if (!disposed) { setOwner(value); setTabs(readShowTabs(value)); } }).catch(() => { /* Tabs still display the active file while offline. */ });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (owner && fileID && fileName) storeShowTabs(owner,upsertShowTab(tabs,{id:fileID,name:fileName,branch,branchLabel}));
  }, [owner,tabs,fileID,fileName,branch,branchLabel]);
  const visible = file ? upsertShowTab(tabs,{id:file.id,name:file.name,branch,branchLabel}) : tabs;
  const navigate = async (url: string, nextTabs?: OpenShowTab[]) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      await connection.flush();
      if (owner && nextTabs) storeShowTabs(owner,nextTabs);
      location.assign(url);
    } catch (problem) { setError((problem as Error).message); setBusy(false); pending.current = false; }
  };
  const select = (id: string) => {
    const entry = entries.find(e => `entry:${e.id}` === id);
    if (entry) { onEntry?.(entry); return; }
    if (id === active) return;
    const tab = visible.find(item => tabKey(item) === id);
    if (tab) void navigate(showTabURL(tab));
  };
  const close = (id: string) => {
    if (id.startsWith('entry:')) return;
    const index = visible.findIndex(item => tabKey(item) === id);
    const next = visible.filter(item => tabKey(item) !== id);
    const neighbor = next[Math.min(index,next.length-1)];
    void navigate(neighbor ? showTabURL(neighbor) : '/map/',next);
  };
  const entryTabs = entries.map(e => ({ id: `entry:${e.id}`, label: e.label, detail: KIND_LABEL[e.kind], icon: e.icon, pinned: true, disabled: busy }));
  const pickerConnection: DocumentConnection = {...connection, openDocument: async id => {
    await navigate(showTabURL({id,branch:'Main',name:''}));
  }};
  return <div className="map-file-tabs" aria-busy={busy}>
    <WorkspaceFileBar fileActions={fileActions} manager={{...contents,connection:pickerConnection}} onAdd={()=>onCreate?setCreating(true):void navigate("/map/index.html?new=show")} addLabel="Create new" ariaLabel="Open shows" activeID={activeEntry ? `entry:${activeEntry}` : active} tabs={[
        ...visible.flatMap(tab => [{id:tabKey(tab),label:showTabLabel(tab),detail:"Map document",icon:<AetherIcon name="file-show" />,
          ...(tabKey(tab)===active ? tabStatus : {}),dirty:tabKey(tab)===active&&saveState.phase!=='saved',disabled:busy},
          // The open document's own entries follow its file tab, by type.
          ...(tabKey(tab)===active ? entryTabs : [])]),
        ...(!file ? [{id:'draft',label:'Untitled show',detail:"Map document",dirty:true,...tabStatus}, ...entryTabs] : []),
      ]} onSelect={select} onClose={busy?undefined:close} onReorder={(source,target)=>{
        if(source.startsWith('entry:')||target.startsWith('entry:'))return;
        const next=reorderShowTabs(visible,source,target);setTabs(next);if(owner)storeShowTabs(owner,next);
      }} trailing={
      <div className="map-file-save">
        {status&&<span className="aui-workspace-file-status" role="status">{status}</span>}
        {saveState.phase === 'conflict' && file && <Button onClick={()=>location.reload()} title="Reload the saved version and compare it with this protected draft">Check saved version</Button>}
        {saveState.message && <Button onClick={onSaveCopy} title={saveState.message}>Save a copy</Button>}
      </div>} />
    {error && <div className="map-file-tabs-error" role="alert">{error}</div>}
    {creating && <NewDesignDialog title="What do you want to create?" onClose={()=>setCreating(false)} onCreate={kind=>{setCreating(false);if(kind==='file')void navigate("/map/index.html?new=show");else onCreate?.(kind as 'scene'|'show');}} kinds={[
      {id:'scene',title:'Scene',summary:'Reusable animation and visualization',description:'Layers with their own timeline. Play it on any canvas from the Show.',icon:<AetherIcon name="palette"/>},
      {id:'show',title:'Show',summary:'A production',description:'Scene clips on canvas tracks, with cues. A document can hold several shows, like setlists.',icon:<AetherIcon name="play"/>},
      {id:'file',title:'Map document',summary:'A new, separate file',description:'Starts an empty Aether Map document with its own show.',icon:<AetherIcon name="file-show"/>},
    ]}/>}

  </div>;
}
