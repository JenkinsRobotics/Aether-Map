import { AetherIcon, FloatingToolbar, IconButton, StudioCameraControl } from "@aether/ui";
import { contextCommandsFor, runContextCommand } from "@aether/ui/context-commands";
import "./MapViewTools.css";

/** The canvas owns pan/zoom and registers them as context commands; both the
 * view tools and the camera control reach them the way the context menu does. */
const canvasCommand = (id: string) => {
  const host = document.querySelector(".map-canvas-host");
  const command = host && contextCommandsFor(host).find(entry => entry.id === id);
  if (command) runContextCommand(command);
};

/** Workspace view toggles under the right sidebar — CAD's standard placement.
 * Mapping gets the canvas-editing set (grid, snap, backdrop); visualization
 * and show get their own output toggles (input media preview, blackout). */
export function MapViewTools({ workspace, onPerformance, grid, onGrid, xray, onXray, snap, onSnap, backdrop, onBackdrop, showInput, onInput, blackout, onBlackout }: {
  workspace: "mapping" | "visualization" | "show";
  /** Opens the live performance view (visualization). */
  onPerformance?: () => void;
  grid: boolean; onGrid: () => void;
  xray: boolean; onXray: () => void;
  snap: boolean; onSnap: () => void;
  /** null: the scene has no backdrop image to toggle. */
  backdrop: boolean | null; onBackdrop: () => void;
  showInput: boolean; onInput: () => void; blackout: boolean; onBlackout: () => void;
}) {
  const mappingTools = [
    { id: "grid", label: "Grid", icon: <AetherIcon name="grid-3" />, pressed: grid },
    { id: "xray", label: "X-ray", icon: <AetherIcon name="cube-transparent" />, pressed: xray },
    { id: "snap", label: "Snap", icon: <AetherIcon name="timeline-snap" />, pressed: snap },
    { id: "backdrop", label: "Backdrop image", icon: <AetherIcon name="image" />, pressed: backdrop === true, disabled: backdrop === null },
    { id: "blackout", label: "Blackout", icon: <AetherIcon name="hidden" />, pressed: blackout },
  ];
  const outputTools = [
    { id: "input", label: "Input preview", icon: <AetherIcon name="monitor" />, pressed: showInput },
    ...(workspace === "visualization" ? [{ id: "backdrop", label: "Backdrop image", icon: <AetherIcon name="image" />, pressed: backdrop === true, disabled: backdrop === null }] : []),
    ...(workspace === "visualization" && onPerformance ? [{ id: "performance", label: "Performance", icon: <AetherIcon name="sliders" /> }] : []),
    { id: "blackout", label: "Blackout", icon: <AetherIcon name="hidden" />, pressed: blackout },
  ];
  return <div className="map-studio-view-tools">
    <FloatingToolbar variant="document" ariaLabel="View tools" groups={[{ id: "view", label: "View",
      actions: workspace === "mapping" ? mappingTools : outputTools }]} onAction={id => {
      if (id === "grid") onGrid();
      else if (id === "xray") onXray();
      else if (id === "snap") onSnap();
      else if (id === "backdrop") onBackdrop();
      else if (id === "input") onInput();
      else if (id === "performance") onPerformance?.();
      else if (id === "blackout") onBlackout();
    }} />
  </div>;
}

/** The expandable camera surface over the canvas, holding zoom and fit. */
export function MapCameraControls() {
  return <div className="map-camera-chrome">
    <StudioCameraControl projection="Canvas">
      <div className="map-camera-actions">
        <IconButton label="Zoom in" appearance="glyph" onClick={() => canvasCommand("zoom-in")}><AetherIcon name="zoom-in" /></IconButton>
        <IconButton label="Zoom out" appearance="glyph" onClick={() => canvasCommand("zoom-out")}><AetherIcon name="zoom-out" /></IconButton>
        <IconButton label="Fit canvas" appearance="glyph" onClick={() => canvasCommand("zoom-fit")}><AetherIcon name="fit" /></IconButton>
      </div>
    </StudioCameraControl>
  </div>;
}
