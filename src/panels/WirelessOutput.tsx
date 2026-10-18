import { Button } from "@aether/ui";
import type { OutputDisplay, WirelessKind } from "../output-session";
import { OutputWindowSize } from "./OutputWindowSize";

/** The browser/OS selects receivers; Map supplies the complete composition. */
export function WirelessOutput({ output, reported, onOpen, onMatch }: {
  output: { width: number; height: number };
  reported: OutputDisplay | null;
  onOpen: (kind: WirelessKind) => void;
  /** Omitted where the surrounding panel already reports the output window —
   *  the old Output dialog stacks every transport at once, and one window has
   *  one size however many ways there are to open it. */
  onMatch?: (width: number, height: number) => void;
}) {
  return <div className="map-wireless">
    <strong>Chromecast / Google Cast</strong>
    <ol className="map-hint">
      <li>Open Map in Chrome on the same network as the receiver.</li>
      <li>Open the output tab below. In that tab, choose Chrome's Cast, save and share → Cast.</li>
      <li>Select Cast tab and your receiver. Keep the output tab open while playing.</li>
    </ol>
    <Button onClick={() => onOpen("cast")}>Open Cast output tab</Button>
    <strong>AirPlay / Apple TV</strong>
    <ol className="map-hint">
      <li>On your Mac, open Control Center → Screen Mirroring and select the receiver.</li>
      <li>Share only the output window, if offered, or use the receiver as an extended display.</li>
      <li>Open the output below. Move it to the extended display and double-click to enter fullscreen.</li>
    </ol>
    <Button onClick={() => onOpen("airplay")}>Open AirPlay output window</Button>
    <p className="map-hint">Only the output picture should be shared. Receiver selection and connection status stay in Chrome or macOS. Wireless mirroring can add delay; use a cable or a local player for timing-sensitive projection.</p>
    {/* A receiver has a size like any other display, and a raster that does not
        match it is letterboxed by the receiver rather than by the show. */}
    {onMatch && <OutputWindowSize output={output} reported={reported} onMatch={onMatch} />}
  </div>;
}
