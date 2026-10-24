import { createPortal } from "react-dom";
import { MidiControlsButton } from '../live/MidiControls';
import { BodyTrackingStatus } from '../body/BodyTrackingControls';
import { useStudioApplications } from "@aether/session/applications";
import { useState } from "react";
import {
  AetherIcon, ApplicationSettings, ModelStudioHeader, WorkspaceQuickControls, WorkspaceSwitcher,
  Button, Dialog, MenuButton, SelectField, SettingsCard, SettingsRow, SettingsWindow,
  StudioModeButton, TextField, WorkspaceWindowMenu, type LayoutPreset,
} from "@aether/ui";
import { MAP_WORKSPACES, type MapWorkspace } from "./map-ribbon-layout";
import type { SurfaceLook } from "../document";
import { SurfaceLookSettings } from "./SurfaceLookSettings";

interface MapDocumentHeaderProps {
  visualEditor?: 'simple' | 'advanced';
  onVisualEditor?: (mode: 'simple' | 'advanced') => void;
  file: { id: string; name: string; branch?: string; branch_label?: string } | null;
  workspace: MapWorkspace;
  onWorkspace: (workspace: MapWorkspace) => void;
  preset: LayoutPreset;
  panelsOnOuterEdge: boolean;
  sidebarVariant: "rail" | "tabs-top" | "tabs-bottom";
  onSidebarVariantChange: (variant: "rail" | "tabs-top" | "tabs-bottom") => void;
  onPanelEdgeChange: (outside: boolean) => void;
  onPresetChange: (preset: LayoutPreset) => void;
  onSave: () => void;
  onImport: () => void;
  onExport: () => void;
  onExportOptions?: () => void;
  onWireframe: () => void;
  canExport: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onStatus: (message: string) => void;
  onRename: () => void;
  onSaveCopy: () => void;
  surfaceLook: SurfaceLook;
  onSurfaceLook: (look: SurfaceLook) => void;
  /** Panels without an aux-rail button (notes, reminders) open from the palette. */
  onShowPanel?: (id: string) => void;
  /** The file footer's actions slot hosts the Document controls menu. */
  fileMenuTarget?: HTMLElement | null;
}

/** Map's global navigation, document commands and account in the shared sidebar. */
export function MapDocumentHeader({ fileMenuTarget, file, onWorkspace, preset, panelsOnOuterEdge, sidebarVariant, onSidebarVariantChange, onPanelEdgeChange, onPresetChange, onSave, onImport, onExport, onExportOptions, onWireframe, canExport, onUndo, onRedo, canUndo, canRedo, onStatus, onRename, onSaveCopy, surfaceLook, onSurfaceLook, onShowPanel }: MapDocumentHeaderProps) {
  const applications = useStudioApplications();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pane, setPane] = useState("workspace");
  const [fallbackLink, setFallbackLink] = useState("");
  const copyLink = async () => {
    if (!file) return;
    const link = new URL("/map/index.html", location.origin);
    link.searchParams.set("document", file.id);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link.href);
      onStatus("Document link copied");
    } catch {
      setFallbackLink(link.href);
    }
  };

  const documentItems = [
          { id: "undo", label: "Undo", icon: <AetherIcon name="undo" />, shortcut: "⌘Z", disabled: !canUndo },
          { id: "redo", label: "Redo", icon: <AetherIcon name="redo" />, shortcut: "⇧⌘Z", disabled: !canRedo },
          { id: "save", label: "Save show", icon: <AetherIcon name="save" />, shortcut: "⌘S", separatorBefore: true },
          { id: "rename", label: "Rename show", icon: <AetherIcon name="document" /> },
          { id: "copy", label: "Save a copy", icon: <AetherIcon name="items" /> },
          { id: "library", label: "Show library", icon: <AetherIcon name="folder" /> },
          { id: "import", label: "Import SVG…", icon: <AetherIcon name="import" />, separatorBefore: true },
          { id: "export", label: "Export show", icon: <AetherIcon name="export" />, disabled: !canExport, disabledReason: "Save the show before exporting." },
          ...(onExportOptions ? [{ id:"export-options", label:"Export options…", icon:<AetherIcon name="export" /> }] : []),
          { id: "wireframe", label: "Download mapping as SVG", icon: <AetherIcon name="file-drawing" /> },
          { id: "link", label: "Copy document link", icon: <AetherIcon name="link" />, disabled: !file, disabledReason: "Save the show to create a document link." },
          { id: "settings", label: "Settings", icon: <AetherIcon name="settings" />, separatorBefore: true },
          { id: "mapping-grid", label: "Mapping grid settings", icon: <AetherIcon name="surface-map" /> },
          { id: "studio", label: "Aether Studio", icon: <AetherIcon name="aether" />, separatorBefore: true },
        ];
  const act = (id: string) => {
    if (id === "undo") onUndo();
    else if (id === "redo") onRedo();
    else if (id === "save") onSave();
    else if (id === "rename") onRename();
    else if (id === "copy") onSaveCopy();
    else if (id === "import") onImport();
    else if (id === "export") onExport();
    else if (id === "export-options") onExportOptions?.();
    else if (id === "wireframe") onWireframe();
    else if (id === "link") void copyLink();
    else if (id === "settings" || id === "file:properties" || id === "about") setSettingsOpen(true);
    else if (id === "mapping-grid") { setPane("surfaces"); setSettingsOpen(true); }
    else if (id === "library") location.assign("/map/");
    else if (id === "studio") location.assign("/");
    else if (id.startsWith("workspace:")) onWorkspace(id.slice("workspace:".length) as MapWorkspace);
    else if (id.startsWith("panel:")) onShowPanel?.(id.slice("panel:".length));
  };
  const fileMenu = <MenuButton label="Document controls" items={documentItems} onSelect={act}><AetherIcon name="menu" /></MenuButton>;
  return <>
    <ModelStudioHeader app="map" title="Aether Map" name={file?.name ?? "Untitled show"}
      workspaceName={file?.branch_label ?? file?.branch ?? "Main"} onAction={act}
      commands={[
        ...MAP_WORKSPACES.map(value => ({ id: `workspace:${value.id}`, label: `Switch to ${value.label}`, category: "Workspace" })),
        ...(onShowPanel ? [
          { id: "panel:notes", label: "Open document notes", category: "Workspace" },
          { id: "panel:reminders", label: "Open reminders", category: "Workspace" },
        ] : []),
        ...documentItems.map(({ id, label, shortcut, disabled, disabledReason }) => ({ id, label, shortcut, disabled, disabledReason, category: "Document" })),
      ]}
      utilities={<><WorkspaceQuickControls appID="map" appName="Aether Map" apps={applications}
        defaultPinnedIDs={["theme","comments","apps","share"]} onSettings={() => setSettingsOpen(true)}
        viewControls={<><StudioModeButton preset={preset} onChange={onPresetChange}/><WorkspaceWindowMenu/></>} /></>} />
    {fileMenuTarget && createPortal(fileMenu, fileMenuTarget)}
    <ApplicationSettings appID="map" name="Aether Map" onSettings={() => setSettingsOpen(true)} />
    <SettingsWindow open={settingsOpen} title="Aether Map settings"
      sections={[{ title: "General", panes: [
        { id: "workspace", label: "Workspace", icon: <AetherIcon name="windows" /> },
        { id: "surfaces", label: "Surfaces", icon: <AetherIcon name="surface-map" /> },
      ] }]}
      activePaneID={pane} onSelectPane={setPane} onClose={() => setSettingsOpen(false)}>
      {pane === "workspace" ? (
        <SettingsCard title="Workspace" caption="Arrange the panels around your show.">
          <SettingsRow label="Layout">
            <SelectField aria-label="Workspace layout" value={preset} onChange={(event) => onPresetChange(event.target.value as LayoutPreset)}
              options={[{ value: "docked", label: "Docked" }, { value: "floating", label: "Floating" }, { value: "canvas", label: "Canvas" }]} />
          </SettingsRow>
          <SettingsRow label="Sidebar tabs" caption="Top and bottom tabs use the full-height shared sidebar.">
            <SelectField aria-label="Sidebar tabs" value={sidebarVariant} onChange={event => onSidebarVariantChange(event.target.value as "rail" | "tabs-top" | "tabs-bottom")}
              options={[{ value: "tabs-top", label: "Top" }, { value: "tabs-bottom", label: "Bottom" }, { value: "rail", label: "Side rail" }]} />
          </SettingsRow>
          {sidebarVariant === "rail" && <SettingsRow label="Sidebar position" caption="Outside places panels against the window edges, with icon rails beside the workspace. Inside keeps icon rails at the edges.">
            <SelectField aria-label="Sidebar position" value={panelsOnOuterEdge ? "outside" : "inside"}
              onChange={(event) => onPanelEdgeChange(event.target.value === "outside")}
              options={[{ value: "outside", label: "Outside" }, { value: "inside", label: "Inside" }]} />
          </SettingsRow>}
        </SettingsCard>
      ) : (
        <SurfaceLookSettings look={surfaceLook} onChange={onSurfaceLook} />
      )}
    </SettingsWindow>
    <Dialog open={Boolean(fallbackLink)} title="Document link" onClose={() => setFallbackLink("")}
      actions={<Button onClick={() => setFallbackLink("")}>Done</Button>}>
      <p>Select and copy this link to open the saved show.</p>
      <TextField aria-label="Document link" value={fallbackLink} readOnly onFocus={(event) => event.currentTarget.select()} />
    </Dialog>
  </>;
}

/** Workspace choices stay over the canvas, separate from document identity. */
export function MapWorkspaceControls({ workspace, onWorkspace, visualEditor, onVisualEditor, renderView }: Pick<MapDocumentHeaderProps, 'workspace' | 'onWorkspace' | 'visualEditor' | 'onVisualEditor'> & {
  /** Scene: render the whole scene, or one surface straight-on. */
  renderView?: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void };
}) {
  return <><WorkspaceSwitcher workspaces={MAP_WORKSPACES} workspaceID={workspace} onSelect={id=>onWorkspace(id as MapWorkspace)}/>
    {workspace === 'visualization' && visualEditor === 'advanced' && onVisualEditor && <Button aria-label="Switch to simple editor" onClick={() => onVisualEditor('simple')}>Simple</Button>}
    {workspace === 'visualization' && visualEditor === 'simple' && onVisualEditor && <Button aria-label="Advanced editor" onClick={() => onVisualEditor('advanced')}>Advanced</Button>}
    {workspace === 'visualization' && renderView && <SelectField aria-label="Render view" value={renderView.value} options={renderView.options} onChange={e => renderView.onChange(e.target.value)} />}
    {/* Rooms switch from the workspace dropdown; no duplicate jump buttons. */}
    <BodyTrackingStatus/><MidiControlsButton/>
  </>;
}
