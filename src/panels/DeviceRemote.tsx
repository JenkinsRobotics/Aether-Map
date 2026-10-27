import { createPortal } from "react-dom";
import { useState } from "react";
import { Button, Checkbox, Dialog, FieldRow, TextField } from "@aether/ui";
import type { DeviceCommandType, DeviceStatus, MapDevice } from "../api";

/**
 * Remote management for a player out of reach: what it reports, and the
 * commands a person would otherwise have to run standing at the device.
 * Commands queue on the host and run at the player's next check-in.
 */
const LABEL: Record<DeviceCommandType, string> = {
  sync: "Sync", update: "Update", restart: "Restart", reboot: "Reboot", reload: "Reload", identify: "Identify",
  logs: "Logs", set_server: "Host change", set_permissions: "Permissions", add_wifi: "Wi-Fi",
};

function duration(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

function details(status: DeviceStatus): string {
  return [
    `Player ${status.player_version.slice(0, 6)}`,
    status.address,
    status.temperature_c != null && `${Math.round(status.temperature_c)} °C`,
    `up ${duration(status.uptime_s)}`,
    status.disk_free_mb != null && `${(status.disk_free_mb / 1024).toFixed(1)} GB free`,
    status.model,
    status.update_pending && "confirming update",
  ].filter(Boolean).join(" · ");
}

export function DeviceRemote({ device, send }: {
  device: MapDevice & { status: DeviceStatus };
  send: (type: DeviceCommandType, args?: Record<string, unknown>) => Promise<void>;
}) {
  const { status } = device;
  const [confirmReboot, setConfirmReboot] = useState(false);
  const [logs, setLogs] = useState(false);
  const [settings, setSettings] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [permissions, setPermissions] = useState({ keep_display_awake: true, play_audio: true, allow_updates: true, ...status.permissions });
  const latest = device.commands?.[0];
  const latestLogs = device.commands?.find(command => command.type === "logs");
  const result = (command = latest) => !command ? "" : command.state === "pending" ? "waiting for the player"
    : command.ok ? (command.detail ?? "done").split("\n")[0] : `failed: ${command.detail ?? ""}`;
  const permission = (key: keyof typeof permissions, label: string) => (
    <FieldRow label={label}><Checkbox label="Allowed" aria-label={label} checked={permissions[key]}
      onChange={event => setPermissions(current => ({ ...current, [key]: event.target.checked }))} /></FieldRow>
  );
  return (
    <>
      <div className="map-device-meta" aria-label={`${device.name} details`}>{details(status)}</div>
      {status.last_error && <p className="map-hint">{status.last_error}</p>}
      {latest && <p className="map-hint" role="status" aria-label={`${device.name} last command`}>
        {LABEL[latest.type] ?? latest.type} · {result()}</p>}
      <div className="map-device-actions">
        <Button onClick={() => void send("identify", { seconds: 20 })}>Identify</Button>
        <Button onClick={() => void send("sync")}>Sync now</Button>
        <Button onClick={() => void send("update")}>Update player</Button>
        <Button onClick={() => void send("restart")}>Restart player</Button>
        <Button onClick={() => setConfirmReboot(true)}>Reboot</Button>
        <Button onClick={() => { setLogs(true); void send("logs", { lines: 100 }); }}>Logs</Button>
        <Button onClick={() => setSettings(true)}>Device settings</Button>
      </div>
      {createPortal(<div className="map-device-dialog">
        <Dialog open={confirmReboot} title={`Reboot ${device.name}?`} onClose={() => setConfirmReboot(false)}
          actions={<><Button onClick={() => setConfirmReboot(false)}>Cancel</Button>
            <Button primary onClick={() => { setConfirmReboot(false); void send("reboot"); }}>Reboot {device.name}</Button></>}>
          <p className="map-dialog-lead">The projector goes dark for about a minute, then starts its assigned show again.</p>
        </Dialog>
        <Dialog open={logs} title={`${device.name} logs`} onClose={() => setLogs(false)}
          actions={<><Button onClick={() => void send("logs", { lines: 100 })}>Refresh</Button><Button onClick={() => setLogs(false)}>Done</Button></>}>
          <pre className="map-command map-device-logs">{latestLogs?.state === "done" ? latestLogs.detail : "Waiting for the player…"}</pre>
        </Dialog>
        <Dialog open={settings} title={`${device.name} settings`} onClose={() => setSettings(false)}
          actions={<Button onClick={() => setSettings(false)}>Done</Button>}>
          <p className="map-dialog-lead"><strong>Wi-Fi</strong> · saved for when it is in range; the current network stays connected.</p>
          <FieldRow label="Network"><TextField aria-label="Wi-Fi network" value={ssid} onChange={event => setSsid(event.target.value)} /></FieldRow>
          <FieldRow label="Password"><TextField aria-label="Wi-Fi password" type="password" value={password} onChange={event => setPassword(event.target.value)} /></FieldRow>
          <p className="map-feature-buttons"><Button disabled={!ssid.trim()} onClick={() => void send("add_wifi", { ssid: ssid.trim(), password })}>Save network</Button></p>
          <p className="map-dialog-lead"><strong>Host</strong> · the player switches only if it can reach the new address.</p>
          <FieldRow label="Address"><TextField aria-label="Host address" placeholder="aetherstudio.local:8780" value={host} onChange={event => setHost(event.target.value)} /></FieldRow>
          <p className="map-feature-buttons"><Button disabled={!host.trim()} onClick={() => void send("set_server", { url: host.trim() })}>Use this host</Button></p>
          <p className="map-dialog-lead"><strong>Device</strong></p>
          {permission("keep_display_awake", "Keep display awake")}
          {permission("play_audio", "Play audio")}
          {permission("allow_updates", "Update automatically")}
          <p className="map-feature-buttons"><Button onClick={() => void send("set_permissions", permissions)}>Save permissions</Button></p>
          {latest && <p className="map-hint">{LABEL[latest.type] ?? latest.type} · {result()}</p>}
        </Dialog>
      </div>, document.body)}
    </>
  );
}
