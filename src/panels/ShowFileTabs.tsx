import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AetherIcon, Button, WorkspaceFileBar, type DocumentConnection, type DocumentFileManagerProps } from '@aether/ui';
import { sessionOwner, type SaveState } from '@aether/session/autosave';
import type { StoredFile } from '../api';
import { readShowTabs, reorderShowTabs, showTabURL, showTabLabel, storeShowTabs, tabKey, upsertShowTab, type OpenShowTab } from '../open-show-tabs';
import './ShowFileTabs.css';

export function ShowFileTabs({ file, saveState, connection, onSaveCopy, contents, status, fileActions }: { file: StoredFile | null; saveState: SaveState; connection: DocumentConnection; onSaveCopy: () => void; status?:string; fileActions?:ReactNode; contents: Omit<DocumentFileManagerProps,"connection"> }) {
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
    if (id === active) return;
    const tab = visible.find(item => tabKey(item) === id);
    if (tab) void navigate(showTabURL(tab));
  };
  const close = (id: string) => {
    const index = visible.findIndex(item => tabKey(item) === id);
    const next = visible.filter(item => tabKey(item) !== id);
    const neighbor = next[Math.min(index,next.length-1)];
    void navigate(neighbor ? showTabURL(neighbor) : '/map/',next);
  };
  const pickerConnection: DocumentConnection = {...connection, openDocument: async id => {
    await navigate(showTabURL({id,branch:'Main',name:''}));
  }};
  return <div className="map-file-tabs" aria-busy={busy}>
    <WorkspaceFileBar fileActions={fileActions} manager={{...contents,connection:pickerConnection}} onAdd={()=>void navigate("/map/index.html?new=show")} addLabel="Create new show" ariaLabel="Open shows" activeID={active} tabs={[
        ...visible.map(tab => ({id:tabKey(tab),label:showTabLabel(tab),icon:<AetherIcon name="file-show" />,
          ...(tabKey(tab)===active ? tabStatus : {}),dirty:tabKey(tab)===active&&saveState.phase!=='saved',disabled:busy})),
        ...(!file ? [{id:'draft',label:'Untitled show',dirty:true,...tabStatus}] : []),
      ]} onSelect={select} onClose={busy?undefined:close} onReorder={(source,target)=>{
        const next=reorderShowTabs(visible,source,target);setTabs(next);if(owner)storeShowTabs(owner,next);
      }} trailing={
      <div className="map-file-save">
        {status&&<span className="aui-workspace-file-status" role="status">{status}</span>}
        {saveState.phase === 'conflict' && file && <Button onClick={()=>location.reload()} title="Reload the saved version and compare it with this protected draft">Check saved version</Button>}
        {saveState.message && <Button onClick={onSaveCopy} title={saveState.message}>Save a copy</Button>}
      </div>} />
    {error && <div className="map-file-tabs-error" role="alert">{error}</div>}

  </div>;
}
