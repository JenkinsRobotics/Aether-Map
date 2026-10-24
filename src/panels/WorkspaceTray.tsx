import { ProjectionExport } from "./ProjectionExport";
import { AetherIcon, Button, WorkspaceBottomDock } from "@aether/ui";
import type { ReactNode } from "react";
import type { MapShow } from "../document";
import { type WorkspaceID } from '../tray-panels';
import './WorkspaceTray.css';
export { WORKSPACE_IDS, type WorkspaceID } from '../tray-panels';

export interface WorkspaceTrayProps {
  open: readonly WorkspaceID[];
  storageKey: string;
  height: number;
  onHeightChange: (height: number) => void;
  onToggle: (id: WorkspaceID) => void;
  panels: Record<WorkspaceID, ReactNode>;
  timelineLabel?: string;
  toolbarRef?: (element: HTMLDivElement | null) => void;
  /** Render flush in the shell footer (toggled from the aux toolbar). */
  docked?: boolean;
}

/** Surfaces sit above the timeline; audio is a remembered timeline subpanel. */
export function WorkspaceTray({ open, onToggle, panels, storageKey, height, onHeightChange, toolbarRef, timelineLabel, docked }: WorkspaceTrayProps) {
  // In the footer the aux toolbar's Timeline toggle is the switch, so the
  // timeline renders flush there like Open files — no floating dock chrome.
  if (docked) {
    const audio = open.includes('audio');
    return <section className="map-footer-timeline" aria-label={timelineLabel}>
      <div className="map-bottom-command-bar" ref={toolbarRef} />
      <div className={`map-bottom-editors${audio ? ' is-split' : ''}`}>
        <div className="map-bottom-timeline">{panels.timeline}</div>
        {audio && <div className="map-bottom-audio">{panels.audio}</div>}
      </div>
    </section>;
  }
  const timeline = open.includes('timeline'), audio = timeline && open.includes('audio');
  const visibleTabs = open.filter(id => id !== 'audio');
  return <WorkspaceBottomDock ariaLabel="Map workspace dock" storageKey={storageKey}
    defaultHeight={timeline ? 340 : 80}
    activeTab={visibleTabs[0] ?? null} activeTabs={visibleTabs} onTabToggle={id => onToggle(id as WorkspaceID)} onTabChange={() => {}}
    height={height} onHeightChange={onHeightChange}
    tabs={[
      { id:'surfaces', label:'Surfaces', icon:<AetherIcon name="surface-region" /> },
      { id:'timeline', label:'Timeline', icon:<AetherIcon name="timeline-tracks" /> },
    ]}>
    <div className={`map-bottom-panels${timeline ? ' has-editors' : ''}`}>
      {open.includes('surfaces') && <div className="map-bottom-surfaces">{panels.surfaces}</div>}
      {timeline && <section className="map-bottom-content" aria-label={timelineLabel}>
      <div className="map-bottom-command-bar" ref={toolbarRef} />
      <div className={`map-bottom-editors${audio ? ' is-split' : ''}`}>
        <div className="map-bottom-timeline">{panels.timeline}</div>
        {audio && <div className="map-bottom-audio">{panels.audio}</div>}
      </div>
      </section>}
    </div>
  </WorkspaceBottomDock>;
}

export interface ExportWorkspaceProps {
  mediaUrls?: Record<string, string>;
  show: MapShow;
  /** The saved document, or null when the show has never been saved. */
  documentID: string | null;
  dirty: boolean;
  onExportProject: () => void;
  onExportWireframe: () => void;
}

export function ExportWorkspace({
  show,
  mediaUrls = {},
  documentID,
  dirty,
  onExportProject,
  onExportWireframe,
}: ExportWorkspaceProps) {
  const surfaces = show.scenes.reduce((total, scene) => total + scene.surfaces.length, 0);

  return (
    <div className="map-export">
      <ProjectionExport show={show} mediaUrls={mediaUrls} />
      <div className="map-export-item">
        <div className="map-export-head">
          <AetherIcon name="file-project" />
          <strong>Project bundle</strong>
        </div>
        <p className="map-dialog-lead">
          One folder holding the show, the layout an output device receives, every
          asset it references, and a wireframe of the mapping. The server builds
          it from the saved copy.
        </p>
        <ul className="map-export-contents">
          <li>show.aethermap — the document</li>
          <li>layout.json — what a device runs</li>
          <li>wireframe.svg — legacy quad overview (use Projection references for curves)</li>
          <li>media/ — {show.media.length} asset{show.media.length === 1 ? "" : "s"}</li>
        </ul>
        <Button primary disabled={!documentID || dirty} onClick={onExportProject}>
          Export project
        </Button>
        {!documentID && (
          <div className="map-hint">Save the show first — the bundle is built from the saved copy.</div>
        )}
        {documentID && dirty && (
          <div className="map-hint">
            Unsaved edits will not be in the bundle. Save first to include them.
          </div>
        )}
      </div>

      <div className="map-export-item">
        <div className="map-export-head">
          <AetherIcon name="file-drawing" />
          <strong>Mapping overview</strong>
        </div>
        <p className="map-dialog-lead">
          The mapping as SVG — {surfaces} surface{surfaces === 1 ? "" : "s"} across{" "}
          {show.scenes.length} scene{show.scenes.length === 1 ? "" : "s"} — for
          measuring, printing, or editing elsewhere. Artboards are separated; unassigned workspace surfaces are excluded. Includes current unsaved edits.
        </p>
        <Button onClick={onExportWireframe}>Download wireframe</Button>
      </div>

      <div className="map-export-item">
        <div className="map-export-head">
          <AetherIcon name="link" />
          <strong>Interchange</strong>
        </div>
        <p className="map-dialog-lead">
          SVG exchanges artwork geometry. Projection packages add PNG masks and
          a reference manifest; they are not complete show or calibration files.
          MPCDI exchanges projector warp/blend calibration and is not implemented.
          OSC, Art-Net/sACN, NDI and timecode integrations are also not implemented.
        </p>
      </div>
    </div>
  );
}
