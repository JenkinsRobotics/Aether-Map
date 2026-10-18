import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AetherIcon, Button, Dialog, SelectField } from '@aether/ui';
import type { AgentInteraction, AgentToolContent } from '@aether/ui/AgentServices';
import type { MapShow } from '../document';
import { visualSource } from '../media-pool';
import { mappedVisualRecipe } from '../ai/program';

/** A directly usable entry point for the same tools the connected agent calls. */
export function MapAgentTools({ interaction, sceneID, show }: { interaction: AgentInteraction; sceneID: string; show: MapShow }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [program, setProgram] = useState(() => JSON.stringify(mappedVisualRecipe, null, 2));
  const [result, setResult] = useState('');
  const [image, setImage] = useState(''), [previewID, setPreviewID] = useState('');
  const shaders = (show.visuals ?? []).filter(v => visualSource(show,v).shader);
  const selectedPreview = shaders.some(v => v.id === previewID) ? previewID : shaders[0]?.id;
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => { abort.current?.abort(); }, [interaction.contextKey]);
  async function execute(name: string, args: Record<string, unknown>) {
    if (busy) return;
    const controller = new AbortController(); abort.current = controller; setBusy(true);
    try {
      const value = await interaction.execute({id:crypto.randomUUID(),name:`aether_map_${name}`,arguments:args},controller.signal);
      if (!controller.signal.aborted) {
        const content = value as AgentToolContent;
        setImage(content?.type === 'aether.tool-content' ? `data:image/png;base64,${content.images[0].data}` : '');
        setResult(JSON.stringify(content?.type === 'aether.tool-content' ? content.value : value,null,2));
      }
    } catch (error) { if (!controller.signal.aborted) setResult((error as Error).message); }
    finally { if (abort.current === controller) { abort.current = null; setBusy(false); } }
  }
  return <><Button appearance="flat" onClick={() => setOpen(true)}><AetherIcon name="aether"/>Agent tools</Button>
    {open && createPortal(<Dialog open title="Map agent tools" onClose={() => { abort.current?.abort(); setOpen(false); }}>
      <div style={{width:'min(680px, 75vw)',display:'grid',gap:12}}>
        <p>Build a show with a validated program. Every step succeeds together as one undoable edit. Connected agents use these same tools.</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <Button disabled={busy} onClick={() => void execute('agent_docs',{topic:'tools'})}>Discover tools</Button>
          <Button disabled={busy} onClick={() => void execute('agent_docs',{topic:'gallery'})}>Discover gallery</Button>
          <Button disabled={busy} onClick={() => void execute('show_inspect',{})}>Inspect show</Button>
          <Button disabled={busy} onClick={() => void execute('show_verify',{scene_id:sceneID,time_s:5})}>Verify scene</Button>
        </div>
        <label>Program JSON<textarea aria-label="Map agent program" value={program} onChange={e => setProgram(e.target.value)} spellCheck={false}
          style={{display:'block',width:'100%',height:220,boxSizing:'border-box',fontFamily:'monospace',background:'var(--aui-bg)',color:'inherit',border:'1px solid var(--aui-border)',borderRadius:6,padding:12}}/></label>
        <Button disabled={busy} onClick={() => void execute('show_runprogram',{program_json:program})}>{busy?'Working…':'Run program'}</Button>
        {!!shaders.length && <div style={{display:'flex',gap:8}}>
          <SelectField aria-label="Agent preview visual" value={selectedPreview} options={shaders.map(v => ({value:v.id,label:v.name}))} onChange={e => setPreviewID(e.target.value)}/>
          <Button disabled={busy} onClick={() => void execute('visual_preview',{clip_id:selectedPreview,time_s:5})}>Preview shader source</Button>
        </div>}
        {image && <img src={image} alt="Agent shader source preview at five seconds" style={{maxWidth:'100%',maxHeight:180,objectFit:'contain'}}/>}
        {result && <pre aria-label="Agent tool result" style={{whiteSpace:'pre-wrap',overflow:'auto',maxHeight:200,fontSize:12}}>{result}</pre>}
      </div>
    </Dialog>,document.body)}
  </>;
}
