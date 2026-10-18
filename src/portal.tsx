import { useEffect, useState } from 'react';
import { withRequestTimeout } from './request-timeout';

/** Legacy deployed-app entry: read the local daemon, which alone owns credentials.
 * New players render their pairing screen before the app bundle is deployed. */
export function PortalView() {
  const [state, setState] = useState<{ code: string; claimed: boolean; qr: boolean; message: string } | null>(null);
  const onHost = location.pathname === '/map' || location.pathname.startsWith('/map/');
  const [error, setError] = useState(() => onHost ? 'Open the pairing screen on the player itself. In Aether Map, use Players to enter its code.' : '');
  useEffect(() => {
    document.title = 'Aether Map — Pair this projector';
    if (onHost) return;
    const life = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await withRequestTimeout(4000, async signal => {
          const response = await fetch('/player-status', { credentials: 'omit', cache: 'no-store', signal });
          if (!response.ok) throw new Error('The local player is unavailable. Start the Aether player daemon.');
          return response.json();
        }, life.signal);
        if (life.signal.aborted) return;
        setState({ code: typeof data.code === 'string' && /^[0-9]{6}$/.test(data.code) ? data.code : '',
          claimed: data.claimed === true, qr: typeof data.pairingUrl === 'string' && data.pairingUrl.length > 0,
          message: typeof data.pairingMessage === 'string' ? data.pairingMessage : '' });
        setError('');
      } catch (problem) { if (!life.signal.aborted) setError((problem as Error).message); }
      finally { if (!life.signal.aborted) timer = setTimeout(() => void poll(), 2000); }
    };
    void poll();
    return () => { life.abort(); clearTimeout(timer); };
  }, [onHost]);
  return <div className="map-portal"><div className="map-portal-card">
    <div className="map-portal-brand">Aether Map</div>
    {error ? <><h1>Not connected</h1><p role="alert">{error}</p></> : state?.claimed ? <>
      <h1>Ready</h1><p>This projector is paired. Deploy a show or mirror an output from Players.</p>
    </> : <>
      <p className="map-portal-lead">Scan with your phone, or enter this code in Aether Map → Players.</p>
      <div className="map-portal-code">{state?.code || '······'}</div>
      {state?.qr && state.code && <img width="256" height="256" alt="Scan to pair this player" src={`/pairing.svg?code=${state.code}`} />}
      {state?.message && <p>{state.message}</p>}
    </>}
  </div></div>;
}
