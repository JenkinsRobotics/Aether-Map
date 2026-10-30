import { createPortal } from "react-dom";
import "./DeviceManager.css";
import { useEffect, useRef, useState } from "react";
import { AetherIcon, Button, Dialog, EmptyState, FieldRow, IconButton, SelectField, StatusDot, TextField } from "@aether/ui";
import { devices, hosted, library, installerDownloadURL, androidReceiverAvailable, androidReceiverDownloadURL } from "../api";
import { ago, useMapDevices } from "../use-map-devices";
import type { MapShow } from '../document';
import { mirrorDevice, type CastStatus, type CastDiagnostics } from '../live-cast';
import { canDeployToDevice } from '../device-capabilities';
import { PairDeviceForm } from './PairDeviceForm';
import { deploymentReadiness } from '../deployment-readiness';
import { DeviceRemote } from './DeviceRemote';
import { deploySavedShow } from '../deploy-to-player';
import { startLiveEdit, stopLiveEdit, useLiveEdit } from '../live/live-edit';

/**
 * The workspace's paired players: pairing, naming, forgetting, and deploying a
 * show to one. This is about the hardware, not about any one output — an output
 * only names the device it plays on. Opened from the Outputs tray.
 */
/** On a server with its own HTTPS authority, fetch the authority first and
 * pin its SHA-256 before trusting anything it serves. */
export function bootstrapCommand(installer: string, authority: string | null): string {
  if (!authority) return `curl -sSL ${installer} | bash`;
  const origin = new URL(installer).origin;
  return `curl -sk ${origin}/api/network/ca.pem -o aether-ca.pem && echo "${authority}  aether-ca.pem" | sha256sum -c && curl --cacert aether-ca.pem -sSL ${installer} | bash`;
}
function useAuthorityFingerprint(): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    if (location.protocol !== 'https:' || !crypto.subtle) return;
    let live = true;
    void fetch('/api/network/ca.pem').then(r => r.ok ? r.arrayBuffer() : null).then(async bytes => {
      if (!bytes || !live) return;
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      setValue([...digest].map(b => b.toString(16).padStart(2, '0')).join(''));
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  return value;
}

export function DeviceManager({ documentID, installerURL, dirty, show, onRoute }: {
  show?: MapShow;
  /** Adds an output for a player to the open show, so it can deploy and go live. */
  onRoute?: (deviceID: string, name: string) => void;
  documentID: string | null;
  installerURL: string;
  dirty: boolean;
}) {
  const { list, nowS, error, setError, refresh, online } = useMapDevices();
  const authority = useAuthorityFingerprint();
  const castController = useRef<AbortController | null>(null);
  const [diagnostics, setDiagnostics] = useState<CastDiagnostics | null>(null);
  const [cast, setCast] = useState<{ id: string; status: CastStatus; intoShow: boolean } | null>(null);
  useEffect(() => () => { castController.current?.abort(); }, []);
  const mirror = async (id: string, intoShow = false) => {
    if (castController.current) return;
    const controller = new AbortController(); castController.current = controller;
    setCast({ id, status: 'Choosing output', intoShow }); setDiagnostics(null); setError('');
    try { await mirrorDevice(id, controller.signal, status => { if (!controller.signal.aborted) setCast({ id, status, intoShow }); }, value => { if (!controller.signal.aborted) setDiagnostics(value); }, intoShow); }
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
  // Saved shows, to name what each player runs and to deploy one from here.
  const [shows, setShows] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { if (hosted) void library.shows().then(setShows).catch(() => {}); }, []);
  const [choosing, setChoosing] = useState<{ id: string; name: string; file: string } | null>(null);
  const [deployNotes, setDeployNotes] = useState<{ id: string; notes: string[] } | null>(null);
  const showName = (id: string) => shows.find(f => f.id === id)?.name.replace(/\.aethermap$/i, '') ?? 'a saved show';
  const [nameDraft, setNameDraft] = useState("");
  const act = async (run: () => Promise<unknown>) => {
    try { await run(); await refresh(); setError(""); }
    catch (problem) { setError((problem as Error).message); }
  };
  const mine = list.filter((device) => device.mine);
  const live = useLiveEdit();
  // The player needs this show's renderer before it can draw live edits, so going
  // live deploys the saved file first; edits then stream without saving.
  const goLive = (id: string, assigned: boolean) => void act(async () => {
    if (!assigned) await devices.assign(id, documentID);
    if (show) startLiveEdit(id, show);
  });
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
                  {!standalone ? " · live receiver" : running ? " · assigned this show" : device.document ? ` · playing ${showName(device.document)}` : " · unassigned"}
                </div>
                {!standalone && <p className="map-hint">Receives a live output while this computer is sharing. Saved shows require a standalone player.</p>}
                {readiness?.output && <p className="map-hint">{readiness.output.name} · {show?.scenes.find(s=>s.id===readiness.output?.sceneId)?.name??'No scene'}</p>}
                {readiness?.blockers.map(message=><p className="map-hint" key={message}>{message}</p>)}
                {readiness?.notes.map(message=><p className="map-hint" key={message}>{message}</p>)}
                {running && <p className="map-hint">Assignment saved. The player pulls updates when connected; transfer completion is not reported here.</p>}
                <div className="map-device-actions">
                  {cast?.id === device.id
                    ? <Button onClick={() => castController.current?.abort()}>{cast.intoShow ? "Stop casting" : "Stop mirroring"}</Button>
                    : <>
                      <Button disabled={!online(device) || cast !== null} onClick={() => void mirror(device.id)}>Mirror live</Button>
                      {standalone && <Button disabled={!online(device) || cast !== null} onClick={() => void mirror(device.id, true)}>Cast into show</Button>}
                    </>}

                  {standalone && onRoute && readiness && !readiness.output && <Button primary onClick={() => onRoute(device.id, device.name)}>Add output for this player</Button>}
                  {standalone && show && (live?.deviceID === device.id
                    ? <Button onClick={stopLiveEdit}>End live</Button>
                    : <Button disabled={!documentID || !online(device) || !!readiness?.blockers.length} onClick={() => goLive(device.id, running)}>Go live</Button>)}
                  {standalone && documentID && <Button disabled={dirty || running || !!readiness?.blockers.length}
                    onClick={() => void act(() => devices.assign(device.id, documentID))}>
                    {running ? "Assigned" : "Deploy this show"}
                  </Button>}
                  {standalone && !documentID && <Button primary={!device.document} onClick={() => setChoosing({ id: device.id, name: device.name, file: device.document ?? shows[0]?.id ?? '' })}>
                    {device.document ? "Change show…" : "Deploy a show…"}</Button>}
                  {device.document && device.document !== documentID && <Button onClick={() => location.assign(`/map/index.html?document=${encodeURIComponent(device.document!)}`)}>Open show</Button>}
                  {device.document && <Button onClick={() => void act(() => devices.assign(device.id, null))}>Stop</Button>}
                </div>
                {live?.deviceID === device.id && <p role="status" className="map-hint">{live.error
                  || (live.status === 'Mirroring' ? 'Live · your edits appear on this player as you make them, without saving. End live to return it to the saved show.'
                    : running ? `${live.status}…` : 'Deploying, then going live. The first time, the player downloads the renderer, which can take a minute.')}</p>}
                {deployNotes?.id === device.id && deployNotes.notes.map(message => <p className="map-hint" key={message}>{message}</p>)}
                {device.status && <DeviceRemote device={{ ...device, status: device.status }}
                  send={(type, args = {}) => act(() => devices.command(device.id, type, args))} />}
                {cast?.id === device.id && <p role="status" className="map-hint">{cast.status} · {cast.intoShow ? "Plays in the show's Cast surfaces; the rest of the show keeps running." : standalone ? "Ending mirroring returns this player to its assigned show." : "Keep the receiver app open on the TV."}</p>}
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

      <Dialog open={choosing !== null} title={`Deploy to ${choosing?.name ?? ''}`} onClose={() => setChoosing(null)}
        actions={<><Button onClick={() => setChoosing(null)}>Cancel</Button>
          <Button primary disabled={!choosing?.file} onClick={() => { const target = choosing; setChoosing(null);
            if (target) void act(async () => setDeployNotes({ id: target.id, notes: await deploySavedShow(target.file, target.id, target.name) })); }}>Deploy</Button></>}>
        <p className="map-dialog-lead">The player downloads the show and its media, then plays it on its own, offline and after restarts. A show without an output for this player plays its active scene.</p>
        <FieldRow label="Show"><SelectField aria-label="Show to deploy" value={choosing?.file ?? ''}
          options={shows.map(f => ({ value: f.id, label: f.name.replace(/\.aethermap$/i, '') }))}
          onChange={e => setChoosing(c => c && { ...c, file: e.target.value })} /></FieldRow>
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
          <pre className="map-command">{bootstrapCommand(installerURL, authority)}</pre>
          {authority && <p className="map-dialog-lead">This server uses its own certificate authority. The command downloads it, checks its fingerprint (<code>{authority.slice(0, 16)}…</code>), and the installer then trusts it on the device.</p>}
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
