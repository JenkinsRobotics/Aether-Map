import { Button, FieldRow } from "@aether/ui";
import type { OutputDisplay } from "../output-session";

/**
 * How big the picture this output is sending actually is, and a way to make the
 * show's raster match it.
 *
 * Shared by every transport that opens a window from here. A projector on HDMI
 * and a receiver across the room ask the same question — "what size is the
 * picture I am sending?" — and a wireless output that could not answer it read
 * as the unfinished half of the feature.
 */
export function OutputWindowSize({ output, reported, onMatch }: {
  output: { width: number; height: number };
  /** The open output's content area in CSS pixels, never the editor's screen. */
  reported: OutputDisplay | null;
  onMatch: (width: number, height: number) => void;
}) {
  const matches = reported?.width === output.width && reported?.height === output.height;
  return <>
    <FieldRow label="Output window" help={reported
      ? `${reported.fullscreen ? "Fullscreen" : "Window"} content size. Updates when you resize or fullscreen the output.`
      : "Open the output window to detect its size."}>
      {reported ? <div className="map-monitor-size">
        <span className="map-device-size" role="status">{reported.width}×{reported.height} px</span>
        <Button disabled={matches} onClick={() => onMatch(reported.width, reported.height)}>Match window size</Button>
      </div> : <span className="map-hint">No output window connected</span>}
    </FieldRow>
    <p className="map-hint">Output resolution: {output.width}×{output.height} px{matches ? " · matches output window" : ""}.</p>
  </>;
}
