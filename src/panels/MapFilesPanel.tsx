import { useState, type ReactNode } from 'react';
import { AetherIcon, SidePanelHeader, PanelNotifications, SegmentedControl, type DocumentConnection } from '@aether/ui';
import { MapDriveBrowser } from './MapDriveBrowser';

/** Local show entries and Studio Drive share the suite's Files navigation. */
export function MapFilesPanel({ documentID, connection, children }: { documentID: string | null; connection: DocumentConnection; children: ReactNode }) {
  const [scope, setScope] = useState('show');
  return <PanelNotifications><section className="map-files-panel" aria-label="Files navigation">
    <div className="map-files-panel-heading"><SidePanelHeader title="Files" icon="folder"/></div>
    <SegmentedControl variant="panel" className="map-files-panel-scopes" ariaLabel="Files view" value={scope} onChange={setScope} options={[
      { id: 'show', label: 'This show', icon: <AetherIcon name="scene" /> },
      { id: 'drive', label: 'Drive', icon: <AetherIcon name="folder" /> },
    ]}/>
    <div className="map-files-panel-content">
      {scope === 'show' ? children : <MapDriveBrowser documentID={documentID} connection={connection}/>}
    </div>
  </section></PanelNotifications>;
}

