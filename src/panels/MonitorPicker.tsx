import { useState } from "react";
import { Button, FieldRow, SelectField } from "@aether/ui";
import { describeDisplay, displaySupport, listDisplays, type DisplayInfo } from "../screens";
import { OutputWindowSize } from "./OutputWindowSize";

export interface MonitorPickerProps {
  output: { width: number; height: number };
  /** The open output window's content area in CSS pixels, never the editor's screen. */
  reported: { width: number; height: number; fullscreen: boolean } | null;
  onOpen: (display?: DisplayInfo) => void;
  onMatch: (width: number, height: number) => void;
}

/** A movable output window works without display enumeration or permission. */
export function MonitorPicker({ output, reported, onOpen, onMatch }: MonitorPickerProps) {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [chosen, setChosen] = useState("");
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const scan = async () => {
    setScanning(true);
    try {
      const found = await listDisplays();
      setDisplays(found);
      setScanned(true);
      setError("");
      setChosen((current) => found.find((d) => d.id === current)?.id
        ?? found.find((d) => !d.isCurrent)?.id ?? found[0]?.id ?? "");
    } catch {
      setDisplays([]);
      setError("Displays could not be listed. You can still open the output window and move it to your display.");
    } finally { setScanning(false); }
  };
  const display = displays.find((d) => d.id === chosen);
  const matchesDisplay = display?.width === output.width && display?.height === output.height;
  return <div className="map-monitor">
    <Button primary onClick={() => onOpen()}>Open output window</Button>
    <p className="map-hint">Move the output window to your projector or monitor, then double-click inside it to go fullscreen.</p>
    <OutputWindowSize output={output} reported={reported} onMatch={onMatch} />
    {displaySupport().supported && <details className="map-display-options">
      <summary>Choose a detected display</summary>
      <p className="map-hint">Optional: let the browser place the window on a display.</p>
      <Button disabled={scanning} onClick={() => void scan()}>{scanning ? "Scanning…" : scanned ? "Rescan displays" : "Scan displays"}</Button>
      {error && <div className="map-error" role="status">{error}</div>}
      {scanned && <p className="map-hint">{displays.length} display{displays.length === 1 ? "" : "s"} detected.</p>}
      {display && <FieldRow label="Display">
        <SelectField aria-label="Detected display" value={chosen}
          options={displays.map((d) => ({ value: d.id, label: describeDisplay(d) }))}
          onChange={(event) => setChosen(event.target.value)} />
        <div className="map-monitor-size">
          <Button onClick={() => onOpen(display)}>Open on selected display</Button>
          <Button disabled={matchesDisplay} onClick={() => onMatch(display.width, display.height)}>Match display size</Button>
        </div>
      </FieldRow>}
    </details>}
  </div>;
}
