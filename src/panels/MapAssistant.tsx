import { useLiveEditorAccess } from '@aether/session/LiveEditorAccess';
import { useState } from 'react';
import type { AgentInteraction } from '@aether/ui/AgentServices';
import { AetherIcon, Button, FieldRow, MenuButton, NumberField, WorkspaceAgent } from '@aether/ui';
import { type AssistantMessage } from '@aether/ui/concept-widgets';
import { studioAgentService } from '@aether/session/agent';
import { studioAgentAccessService } from '@aether/session/agent-access';
import type { MapShow, Scene } from '../document';
import { sceneSize } from '../scene-size';
import { buildProjectionPackage } from '../projection-export/package';
import { downloadProjection } from '../projection-export/archive';
import { exportName, sceneSvg } from '../projection-export/geometry';
import { MapAgentTools } from './MapAgentTools';
import { useMapProvider } from '../ai/provider';

export interface MapAssistantSession { messages: AssistantMessage[]; durationS: number; target: string; }
const EMPTY_SESSION: MapAssistantSession = { messages: [], durationS: 15, target: 'scene' };
/** App-owned ephemeral conversations survive workspace/panel changes, scoped to document + scene. */
export function useMapAssistantSessions() {
  const [sessions, setSessions] = useState<Record<string, MapAssistantSession>>({});
  return { read: (key: string) => sessions[key] ?? EMPTY_SESSION,
    patch: (key: string, patch: Partial<MapAssistantSession>) => setSessions(current => ({ ...current, [key]: { ...(current[key] ?? EMPTY_SESSION), ...patch } })) };
}

/** Live editor commands and optional portable creative-brief handoff. */
export function MapAssistant({ show, scene, surfaceIDs, mediaUrls, session, onSession, interaction }: {
  show: MapShow; scene: Scene; surfaceIDs: readonly string[]; mediaUrls: Record<string, string>;
  session: MapAssistantSession; onSession: (patch: Partial<MapAssistantSession>) => void;
  interaction: AgentInteraction;
}) {
  const { messages, durationS, target } = session;
  const provider = useMapProvider(studioAgentService, interaction);
  const prompt = messages.filter(m => m.role === 'user').map(m => m.text).join('\n\nRevision:\n');
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const selected = scene.surfaces.filter(s => surfaceIDs.includes(s.id) && s.kind !== 'mask' && !s.sceneCanvas);
  const size = sceneSize(show, scene);
  // CAD's composition: sharing sits in the header's Agent connections, not a banner.
  const sharing = useLiveEditorAccess({ app: 'map', documentID: new URLSearchParams(location.search).get('document'), interaction });
  const targetName = target === 'selection' ? selected.map(s => s.name).join(', ') || 'No surfaces selected' : scene.name;
  async function download() {
    if (busy || !prompt.trim() || (target === 'selection' && !selected.length)) return;
    const snapshot = structuredClone(show), urls = { ...mediaUrls };
    const brief = { prompt, durationS, ...(target === 'selection' ? { surfaceIDs: selected.map(s => s.id) } : {}) };
    setBusy(true); setStatus(`Preparing ${targetName}…`);
    try {
      const archive = await buildProjectionPackage(snapshot, scene.id, urls, brief);
      downloadProjection(archive, `${exportName(scene.name)}-creative-brief.zip`);
      setStatus('Creative brief downloaded.');
    } catch (error) { setStatus((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section aria-label="Projection assistant" style={{ height: '100%', minHeight: 0 }}>
    <WorkspaceAgent key={scene.id} service={provider.service} access={studioAgentAccessService} sharing={sharing} app="map" detail={scene.name}
      interaction={provider.interaction}
      contextText={JSON.stringify({ scene: scene.name, size, target: targetName, durationSeconds: durationS, maskSVG: sceneSvg(show, scene, true, target === 'selection' ? selected.map(s => s.id) : undefined), surfaces: (target === 'selection' ? selected : scene.surfaces).map(s => ({ id: s.id, name: s.name, kind: s.kind })) })} onMessages={messages => { onSession({ messages }); if (!messages.length) setStatus(''); }}
      messages={messages} notice={status}
      toolbar={<>
        <MapAgentTools interaction={interaction} sceneID={scene.id} show={show}/>
        <details className="aui-agent-chat__options" onKeyDown={event => { if (event.key === 'Escape') event.currentTarget.open = false; }}>
          <summary aria-label="Agent options" title="Agent options">···</summary>
          <div className="aui-agent-chat__options-content">
            <FieldRow label="Brief animation duration"><NumberField aria-label="Brief animation duration" value={durationS} min={.1} max={3600} unit="s" onValueChange={v => v !== null && onSession({ durationS: Math.min(3600, Math.max(.1, v)) })}/></FieldRow>
            <Button disabled={busy || !prompt.trim() || (target === 'selection' && !selected.length)} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void download(); }}>{busy ? 'Preparing…' : 'Download creative brief'}</Button>
          </div>
        </details>
      </>}
      context={<><AetherIcon name="scene"/><span aria-label="Agent selection" title={`${targetName} · ${size.width} × ${size.height}`}>{targetName}</span></>}
      composerActions={<>
        <MenuButton label="Add context" placement="top-start" items={[
          { id: 'scene', label: scene.name, kind: 'radio', checked: target === 'scene' },
          { id: 'selection', label: 'Selected surfaces', kind: 'radio', checked: target === 'selection', disabled: !selected.length },
        ]} onSelect={id => onSession({ target: id })}><AetherIcon name="plus"/></MenuButton>

      </>}
      onLocalSubmit={text => { onSession({ messages: [...messages, { id: crypto.randomUUID(), role: 'user', text }] }); setStatus('Connect a provider in Studio Plugins for agent chat. Agent tools can build and test programs now; ··· exports a creative brief.'); }} />
  </section>;
}
