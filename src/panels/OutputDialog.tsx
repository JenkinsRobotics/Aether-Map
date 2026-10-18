import { useEffect, useState } from "react";
import { AetherIcon, Button, Dialog, StatusDot } from "@aether/ui";
import { devices, hosted, type MapDevice } from "../api";
import { canDeployToDevice } from '../device-capabilities';
import { MonitorPicker } from "./MonitorPicker";
import type { DisplayInfo } from "../screens";
import { WirelessOutput } from "./WirelessOutput";
import type { WirelessKind } from "../output-session";

export interface OutputDialogProps {
  open: boolean;
  onClose: () => void;
  /** The saved document, or null when the show has never been saved. */
  documentID: string | null;
  output: { width: number; height: number };
  reportedDisplay: { width: number; height: number; fullscreen: boolean } | null;
  onUseMonitor: (display?: DisplayInfo) => void;
  onMatchDisplay: (width: number, height: number) => void;
  onDeploy: (deviceID: string) => Promise<void>;
  dirty: boolean;
  onOpenWireless: (kind: WirelessKind) => void;
}

const ONLINE_WINDOW_SECONDS = 60;

/**
 * Connected displays, wireless sharing, and paired standalone players. Saved
 * deployment is distinct from live output, and unsaved edits cannot deploy.
 */
export function OutputDialog({
  open,
  onClose,
  documentID,
  output,
  reportedDisplay,
  onUseMonitor,
  onMatchDisplay,
  onDeploy,
  dirty,
  onOpenWireless,
}: OutputDialogProps) {
  const [list, setList] = useState<MapDevice[]>([]);
  const [nowS, setNowS] = useState(() => Date.now() / 1000);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !hosted) return;
    let live = true;
    devices
      .list()
      .then((found) => {
        if (!live) return;
        setList(found.filter((device) => device.mine));
        setNowS(Date.now() / 1000);
      })
      .catch((problem: Error) => live && setError(problem.message));
    return () => {
      live = false;
    };
  }, [open]);

  return (
    <Dialog
      open={open}
      title="Send output to"
      onClose={onClose}
      actions={<Button onClick={onClose}>Close</Button>}
    >
      {error && <div className="map-error">{error}</div>}

      <div className="map-output-choice">
        <div className="map-output-choice-head">
          <AetherIcon name="window" />
          <strong>This computer</strong>
        </div>
        <p className="map-dialog-lead">
          A second window on a display attached to this computer. Edits appear on
          the beam as you make them.
        </p>
        <MonitorPicker
          output={output}
          reported={reportedDisplay}
          onMatch={onMatchDisplay}
          onOpen={(display) => {
            onUseMonitor(display);
            onClose();
          }}
        />
      </div>

      <div className="map-output-choice">
        <div className="map-output-choice-head">
          <AetherIcon name="hardware" />
          <strong>An output device</strong>
        </div>

        {!hosted ? (
          <p className="map-dialog-lead">
            Devices need the Aether Studio host. Open Aether Map from /map/.
          </p>
        ) : list.length === 0 ? (
          <p className="map-dialog-lead">
            No devices paired yet. Set one up from the Devices panel — a
            Raspberry Pi on the projector runs the show on its own, with this
            laptop closed.
          </p>
        ) : (
          <ul className="map-device-list">
            {list.map((device) => {
              const standalone = canDeployToDevice(device);
              const online = nowS - device.seen < ONLINE_WINDOW_SECONDS;
              return (
                <li key={device.id} className="map-device">
                  <div className="map-device-head">
                    <StatusDot kind={online ? "ok" : "warn"} />
                    <strong>{device.name}</strong>
                  </div>
                  <div className="map-device-meta">
                    {online ? "Online" : standalone ? "Offline — it will pull the show when it returns" : "Offline"}
                  </div>
                  {standalone ? <Button
                    disabled={!documentID || dirty}
                    onClick={async () => {
                      try {
                        await onDeploy(device.id);
                        onClose();
                      } catch (problem) {
                        setError((problem as Error).message);
                      }
                    }}
                  >
                    Deploy here
                  </Button> : <p className="map-hint">Live receiver. Open Players and choose Mirror live to share an output window.</p>}
                </li>
              );
            })}
          </ul>
        )}

        {hosted && list.length > 0 && (!documentID || dirty) && (
          <div className="map-hint">
            Save the latest changes before deploying this show.
          </div>
        )}
      </div>
      {/* No window readout here: the monitor picker above already reports the
          one output window this dialog can open. */}
      <div className="map-output-choice"><WirelessOutput output={output} reported={reportedDisplay}
        onOpen={onOpenWireless} /></div>
    </Dialog>
  );
}
