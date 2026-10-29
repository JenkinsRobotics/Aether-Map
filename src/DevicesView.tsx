import { useEffect } from 'react';
import { AetherIcon } from '@aether/ui';
import { installerURL } from './api';
import { DeviceManager } from './panels/DeviceManager';
import './PairingView.css';

/** Every paired player on its own page, the way the library lists files.
 * Deploying needs an open show; everything else works from here. */
export function DevicesView() {
  useEffect(() => { document.title = 'Aether Map — Players'; }, []);
  return <main className="map-pairing-page map-devices-page">
    <div className="map-pairing-brand"><AetherIcon name="hardware" /> Aether Map</div>
    <h1>Players</h1>
    <DeviceManager documentID={null} installerURL={installerURL()} dirty={false} />
  </main>;
}
