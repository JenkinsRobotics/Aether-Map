import { useEffect, useState } from 'react';
import { AetherIcon, Button } from '@aether/ui';
import { hosted } from './api';
import { PairDeviceForm } from './panels/PairDeviceForm';
import { pairingRoute } from './pairing-route';
import './PairingView.css';

/** Studio's existing HTML gate preserves this URL through sign-in. */
export function PairingView() {
  const [request] = useState(() => pairingRoute(location.search));
  const [paired, setPaired] = useState(false);
  useEffect(() => { document.title = 'Aether Map — Pair a player'; }, []);
  return <main className="map-pairing-page">
    <section className="map-pairing-card" aria-label="Player pairing">
      <div className="map-pairing-brand"><AetherIcon name="hardware" /> Aether Map</div>
      <h1>{paired ? 'Player paired' : 'Pair this player'}</h1>
      <p className="map-pairing-host">{location.host}</p>
      {!hosted ? <p>Open the pairing link from your Aether Studio server.</p> : paired ? <>
        <p role="status">The player is now in your account. Open Players to deploy a saved show or mirror a live output.</p>
        <Button primary onClick={() => location.assign('/map/index.html?players=1')}>Open Players</Button>
      </> : <PairDeviceForm initialCode={request.code} invalidLink={request.invalid} onPaired={() => {
        setPaired(true);
        // The consumed short-lived code should not remain in the address bar.
        history.replaceState(history.state, '', `${location.pathname}?paired=1`);
      }} />}
    </section>
  </main>;
}
