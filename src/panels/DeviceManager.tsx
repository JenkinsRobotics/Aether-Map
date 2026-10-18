import { createPortal } from "react-dom";
import "./DeviceManager.css";
import { useEffect, useRef, useState } from "react";
import { AetherIcon, Button, Dialog, EmptyState, FieldRow, IconButton, StatusDot, TextField } from "@aether/ui";
import { devices, hosted, installerDownloadURL, androidReceiverAvailable, androidReceiverDownloadURL } from "../api";
import { ago, useMapDevices } from "../use-map-devices";
import type { MapShow } from '../document';
import { mirrorDevice, type CastStatus, type CastDiagnostics } from '../live-cast';
import { canDeployToDevice } from '../device-capabilities';
import { PairDeviceForm } from './PairDeviceForm';
import { deploymentReadiness } from '../deployment-readiness';

/**
 * The workspace's paired players: pairing, naming, forgetting, and deploying a
 * show to one. This is about the hardware, not about any one output — an output
 * only names the device it plays on. Opened from the Outputs tray.
 */
export function DeviceManager({ documentID, installerURL, dirty, show }: {
  show?: MapShow;
  documentID: string | null;
  installerURL: string;
  dirty: boolean;
}) {
  const { list, nowS, error, setError, refresh, online } = useMapDevices();
  const castController = useRef<AbortController | null>(null);
  const [diagnostics, setDiagnostics] = useState<CastDiagnostics | null>(null);
  const [cast, setCast] = useState<{ id: string; status: CastStatus } | null>(null);
  useEffect(() => () => { castController.current?.abort(); }, []);
  const mirror = async (id: string) => {
    if (castController.current) return;
    const controller = new AbortController(); castController.current = controller;
    setCast({ id, status: 'Choosing output' }); setDiagnostics(null); setError('');
    try { await mirrorDevice(id, controller.signal, status => { if (!controller.signal.aborted) setCast({ id, status }); }, value => { if (!controller.signal.aborted) setDiagnostics(value); }); }
    catch (problem) { if (!controller.signal.aborted && (problem as Error).name !== 'NotAllowedError') setError((problem as Error).message); }
    finally { if (castController.current === controller) { castController.current = null; setCast(null); setDiagnostics(null); } }
  };
  const [pairing, setPairing] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [androidAvailable, setAndroidAvailable] = useState(false);
  useEffect(() => {
    if (!adding) return;
    let current = true;
    void androidReceiverAvailable().then(available => { if (current) setAndroidAvailable(available); }).catch(() => { if (current) setAndroidAvailable(false); });
    return () => { current = false; };
  }, [adding]);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const act = async (run: () => Promise<unknown>) => {
    try { await run(); await refresh(); setError(""); }
    catch (problem) { setError((problem as Error).message); }
  };
  const mine = list.filter((device) => device.mine);
  if (!hosted) return <div className="map-devices"><EmptyState compact icon={<AetherIcon name="hardware" />}
    title="Edge devices need the host" description="Open Aether Map from Aether Studio to pair a projector." /></div>;
  return (
    <div className="map-devices">
      <div className="map-devices-actions">
        <Button primary onClick={() => { setPairingBusy(false); setPairing(true); }}>Pair a device</Button>
        <Button onClick={() => setAdding(true)}>Set up a new one</Button>
        <Button onClick={()=>void refresh()}>Refresh devices</Button>
      </div>
      {error && <div className="map-error">{error}</div>}
      <p className="map-hint">Deploy for independent playback, including offline. For live mirroring, open your output window, then choose it in the browser’s sharing picker. Keep this Players view open while sharing. Both devices need to be on the same network.</p>
      <p className="map-hint">Standalone players start assigned shows automatically on boot. Use the output’s Show time settings for daily schedules; the Pi uses its own local clock and time zone.</p>
      {dirty && <p className="map-hint">Save the latest changes before deployment. Assigned players pull saved updates automatically.</p>}
      {mine.length === 0 ? (
        <EmptyState compact icon={<AetherIcon name="hardware" />} title="No devices yet"
          description="Set up a Raspberry Pi, then pair it with the code on its projector." />
      ) : (
        <ul className="map-device-list">
          {mine.map((device) => {
            const standalone = canDeployToDevice(device);
            const running = standalone && !!documentID && device.document === documentID;
            const readiness = show && standalone ? deploymentReadiness(show,device.id) : null;
            return (
              <li key={device.id} className="map-device">
                <div className="map-device-head">
                  <StatusDot kind={online(device) ? "ok" : "warn"} />
                  <strong>{device.name}</strong>
                  <IconButton label={`Rename ${device.name}`}
                    onClick={() => { setNameDraft(device.name); setRenaming(device); }}><AetherIcon name="notes" /></IconButton>
                  <IconButton label={`Forget ${device.name}`}
                    onClick={() => void act(() => devices.forget(device.id))}><AetherIcon name="delete" /></IconButton>
                </div>
                <div className="map-device-meta">
                  {online(device) ? "Online" : `Last seen ${ago(device.seen, nowS)}`}
                  {!standalone ? " · live receiver" : running ? " · assigned this show" : device.document ? " · assigned another show" : " · unassigned"}
                </div>
                {!standalone && <p className="map-hint">Receives a live output while this computer is sharing. Saved shows require a standalone player.</p>}
                {readiness?.output && <p className="map-hint">{readiness.output.name} · {show?.scenes.find(s=>s.id===readiness.output?.sceneId)?.name??'No scene'}</p>}
                {readiness?.blockers.map(message=><p className="map-hint" key={message}>{message}</p>)}
                {readiness?.notes.map(message=><p className="map-hint" key={message}>{message}</p>)}
                {running && <p className="map-hint">Assignment saved. The player pulls updates when connected; transfer completion is not reported here.</p>}
                <div className="map-device-actions">
                  {cast?.id === device.id
                    ? <Button onClick={() => castController.current?.abort()}>Stop mirroring</Button>
                    : <Button disabled={!online(device) || cast !== null} onClick={() => void mirror(device.id)}>Mirror live</Button>}

                  {standalone && <Button disabled={!documentID || dirty || running || !!readiness?.blockers.length}
                    onClick={() => void act(() => devices.assign(device.id, documentID))}>
                    {running ? "Assigned" : "Deploy this show"}
                  </Button>}
                  {device.document && <Button onClick={() => void act(() => devices.assign(device.id, null))}>Stop</Button>}
                </div>
                {cast?.id === device.id && <p role="status" className="map-hint">{cast.status} · {standalone ? "Ending mirroring returns this player to its assigned show." : "Keep the receiver app open on the TV."}</p>}
                {cast?.id === device.id && diagnostics && <CastConnectionDetails value={diagnostics} />}
                {!online(device) && device.document && <p className="map-hint">Offline: Stop takes effect on the next successful connection. The player may still be running its cached show.</p>}
              </li>
            );
          })}
        </ul>
      )}

      {createPortal(<div className="map-device-dialog"><Dialog open={renaming !== null} title="Rename device" onClose={() => setRenaming(null)}
        actions={<><Button onClick={() => setRenaming(null)}>Cancel</Button>
          <Button primary onClick={() => { const target = renaming; setRenaming(null);
            if (target) void act(() => devices.rename(target.id, nameDraft.trim())); }}>Rename</Button></>}>
        <p className="map-dialog-lead">
          Name it for where it is — &ldquo;Porch&rdquo;, &ldquo;Garage door&rdquo; —
          so the right projector is obvious when you deploy.
        </p>
        <FieldRow label="Name"><TextField value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} /></FieldRow>
      </Dialog>

      <Dialog open={pairing} title="Pair a device" onClose={() => { if (!pairingBusy) setPairing(false); }}>
        <PairDeviceForm onBusyChange={setPairingBusy} onCancel={() => setPairing(false)} onPaired={() => {
          setPairing(false); setPairingBusy(false); void refresh();
        }} />
      </Dialog>

      <Dialog open={adding} title="Set up a new device" onClose={() => setAdding(false)}
        actions={<Button onClick={() => setAdding(false)}>Done</Button>}>
        {androidAvailable && <section aria-label="Android TV receiver setup">
          <p className="map-dialog-lead"><strong>Android / Google TV</strong></p>
          <p className="map-dialog-lead">Install the local test build on your TV, open Aether Map Receiver, and enter this Studio server’s HTTPS network address. Scan its QR or pair with its six-digit code, then use Mirror live here. Keep the receiver app open; turn Sound on there to hear shared audio.</p>
          <p className="map-feature-buttons"><Button onClick={() => { location.href = androidReceiverDownloadURL(); }}>Download TV receiver</Button></p>
          <p className="map-hint">Requires Android 8 or newer and a trusted HTTPS connection to Studio. Receives live output; independent and offline show playback use a Pi.</p>
        </section>}
        <p className="map-dialog-lead"><strong>Raspberry Pi</strong></p>
        {/* Download first, because it is the path that works on a Pi that has
            never been on a network — which is every Pi out of the box. The
            one-liner below assumes the device is already online, and so
            cannot be the first step. */}
        <p className="map-dialog-lead">
          Download the installer, copy it to a Raspberry Pi running Raspberry Pi OS
          with the desktop, and run it there:
        </p>
        <p className="map-feature-buttons">
          <Button primary onClick={() => { location.href = installerDownloadURL(); }}>
            Download projector installer
          </Button>
        </p>
        <pre className="map-command">bash aether-projector-setup.sh</pre>
        <p className="map-dialog-lead">
          The player is bundled; internet is needed only for missing system packages.
          The installer enables desktop autologin and playback on boot. After restarting,
          an unconfigured Pi offers a setup Wi-Fi network and displays its password and address. Finish setup from a phone,
          choosing the network, this server, and a name for the projector. It then
          shows a pairing code to enter here.
        </p>
        <details className="map-dialog-lead">
          <summary>The device is already on your network</summary>
          <p className="map-dialog-lead">Open a terminal on it and run:</p>
          <pre className="map-command">{`curl -sSL ${installerURL} | bash`}</pre>
          {isLoopback(installerURL) && (
            <p className="map-dialog-lead map-warning">
              You are browsing this server as <code>localhost</code>, which on the device
              would mean the device itself. Replace it with this computer&rsquo;s network
              address before running the command there.
            </p>
          )}
        </details>
      </Dialog></div>, document.body)}
    </div>
  );
}

/** A command copied from a loopback URL would point a device at itself. */
function isLoopback(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
}

function CastConnectionDetails({ value }: { value: CastDiagnostics }) {
  const readings = [
    value.width !== undefined && value.height !== undefined ? `${value.width} × ${value.height}` : null,
    value.fps !== undefined ? `${Math.round(value.fps)} fps` : null,
    value.videoMbps !== undefined ? `${value.videoMbps.toFixed(2)} Mbps video` : null,
    value.roundTripMs !== undefined ? `${Math.round(value.roundTripMs)} ms network round trip` : null,
  ].filter(Boolean);
  return <div className="map-cast-diagnostics" aria-label="Live connection details">
    <p className="map-hint">{readings.length ? readings.join(' · ') : 'Waiting for video measurements…'}</p>
    <p className="map-hint">{value.audio ? 'Audio included in the shared stream; playback follows the player’s audio setting.' : 'Video only. To include sound, stop and enable audio in the browser’s sharing picker if available.'}</p>
    {value.limitation && <p className="map-hint">{value.limitation === 'bandwidth'
      ? 'Network bandwidth is limiting video quality. Try a stronger Wi-Fi signal or a wired connection.'
      : value.limitation === 'cpu' ? 'This computer is limiting video quality. Close other demanding apps or share a smaller output window.'
      : 'The browser is limiting video quality.'}</p>}
    {value.roundTripMs !== undefined && <p className="map-hint">Network round trip does not include rendering, decoding or projector delay.</p>}
  </div>;
}
