import { useMidiAssignments } from './live/midi-assignments';
import { CubePosePanel } from './panels/CubePosePanel';
import { applyCubeGeometry } from './cube-pose';
import { loopCredit } from './features/bundled-loops';
import { useBodyCleanup } from './body/runtime';
import { PerformanceView } from './performance/PerformanceView';
import { VisualInspector } from './panels/VisualInspector';
import { SimpleVisualWorkspace } from './panels/SimpleVisualWorkspace';
import { addSimpleVisual, replaceSimpleVisual, moveSimpleVisual } from './simple-visuals';
import { CueList, CueProperties, PlayersTree, SceneClipProperties, ShowAudioProperties, ShowExportPanel, ShowPlaybackFields, ShowTimelinePanel, ShowWorkspace } from './panels/ShowWorkspace';
import { activeShow, crossedCues, cueAllowed, newShowProgram, normalizeShowTimeline, withActiveShow, withShowAudio, type ShowCue, type ShowTimeline } from './show-timeline';
import { subscribeMidi, midiState } from './live/midi';
import { normalizeDocument } from './normalize-document';
import { TimelineTabs } from './panels/TimelineTabs';
import { readTrayPanels, trayHeightKind, TRAY_KEY } from './tray-panels';
import { TimelineMixer } from './panels/TimelineMixer';
import { poolSource, POOL_SOURCES } from './pool-sources';
import { AssetBrowser } from './panels/AssetBrowser';
import { currentTimelineID, timelineName, createTimeline, removeTimeline, timelineTracks, timelineVisuals, MAIN_TIMELINE, TIMELINE_DRAG_PREFIX, placeTimeline, canNestTimeline } from './timelines';
import { useContextCommands } from '@aether/ui';
import { TimelineAudioProvider } from './live/TimelineAudioContext';
import { TimelineAudio } from './panels/TimelineAudio';
import { newScene, newSurface, showForOutput } from './document';
import { PoolProperties } from './panels/MediaPool';
import { TimelineTree, type TimelinePoolActions } from './panels/TimelinePool';
import { CompositionTimeline } from './panels/CompositionTimeline';
import { visualSource, addVisualTrack, placePoolAsset, removePoolAsset, type PoolAsset } from './media-pool';
import { SurfaceAnimationProperties } from './panels/SurfaceAnimationProperties';
import { ModulationContext } from "./features/ModulationContext";
import { DEFAULT_LFOS } from "./features/types";
import { ApplicationStatusBar, IconButton, SegmentedControl, TreePanelSplit, useScopedAetherTheme } from "@aether/ui";
import { useDocumentConnection } from "@aether/session/useDocumentConnection";
import "./CanvasLayout.css";
import "./panels/MapInspector.css";
import { MapAssistant, useMapAssistantSessions } from "./panels/MapAssistant";
import { useMapAgent } from "./use-map-agent";
import { mappingSvg, exportName } from "./projection-export/geometry";
import { downloadProjection } from "./projection-export/archive";
import { RegionControls } from "./mask/RegionControls";
import { CreateMaskDialog } from './mask/CreateMaskDialog';
import { placeContent, type ContentTarget, type ContentPlacement } from './content-placement';
import { visualSurface, newVisual } from './visual-document';
import { createVisualCommands } from './visual-commands';
import { VisualAssetsPanel } from './panels/VisualAssetsPanel';
import { VisualProperties } from './panels/VisualProperties';


import { activeAsset, assetSurface, appendContent, contentClip, allSources, patchAssetSource, sourceID } from './surface-assets';
import { useMapAutosave } from "./use-map-autosave";
import { sceneSize } from "./scene-size";
import { TransformPanel } from "./panels/TransformPanel";
import { ColorPanel } from "./panels/ColorPanel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AetherIcon,
  Inspector,
  InspectorSection,
  ToolIcon,
  Button,
  EmptyState,
  Dialog,
  FieldRow,
  TextField,
  StudioWorkspace as WorkspaceShell,
  type WorkspaceShellHandle,
  standardWorkspacePanels,
  type LayoutPreset,
} from "@aether/ui";
import { duplicateSurface as copySurface } from "./surface-interaction";
import { SurfaceCanvas } from "./SurfaceCanvas";
import { MappingControls } from "./MappingControls";
import { joinCorners, detachCorner, maintainCornerWelds } from './corner-welds';
import { replaceMaskShape, moveMaskControl } from './mask/curves';
import { useMappingPreferences } from "./mapping-preferences";
import type { ActiveHandle } from "./useSurfaceInteraction";
import { useOutputSession, type OutputDisplay } from "./output-session";
import { naturalSize } from "./media-import";
import { removeUnusedMedia } from "./media-usage";
import { SetupBackgroundPanel } from "./panels/SetupBackgroundPanel";
import { backdropSurface, backgroundLayer, backgroundLayerID } from "./background-layer";
import { LayersPanel } from "./panels/LayersPanel";
import { ScenePropertiesDialog } from "./panels/ScenePropertiesDialog";
import { canDeleteLayer, deleteTreeLayer, canvasDestinationRowID, folderID, moveCanvasItemToScene, resolveTreeID, unassignCanvasItem } from "./scene-tree";
import { applyGroupGeometry } from "./group-interaction";
import { VisualGallery } from "./panels/VisualGallery";
import { VisualThumbnail } from "./panels/SimpleVisualWorkspace";
import { PropertiesPanel } from "./panels/PropertiesPanel";
import { ProgramPanel } from "./panels/ProgramPanel";
import { SceneProperties } from "./panels/SceneProperties";
import { DeviceManager } from "./panels/DeviceManager";
import { MediaPanel } from "./panels/MediaPanel";
import { OutputDialog } from "./panels/OutputDialog";
import {
  ExportWorkspace,
  WorkspaceTray,
  type WorkspaceID,
} from "./panels/WorkspaceTray";
import { SurfacesStrip } from "./panels/SurfacesStrip";
import {
  deleteMedia,
  devices,
  fromBase64,
  hosted,
  installerURL,
  library,
  mediaExtension,
  mediaUrl,
  uploadMedia,
} from "./api";
import { parseShow, serializeShow } from "./show-file";
import { importSurfacesFromSvg } from "./svg-import";
import { TOOL_SHORTCUTS, type MaskTool } from "./mask/tools";
import { surfaceFromPath } from "./mask/shape-surface";
import { useDocumentHistory } from "./history";
import { evaluateShow } from "./playback";
import {
  activeScene,
  activeSurfaces,
  allSurfaces,
  DEFAULT_SURFACE_LOOK,
  groupSurfaces,
  emptyShow,
  nextId,
  quadCorners,
  withSurfaceCollection,
  withSurfaces,
  type CueAction,
  type MapShow,
  type MediaRef,
  type Point,
  type Quad,
  type Scene,
  type Surface,
} from "./document";
import { useTransport } from "./use-transport";
import { newFeature } from "./features/new-feature";
import type { FeatureKind } from "./features/types";
import { OutputProperties } from "./panels/OutputProperties";
import { OutputsPanel } from "./panels/OutputsPanel";
import { SCENE_PRESETS } from "./features/scene-presets";
import { useSceneCommands } from "./use-scene-commands";
import { useOutputCommands } from "./use-output-commands";
import { useFolderCommands } from "./use-folder-commands";
import { AddShapeSheet, type AddShapeChoice } from "./panels/AddShapeSheet";
import { compoundFolderName, compoundSurfaces, linkedFaceCorners, type CompoundShape } from "./features/shape-groups";
import { validateTransparentPng } from "./features/transparent-png";
import type { RecordingSize } from "./export-video";
import { cameraKey } from "./live/cameras";
import { useCameraCleanup } from "./live/output-live";
import { MapRibbon } from "./panels/MapRibbon";
import { ShowFileTabs, type DocumentEntry } from "./panels/ShowFileTabs";
import { MapDocumentHeader, MapWorkspaceControls } from "./panels/MapDocumentHeader";
import { MapCameraControls, MapViewTools } from "./panels/MapViewTools";
import { assetCredit, type AssetResult } from "./assets/openverse";
import type { MapWorkspace } from "./panels/map-ribbon-layout";
import "./map.css";

const EXTENSION = ".aethermap";

const TIMELINE_HEIGHT_KEY = "aether-map.timeline-height";
const INPUT_PREVIEW_KEY = "aether-map.input-preview";

// Low enough that the Surfaces strip can be pulled down to just its tiles.
const MIN_TIMELINE = 72;

/**
 * Tray height is remembered per workspace, because they do not want the same
 * room. A timeline needs depth to show tracks against a ruler; the Surfaces
 * strip is one row of tiles and anything more is empty space you have to look
 * past. Sharing one height meant whichever you set last was wrong for the other.
 */
const TRAY_HEIGHTS: Partial<Record<WorkspaceID, number>> = { surfaces: 72, timeline: 340 };
function readTimelineHeight(workspace: WorkspaceID): number {
  try {
    const stored = Number(localStorage.getItem(`${TIMELINE_HEIGHT_KEY}.${workspace}`));
    if (Number.isFinite(stored) && stored >= MIN_TIMELINE) return stored;
  } catch {
    // Storage can be unavailable; the default is fine.
  }
  return TRAY_HEIGHTS[workspace] ?? 240;
}

function migrateOutputsSidebar() {
  // Preserve the selected collection when upgrading the former Outputs tab.
  try {
    for (const mode of ["mapping", "visualization"]) {
      const key = `aether-map.${mode}`;
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved?.version !== 1 || !saved.layouts) continue;
      let changed = false;
      for (const layout of Object.values(saved.layouts) as Record<string, { placement: string }>[]) {
        if (!layout?.outputs) continue;
        if (["docked", "floating"].includes(layout.outputs.placement)) layout.layers = { placement: "docked" };
        delete layout.outputs;
        changed = true;
      }
      if (changed) localStorage.setItem(key, JSON.stringify(saved));
    }
  } catch { /* A saved layout must never prevent opening a show. */ }
  return true;
}

export default function App() {
  useState(migrateOutputsSidebar);
  const document_ = useDocumentHistory<MapShow>(() => normalizeDocument(emptyShow()));
  const show = document_.present;
  const assistantSessions = useMapAssistantSessions();
  // Remembered like the layout and the timeline height beside it. Map reloads
  // on save and on rename, so a preference held only in component state comes
  // back on every few minutes — which reads as the editor overruling you.
  const [selectedPoolID, setSelectedPoolID] = useState<string | null>(null);
  const [selectedTrackID, setSelectedTrackID] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(() => {
    try { return localStorage.getItem(INPUT_PREVIEW_KEY) !== "hidden"; }
    catch { return true; }
  });
  const toggleInput = () => setShowInput((visible) => {
    const next = !visible;
    try { localStorage.setItem(INPUT_PREVIEW_KEY, next ? "shown" : "hidden"); }
    catch { /* Storage is optional. */ }
    return next;
  });
  const [selectedID, setSelectedID] = useState<string | null>(null);
  useBodyCleanup();
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [selectedLayerIDs, setSelectedLayerIDs] = useState<readonly string[]>([]);
  const [selectedClipID, setSelectedClipID] = useState<string | null>(null);
  /**
   * Which room you are working in. Mapping is surfaces and warp against the
   * physical thing; Visualization is content and playback. Same document,
   * different layout — the way Aether Animation switches workspaces.
   */
  const [mode, setMode] = useState<MapWorkspace>("mapping");
  const [visualEditor, setVisualEditor] = useState<'simple' | 'advanced'>(() => {
    try { return localStorage.getItem('aether-map.visual-editor') === 'advanced' ? 'advanced' : 'simple'; }
    catch { return 'simple'; }
  });
  const simple = mode === 'visualization' && visualEditor === 'simple';
  const changeVisualEditor = (next: 'simple' | 'advanced') => {
    setVisualEditor(next);
    try { localStorage.setItem('aether-map.visual-editor', next); } catch { /* Optional preference. */ }
  };

  const [selectedOutputID, setSelectedOutputID] = useState<string | null>(null);
  const rehearsalOutput = show.outputs.find(output => output.id === selectedOutputID) ?? show.outputs[0];
  // The show plays on its own clock: the transport runs the show timeline's
  // length, and its soundtrack plays as an audio track on that clock.
  const playbackShow = mode === 'show' ? withShowAudio(show) : show;
  const [selectedShowClipID, setSelectedShowClipID] = useState<string | null>(null);
  const [selectedCueID, setSelectedCueID] = useState<string | null>(null);
  const outputWorkspace = mode === 'mapping' ? 'mapping' : 'visualization';
  const { transport, timeS, seek, togglePlay, playFrom } = useTransport(playbackShow);
  // Loop counts for this run; a restart or stop starts a new run.
  const cueRuns = useRef(new Map<string, number>());
  const goIndex = useRef(0), lastShowTime = useRef(0), runCueRef = useRef<(cue: ShowCue) => void>(() => {});
  const showRef = useRef(show); showRef.current = show;
  const [layout, setLayout] = useState<LayoutPreset>(() => {
    try {
      const stored = localStorage.getItem("aether-map.layout.studio-v1");
      if (stored === "floating" || stored === "canvas" || stored === "docked") return stored;
    } catch { /* Storage is optional. */ }
    return "floating";
  });
  const changeLayout = (next: LayoutPreset) => {
    setLayout(next);
    try { localStorage.setItem("aether-map.layout.studio-v1", next); } catch { /* Storage is optional. */ }
  };
  const [panelsOnOuterEdge, setPanelsOnOuterEdge] = useState(() => {
    try { return localStorage.getItem("aether-map.editor-panel-edge.v2") === "outside"; }
    catch { return false; }
  });
  const [sidebarVariant, setSidebarVariant] = useState<"rail" | "tabs-top" | "tabs-bottom">(() => {
    try {
      const saved = localStorage.getItem("aether-map.editor-sidebar.v2");
      if (saved === "rail" || saved === "tabs-bottom") return saved;
    } catch { /* Storage is optional. */ }
    return "rail";
  });
  const changeSidebarVariant = (next: "rail" | "tabs-top" | "tabs-bottom") => {
    setSidebarVariant(next);
    try { localStorage.setItem("aether-map.editor-sidebar.v2", next); } catch { /* Storage is optional. */ }
  };
  const changePanelEdge = (outside: boolean) => {
    setPanelsOnOuterEdge(outside);
    try { localStorage.setItem("aether-map.editor-panel-edge.v2", outside ? "outside" : "inside"); }
    catch { /* Storage is optional. */ }
  };
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [naming, setNaming] = useState(false);
  const [copying, setCopying] = useState(false);
  const [openByMode, setOpenByMode] = useState(() => ({ mapping:readTrayPanels('mapping'), visualization:readTrayPanels('visualization'), show:[] as WorkspaceID[] }));
  const openPanels = openByMode[mode], workspace = trayHeightKind(openPanels);
  const [timelineToolbarHost, setTimelineToolbarHost] = useState<HTMLDivElement | null>(null);
  const [mixerTrackID, setMixerTrackID] = useState<string | null>(null);
  const [exportOptions, setExportOptions] = useState(false);
  const updatePanels = (panels: WorkspaceID[]) => {
    setOpenByMode(current => ({ ...current, [mode]:panels }));
    if (trayHeightKind(panels) !== workspace) setTimelineHeight(readTimelineHeight(trayHeightKind(panels)));
    try { localStorage.setItem(`${TRAY_KEY(mode)}.panels`, JSON.stringify(panels)); } catch { /* Optional layout. */ }
  };
  const setWorkspace = (id: WorkspaceID) => { if (!openPanels.includes(id)) updatePanels([...openPanels, id]); };
  const togglePanel = (id: WorkspaceID) => updatePanels(openPanels.includes(id)
    ? openPanels.filter(p => p !== id)
    : [...openPanels, id]);
  const [choosingOutput, setChoosingOutput] = useState(false);
  const [tool, setTool] = useState<MaskTool>("select");
  const [mappingPreferences, setMappingPreferences] = useMappingPreferences();
  const [activeMappingHandle, setActiveMappingHandle] = useState<ActiveHandle | null>(null);
  // Brush settings are the operator's, not the show's: a saved file records the
  // strokes, never what the brush happened to be set to when they were made.
  const [paintColor, setPaintColor] = useState("#ffffff");
  const [paintWidth, setPaintWidth] = useState(8);
  const [cutout, setCutout] = useState(false);
  // Every open output window, by output id. `deviceSize` below is whichever one
  // the selected output owns, for the panels that describe a single device.
  const [displays, setDisplays] = useState<Record<string, OutputDisplay>>({});
  // The footer widget area (file row, mapped surfaces, timeline) is toggled
  // from the aux toolbar like the other auxiliary panels.
  const [bottomWidget, setBottomWidget] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem("aether-map.bottom-dock.v1");
      if (saved === "closed") return null;
      if (saved && ["files", "surfaces", "timeline"].includes(saved)) return saved;
    } catch { /* Storage is optional. */ }
    return "files";
  });
  const pickBottomWidget = (id: string) => setBottomWidget(current => {
    const next = current === id ? null : id;
    try { localStorage.setItem("aether-map.bottom-dock.v1", next ?? "closed"); } catch { /* Storage is optional. */ }
    return next;
  });
  // The timeline widget belongs to the visualization and show workspaces only.
  const dockWidget = bottomWidget === "timeline" && (mode === "mapping" || simple) ? "files" : bottomWidget;
  const [fileMenuTarget, setFileMenuTarget] = useState<HTMLSpanElement | null>(null);
  const [xray, setXray] = useState(false);
  // Visualization's left panel: standard tabs, Surfaces tree | Visual layers.
  const [vizPanelTab, setVizPanelTab] = useState<"list" | "visuals">("visuals");
  const vizTab = vizPanelTab;
  // "+" opens the Visual gallery in both editors.
  // The one visual gallery, both editors: 'add', or the visual being replaced.
  const [gallery, setGallery] = useState<'add' | string | null>(null);
  const addVisual = () => setGallery('add');
  /** Adds a scene visual exactly as the simple editor does. */
  const addSceneVisual = (source: Surface["source"], name: string, poolID?: string) => {
    const next = addSimpleVisual(show, source, name, poolID);
    if (next === show) return;
    edit(() => next); const visual = next.visuals!.at(-1)!; selectAsset(visual.id, visual.id); playFrom(timeS);
  };
  const chooseVisual = (source: Surface["source"], name: string, poolID?: string) => {
    if (gallery && gallery !== 'add') edit(current => replaceSimpleVisual(current, gallery, source, name)); else addSceneVisual(source, name, poolID);
  };
  const galleryIntent = () => gallery && gallery !== 'add' ? { kind: 'replace-visual' as const, targetID: gallery } : { kind: 'simple' as const };
  const workspaceShell = useRef<WorkspaceShellHandle>(null);
  /**
   * Which tree the Properties panel is answering for. Layers, Scenes and Outputs
   * each keep their own selection, so "what is selected" is genuinely ambiguous
   * without recording which one you touched last.
   */
  const [focus, setFocus] = useState<"layer" | "scene" | "output">("layer");
  /** Scene creation and scene properties: dialogs the merged tree opens. */
  const [sceneDraft, setSceneDraft] = useState<{ id: string | null; name: string; size: { width: number; height: number } } | null>(null);
  const [pickingPreset, setPickingPreset] = useState(false);
  const [managingDevices, setManagingDevices] = useState(() => new URLSearchParams(location.search).get('players') === '1');
  const [creatingMask, setCreatingMask] = useState<'text' | 'image' | 'subject' | null>(null);
  const [addingShape, setAddingShape] = useState(false);
  const [recordingSize, setRecordingSize] = useState<RecordingSize>("1080p");
  const [timelineHeight, setTimelineHeight] = useState(() => readTimelineHeight(trayHeightKind(readTrayPanels("mapping"))));
  const stageRef = useRef<HTMLDivElement>(null);

  const enterMode = useCallback((next: MapWorkspace) => {


    if (next === "visualization") {
      try {
        if (!localStorage.getItem("aether-map.visualization")) {
          const previous = localStorage.getItem("aether-map.sequence");
          if (previous) localStorage.setItem("aether-map.visualization", previous);
        }
      } catch { /* Layout persistence is optional. */ }
    }
    setMode(next);
    if (next === 'show') { setFocus('output'); setSelectedPoolID(null); setBottomWidget('timeline'); }
    setTool("select");
    setCutout(false);
    setSelectedClipID(null);
    setTimelineHeight(readTimelineHeight(trayHeightKind(readTrayPanels(next))));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(`${TIMELINE_HEIGHT_KEY}.${workspace}`, String(timelineHeight));
    } catch {
      // A private window or blocked storage is not a reason to fail an edit.
    }
  }, [timelineHeight, workspace]);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaIntent = useRef<{ kind: "layer" | "new-layer" | "library" | "assign" | "scene" | "simple" | "replace-visual"; targetID?: string; clipID?: string; pngOnly?: boolean }>({ kind: "layer" });
  const pickMedia = (kind: "layer" | "new-layer" | "library" | "assign", targetID?: string, pngOnly = false) => {
    mediaIntent.current = { kind: kind === "layer" && mode === "visualization" && focus === "scene" ? "scene" : kind, targetID, clipID: selectedClipID ?? undefined, pngOnly };
    if (fileRef.current) {
      fileRef.current.accept = pngOnly ? ".png,image/png" : "image/*,video/*";
      fileRef.current.click();
    }
  };
  const backgroundRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<HTMLInputElement>(null);
  //: Stored filenames seen this session — the candidates for cleanup. The
  //: server, not this set, decides what is safe to delete.
  const knownFilesRef = useRef<Set<string>>(new Set());

  const surfaces = activeSurfaces(show);
  const authoredSurfaces = allSurfaces(show);
  const scene = activeScene(show);
  useScopedAetherTheme("aether-slate", "dark");
  const artboardSize = useMemo(() => sceneSize(show), [show]);
  const background = backgroundLayer(show);
  const backgroundSelected = Boolean(background && selectedID === background.id);
  const selected = authoredSurfaces.find((s) => s.id === selectedID) ?? null;
  // Inspector selection is explicit. Playback's activeAsset fallback must not
  // turn selecting a surface into selecting whichever child is playing.
  const selectedPool = show.pool?.find(a => a.id === selectedPoolID) ?? null;
  const [previewOverride, setPreviewOverride] = useState<{timelineID:string;surfaceID:string|null}|null>(null);
  const editingTimelineID=currentTimelineID(show);
  const previewSurfaceID=previewOverride?.timelineID===editingTimelineID ? previewOverride.surfaceID : show.timelines?.find(t=>t.id===editingTimelineID)?.surfaceID;
  const previewSurface=mode==='visualization' && !selectedPool ? scene.surfaces.find(s=>s.id===previewSurfaceID) : undefined;
  const selectedVisual = show.visuals?.find(v => v.id === selectedClipID) ?? null;
  // Audio clips have no picture: no transform or appearance.
  const visualTabs = selectedVisual && show.tracks?.find(t => t.id === selectedVisual.trackID)?.kind !== 'audio' ? selectedVisual : null;
  useMidiAssignments(show, selectedClipID ?? selectedPoolID ?? selectedID);
  // A pointer drag can emit dozens of immutable document values per second.
  // Keep rendering those live, but serialize only the value at either end of
  // the gesture. Persisting the whole show to recovery storage on every pixel
  // was enough to starve the browser once a real project carried media,
  // tracking frames or many layers.
  const [gestureSnapshot, setGestureSnapshot] = useState<MapShow | null>(null);
  useCameraCleanup([...allSurfaces(show), ...(show.visuals ?? []).map(v => visualSurface(show, v))].flatMap((surface) => {
    return allSources(surface).flatMap(input => { const source = input.webcam ?? input.tracker; return source ? [cameraKey(source)] : []; });
  }));

  // --- Document ------------------------------------------------------------

  const autosaveShow = gestureSnapshot ?? show;
  const snapshotText = useMemo(() => new TextDecoder().decode(serializeShow(autosaveShow)), [autosaveShow]);
  const resetDocument = document_.reset;
  const resetShow = useCallback((value: MapShow) => resetDocument(normalizeDocument(value)), [resetDocument]);
  const persistence = useMapAutosave({ text: snapshotText, reset: resetShow,
    paused: false, setDirty, onError: setError });
  const { file, saveState } = persistence;
  const documentConnection = useDocumentConnection({app:"map",id:file?.id,name:file?.name??"Untitled show",writable:file?.writable,flush:()=>persistence.save(),saveCopy:()=>persistence.save(`${file?.name.replace(/\.aethermap$/i, "")??"Show"} copy`,true)});


  useEffect(() => { for (const media of show.media) knownFilesRef.current.add(media.file); }, [show.media]);

  const edit = useCallback(
    (next: MapShow | ((current: MapShow) => MapShow), coalesceKey?: string) => {
      document_.set(current => normalizeDocument(maintainCornerWelds(current, typeof next === 'function' ? next(current) : next)), coalesceKey);
      setDirty(true);
    },
    [document_],
  );

  const undo = useCallback(() => {
    // Independent assets keep their identity when target edits are undone.
    if (!selectedVisual) setSelectedClipID(null);
    document_.undo();
    setDirty(true);
  }, [document_, selectedVisual]);

  const redo = useCallback(() => {
    // Independent assets keep their identity when target edits are undone.
    if (!selectedVisual) setSelectedClipID(null);
    document_.redo();
    setDirty(true);
  }, [document_, selectedVisual]);

  // One editor instance survives the draft's first save. Opening another file or
  // branch navigates to a new instance; changing scenes cancels its running chat.
  const [agentEditorID] = useState(() => crypto.randomUUID());
  const agentInteraction = useMapAgent({
    contextKey: `${agentEditorID}:${new URLSearchParams(location.search).get('branch') ?? 'Main'}:${scene.id}`,
    show, writable: file?.writable !== false,
    available: persistence.ready && !gestureSnapshot && !document_.checkpoint.gesture && !naming &&
      !sceneDraft && !pickingPreset && !creatingMask && !addingShape && !managingDevices && !choosingOutput,
    canUndo: document_.canUndo, canRedo: document_.canRedo,
    selection: { surface_ids: [...new Set([...selectedLayerIDs, ...(selectedID ? [selectedID] : [])])], clip_id: selectedClipID, asset_id: selectedPoolID },
    commit: next => edit(next), undo, redo,
  });

  useContextCommands([
    { id:'undo', label:'Undo', heading:'Edit', shortcut:'Mod+Z', disabled:!(document_.canUndo), run:undo },
    { id:'redo', label:'Redo', shortcut:'Mod+Shift+Z', disabled:!(document_.canRedo), run:redo },
  ]);

  const store = async (name: string) => {

    try { await persistence.save(name, copying); setError(""); setStatus("All changes saved."); }
    catch (problem) { setError((problem as Error).message); }
  };
  const rename = (copy = false) => {
    setCopying(copy); setNameDraft(file?.name.replace(/\.aethermap$/i, "") ?? "Untitled show"); setNaming(true);
  };

  const save = useCallback(() => {

    if (!hosted) {
      setError("Saving needs the Aether Studio host. Open Aether Map from /map/.");
      return;
    }
    if (file) {
      void persistence.save().catch(problem => setError((problem as Error).message));
      return;
    }
    setCopying(false); setNameDraft("Untitled show");
    setNaming(true);
  }, [file, persistence]);

  // --- Transport -----------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // The target is an Element in a browser; guard anyway rather than assume.
      const typing =
        event.target instanceof Element &&
        Boolean(event.target.closest("input, textarea, select, [contenteditable], [role=dialog], [role=menu]"));
      if (!typing && !(event.target instanceof Element && event.target.closest("button, a")) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const next = TOOL_SHORTCUTS[event.key.toLowerCase()];
        if (next && (mode === "mapping" ? next !== "paint" : next === "select" || next === "paint")) {
          event.preventDefault();
          setTool(next);
          return;
        }
        if (event.key === "Escape") setTool("select");
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      // Never steal undo from a field the user is typing in.
      if (typing) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [undo, redo, mode]);

  // --- Output window -------------------------------------------------------

  const { openOutput, openWirelessOutput, closeOutput } = useOutputSession(playbackShow, transport, localUrls, setDisplays, setError, setStatus, file?.id ?? null, outputWorkspace);

  // --- Outputs -------------------------------------------------------------
  const selectOutput = useCallback((id: string | null) => {
    setSelectedLayerIDs([]);
    setSelectedOutputID(id); setFocus("output");
    setSelectedPoolID(null);
    if (id) workspaceShell.current?.showPanel("properties");
    setSelectedID(null); setSelectedClipID(null);

  }, []);
  const { selectedOutput, deviceSize, patchOutput, addOutput, deleteOutput, openOutputWindow } =
    useOutputCommands({ show, edit, selectedID: selectedOutputID, onSelect: selectOutput,
      displays, openOutput, openWirelessOutput, closeOutput,
      onManageDevices: () => setManagingDevices(true) });


  // --- Surfaces ------------------------------------------------------------

  const patchSurface = useCallback(
    (id: string, patch: Partial<Surface>, coalesceKey?: string) => {
      if (show.visuals?.some(v => v.id === id)) {
        edit(current => ({ ...current, visuals: current.visuals?.map(v => v.id === id && !v.locked ? { ...v, ...(patch.source ? { source: patch.source } : {}), ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}) } : v) }), coalesceKey);
        return;
      }
      const newID = nextId('k');
      const target = allSurfaces(show).find(s => s.id === id);
      const asset = target ? activeAsset(target, selectedClipID, timeS) : null;
      if (mode === 'visualization' && patch.source?.shader && target && !target.locked && !asset?.locked
        && !assetSurface(target, asset, show.media).source.shader) playFrom(asset?.startS ?? timeS);
      edit(current => {
        const existing = allSurfaces(current).find(s => s.id === id);
        if (existing && !patch.source && Object.entries(patch).every(([key, value]) => JSON.stringify(existing[key as keyof Surface]) === JSON.stringify(value))) return current;
        if (existing?.locked && ['corners', 'masks', 'maskCurves', 'alphaMask', 'bend', 'transform', 'animation', 'modulation', 'radiusPx'].some(key => key in patch)) return current;
        return withSurfaceCollection(current, id, list => {
        const linked = patch.corners ? linkedFaceCorners(list, id, patch.corners) : list;
        if (!linked) return list;
        return linked.map(s => {
      if (s.id !== id) return s;
      const { source, ...rest } = patch;
      const updated = source && !s.locked && !activeAsset(s, selectedClipID, timeS)?.locked
        ? patchAssetSource(s, source, selectedClipID, current.media, timeS, newID) : s;
      return { ...updated, ...rest };
    }); }); }, coalesceKey); }, [edit, selectedClipID, timeS, show, mode, playFrom],
  );
  const selectAsset = (surfaceID: string, clipID: string | null) => {
    setFocus("layer");
    workspaceShell.current?.showPanel("properties");
    const visual = show.visuals?.find(v => v.id === clipID || v.id === surfaceID || sourceID(v.id) === clipID);
    if (visual && !visual.targets.some(t => t.sceneID === show.activeSceneId)) {
      const target = visual.targets.find(t => show.scenes.some(s => s.id === t.sceneID));
      if (target) edit(current => ({ ...current, activeSceneId: target.sceneID }));
    }
    setSelectedPoolID(null);
    const surfaceTimeline=show.timelines?.find(t=>t.id===visual?.timelineRefID);
    if(surfaceTimeline?.surfaceID)setPreviewOverride({timelineID:editingTimelineID,surfaceID:surfaceTimeline.surfaceID});
    const id = visual?.id ?? clipID ?? surfaceID;
    setSelectedID(id); setSelectedClipID(id || null);
    setSelectedLayerIDs([]);
  };
  const assets = createVisualCommands({ show, edit, select: selectAsset });
  const changePool = (asset: PoolAsset) => edit(s => ({ ...s, pool: s.pool?.map(a => a.id === asset.id ? asset : a) }), `pool:${asset.id}`);
  const placeFromPool = (assetID: string, requestedTrackID?: string, startS?: number) => {
    const target = { sceneID: scene.id };
    const asset = show.pool?.find(a => a.id === assetID);
    const kind = show.media.find(m => m.id === asset?.source.mediaId)?.kind === 'audio' ? 'audio' : 'video';
    let next = show;
    let track = timelineTracks(next).find(t => t.id === (requestedTrackID ?? selectedTrackID)
      && t.targets.some(t => t.sceneID === scene.id) && (requestedTrackID || (t.kind ?? 'video') === kind));
    if (requestedTrackID && !track) return;
    track ??= timelineTracks(next).find(t => (t.kind ?? 'video') === kind && !t.locked && t.targets.some(t => t.sceneID === target.sceneID));
    if (!track) { next = addVisualTrack(next, [target], undefined, kind); track = next.tracks!.at(-1)!; }
    const child = currentTimelineID(next) === MAIN_TIMELINE && !assetID.startsWith(TIMELINE_DRAG_PREFIX)
      ? next.timelines?.find(t => t.surfaceID && track!.targets.some(a => a.surfaceID === t.surfaceID)) : undefined;
    if (child) {
      const childTrack = timelineTracks(next, child.id).find(t => (t.kind ?? 'video') === kind && !t.locked);
      if (!childTrack || track.locked) return;
      track = childTrack; next = { ...next, activeTimelineID:child.id };
    }
    const placed = assetID.startsWith(TIMELINE_DRAG_PREFIX) ? placeTimeline(next, assetID.slice(TIMELINE_DRAG_PREFIX.length), track.id, startS) : placePoolAsset(next, assetID, track.id, startS);
    if (placed === next) return;
    edit(() => placed); setSelectedTrackID(track.id); setWorkspace('timeline');
    const clip = placed.visuals!.at(-1)!; selectAsset(clip.id, clip.id);
  };



  const focusTimeline = () => {
    setPreviewOverride(null); setShowInput(true);
    seek(0); setSelectedClipID(null); setSelectedID(null); setSelectedTrackID(null); setSelectedPoolID(null);
    setFocus('layer'); setWorkspace('timeline');
  };
  const openTimeline = (id: string) => {
    edit(s => ({ ...s, activeTimelineID: id, ...(id !== MAIN_TIMELINE && !show.timelines?.find(t => t.id === id)?.surfaceID ? { timelineMode:'advanced' as const } : {}) }));
    focusTimeline();
  };

  const addFeature = (kind: FeatureKind) => {
    setTool("select");
    if (mode === 'visualization' && kind !== 'surface' && kind !== 'mask') {
      const visual = newVisual(show, newFeature(kind, artboardSize, 0).source,
        focus === 'layer' && selectedVisual ? selectedVisual.targets.map(t => ({ ...t })) : focus === 'layer' && selected ? (selectedLayerIDs.includes(selected.id) ? selectedLayerIDs : [selected.id]).filter(id => surfaces.some(s => s.id === id && s.kind !== 'mask')).map(surfaceID => ({ sceneID: scene.id, surfaceID })) : [{ sceneID: scene.id }], timeS);
      edit(current => ({ ...current, visuals: [...(current.visuals ?? []), visual] }));
      selectAsset(visual.id, visual.id);
      if (kind === 'shader') playFrom(visual.startS);
      return;
    }
    const target = kind !== 'surface' && kind !== 'mask' && selected && !selected.locked ? selected : null;
    const surface = target ?? newFeature(kind === 'mask' ? 'mask' : 'surface', artboardSize, surfaces.length);
    const added = kind === 'surface' ? null : appendContent(surface, newFeature(kind, artboardSize, 0).source, show.media, timeS);
    if (added && kind === 'mask') added.clip.name = 'Mask';
    const next = added?.surface ?? surface;
    edit(current => target
      ? withSurfaceCollection(current, target.id, list => list.map(s => s.id === target.id ? next : s))
      : withSurfaces(current, list => [...list, next]));
    setFocus("layer");
    setSelectedLayerIDs([]);
    workspaceShell.current?.showPanel("properties");
    setSelectedID(surface.id); setSelectedClipID(added?.clip.id ?? null);
    if (added) seek(added.clip.startS);
  };

  const editAsset = (surfaceID: string, clipID: string) => {
    if (!show.visuals?.some(v => v.id === clipID)) return;
    selectAsset(surfaceID, clipID);
  };

  const gestureDirtyBefore = useRef(false);
  const deleteSurface = useCallback(
    (id: string) => {
      const surface = authoredSurfaces.find((entry) => entry.id === id);
      if (!surface || surface.locked) return;
      edit((current) => withSurfaceCollection(current, id, (list) => list.filter((s) => s.id !== id)));
      setSelectedID((current) => (current === id ? null : current));
      setSelectedClipID(null);
    },
    [edit, authoredSurfaces],
  );

  const selectSurface = useCallback((id: string | null) => {
    setFocus("layer");
    setSelectedPoolID(null);
    if (id) workspaceShell.current?.showPanel("properties");
    setSelectedLayerIDs([]);

    // Node editing and painting are modes you stay in: selecting something while
    // painting must not drop the brush, any more than it drops node editing.
    // Every other tool is a one-shot — draw a shape, return to select.
    setSelectedID(id); setSelectedClipID(null);
    setPreviewOverride({timelineID:currentTimelineID(show),surfaceID:id});
    setShowInput(true);
    setTool(current => current === "node" || current === "paint" ? current : "select");
  }, [show]);
  /**
   * A cube or a box is several surfaces that belong together, so it arrives as
   * a folder rather than as loose faces someone has to group by hand.
   */
  const addCompound = (shape: CompoundShape) => {
    const faces = compoundSurfaces(shape, artboardSize, surfaces.length, compoundFolderName(shape, surfaces));
    edit((current) => withSurfaces(current, (list) => groupSurfaces([...list, ...faces])));
    selectSurface(folderID(scene.id, faces[0].folder!));
  };

  const addShape = (choice: AddShapeChoice) => {
    if (choice.kind === "silhouette") { setCreatingMask(choice.mode); return; }
    if (choice.kind === "tool") { setTool(choice.tool); return; }
    if (choice.kind === "feature") {
      if (choice.feature !== "surface" && choice.feature !== "mask") enterMode("visualization");
      addFeature(choice.feature); return;
    }
    if (choice.kind === "compound") { addCompound(choice.shape); return; }
    if (choice.kind === "background") { backgroundRef.current?.click(); return; }
    // A transparent image defines its own mapped plane, even when another
    // surface is selected. General Add Media keeps its append-to-track behavior.
    pickMedia("new-layer", undefined, true);
  };

  const editSurface = (id: string) => {
    selectSurface(id);
  };
  const duplicateLayer = (id: string) => {
    const source = authoredSurfaces.find((entry) => entry.id === id);
    if (!source) return;
    const copy = copySurface(source);
    const visuals = (show.visuals ?? []).filter(v => v.targets.some(t => t.surfaceID === id)).map(v => ({ ...structuredClone(v), id: nextId('visual'), legacyTrack: v.legacyTrack ? copy.id : undefined,
      targets: v.targets.filter(t => t.surfaceID === id).map(t => ({ ...t, surfaceID: copy.id })) }));
    edit((current) => ({ ...withSurfaceCollection(current, id, (list) => list.flatMap((surface) => surface.id === id ? [surface, copy] : [surface])), visuals: [...(current.visuals ?? []), ...visuals] }));
    selectSurface(copy.id);
  };

  const reorderSurface = useCallback(
    (id: string, direction: -1 | 1) =>
      edit((current) =>
        withSurfaceCollection(current, id, (list) => {
          const index = list.findIndex((s) => s.id === id);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= list.length) return list;
          const next = [...list];
          [next[index], next[target]] = [next[target], next[index]];
          return next;
        }),
      ),
    [edit],
  );

  // --- Layer folders -------------------------------------------------------
  const { setFolder, renameFolder, dissolveFolder, newFolder } = useFolderCommands(show, edit);


  // --- Scenes --------------------------------------------------------------
  // The whole scene-command set lives in its own hook: it only ever touches the
  // document and the transport, and reading what "duplicate a scene" means
  // should not require scrolling past the canvas wiring.
  const leaveScene = useCallback(() => {
    setFocus("scene");
    workspaceShell.current?.showPanel("properties");
    setSelectedLayerIDs([]);

    setSelectedID(null);
    setSelectedClipID(null);
  }, []);
  const { selectScene, addScene, duplicateScene, deleteScene, moveScene, patchScene } =
    useSceneCommands({ show, edit, seek, onLeaveScene: leaveScene });


  // The raster an operator composes on is the active scene's artboard; the show
  // default only stands in for a scene without one. Matching a display or the
  // output window has to move whichever of the two is on screen, or the button
  // reads as broken: it reported 1920×1080 however often you pressed it.
  const matchOutputSize = useCallback(
    (width: number, height: number) =>
      scene?.artboard
        ? patchScene(scene.id, { artboard: { widthPx: width, heightPx: height } })
        : edit((current) => ({ ...current, output: { ...current.output, width, height } })),
    [scene, patchScene, edit],
  );

  const changeBackground = (setupBackground: Scene["setupBackground"]) => {
    patchScene(scene.id, { setupBackground });
    if (!setupBackground && backgroundSelected) selectSurface(null);
  };
  const deleteLayer = (id: string) => {
    const ids = selectedLayerIDs.includes(id) ? selectedLayerIDs : [id];
    if (!ids.every(rowID => canDeleteLayer(show, rowID))) return;
    const remove = (current: MapShow) => ids.reduce(deleteTreeLayer, current);
    const next = remove(show);
    edit(remove);
    setSelectedLayerIDs([]);
    setSelectedID(current => current && resolveTreeID(next, current) ? current : null);
    setSelectedClipID(current => current && resolveTreeID(next, current) ? current : null);
  };

  const transformLayer = focus !== "layer" || selectedClipID ? null : backgroundSelected ? backdropSurface(show) : selected;
  const patchLayer = (id: string, patch: Partial<Surface>, key?: string) => {
    if (id !== background?.id) { patchSurface(id, patch, key); return; }
    patchScene(scene.id, { setupBackground: { ...background.background,
      ...(patch.corners ? { corners: patch.corners } : {}),
      ...(patch.lockAspectRatio !== undefined ? { lockAspectRatio: patch.lockAspectRatio } : {}),
      ...(patch.locked !== undefined ? { locked: patch.locked } : {}),
      ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
    } }, key);
  };

  const setMasks = useCallback(
    (id: string, masks: Point[][]) => patchSurface(id, { masks, maskCurves: undefined }),
    [patchSurface],
  );

  const setMaskShape = useCallback(
    (id: string, shape: number, points: Point[]) =>
      edit(
        (current) =>
          withSurfaceCollection(current, id, (list) =>
            list.map((s) =>
              s.id === id
                ? s.locked ? s : { ...s, ...replaceMaskShape(s, shape, points) }
                : s,
            ),
          ),
        `mask:${id}:${shape}`,
      ),
    [edit],
  );

  const drawShape = useCallback(
    (shape: Point[], constrained = false, curves?: Surface["maskCurves"], nodeModes?: Surface["maskNodeModes"]) => {
      // Paint appends to the canvas you are painting on; every other tool cuts
      // a new shape. One stroke is content, not a mask, so it joins the painted
      // surface rather than becoming a surface of its own — otherwise a minute
      // of drawing would leave a hundred layers in the tree.
      if (tool === "paint") {
        if (selectedPoolID) return; // Pool drawings are edited in their source preview.
        const stroke = { points: shape as [number, number][], color: paintColor, widthPx: paintWidth };
        const existing = timelineVisuals(show).find(v => v.id === selectedClipID && visualSource(show, v).drawing && !v.locked);
        if (existing) {
          edit(current => ({ ...current, visuals: current.visuals?.map(v => v.id === existing.id
            ? { ...v, source: { ...visualSource(show, v), drawing: { ...visualSource(show, v).drawing, strokes: [...(visualSource(show, v).drawing?.strokes ?? []), stroke] } } } : v) }), 'paint-' + existing.id);
          return;
        }
        const canvas = newFeature("surface", show.output, surfaces.length);
        canvas.name = "Painting";
        canvas.corners = [[0, 0], [artboardSize.width, 0], [artboardSize.width, artboardSize.height], [0, artboardSize.height]];
        canvas.source = { ...canvas.source, rect: [0, 0, artboardSize.width, artboardSize.height], drawing: { strokes: [stroke] } };
        edit((current) => withSurfaces(current, (list) => [...list, canvas]));
        selectSurface(canvas.id);
        return;
      }
      // Built outside the updater so the id survives StrictMode's double run.
      const drawn = surfaceFromPath({ points: shape, curves: curves?.[0], nodeModes: nodeModes?.[0], closed: true }, artboardSize, surfaces.length, cutout);
      if (tool === "polygon") {
        drawn.name = `Polygon ${surfaces.length + 1}`;
        drawn.polygonSides = shape.length;
      }
      const square = tool === "square" || (tool === "rect" && constrained);
      const circle = tool === "circle" || (tool === "ellipse" && constrained);
      const primitive = square || circle ? {
        ...drawn, name: `${square ? "Square" : "Circle"} ${surfaces.length + 1}`,
        lockAspectRatio: true,
      } : drawn;
      const surface = cutout ? { ...primitive, sequence: true, source: { mediaId: null, rect: primitive.source.rect }, clips: [contentClip(drawn.source, show.media, timeS)] } : primitive;
      edit((current) => withSurfaces(current, (list) => [...list, surface]));
      selectSurface(surface.id);
      if (curves) setTool("node");
    },
    [cutout, edit, artboardSize, surfaces, selectSurface, show, selectedClipID, selectedPoolID, scene.id, timeS, tool, paintColor, paintWidth],
  );

  const addCue = useCallback(
    (surfaceID: string, action: CueAction) => {
      const cue = {
        id: nextId("c"),
        timeS: Math.round(timeS * 10) / 10,
        action,
        ...(action === "opacity" ? { value: 0.5 } : {}),
      };
      edit((current) =>
        withSurfaceCollection(current, surfaceID, (list) =>
          list.map((s) => (s.id === surfaceID ? { ...s, cues: [...s.cues, cue] } : s)),
        ),
      );
    },
    [edit, timeS],
  );

  const placeOnLayer = (mediaID: string, target: ContentTarget, placement: ContentPlacement) => {
    const asset = show.media.find(m => m.id === mediaID);
    if (!asset) return;
    const next = placeContent(show, { mediaId: asset.id, rect: [0, 0, asset.width, asset.height] }, { sceneID: scene.id, target, surfaceID: selectedID, clipID: selectedClipID, placement, timeS });
    edit(next);
    const added = next.visuals?.find(v => !show.visuals?.some(old => old.id === v.id));
    if (added) { selectAsset(added.id, added.id); seek(added.startS); }
    setStatus(`${placement === 'append' ? 'Appended' : 'Applied'} ${asset.name} to ${target === 'surface' ? selected?.name ?? 'surface' : target === 'scene' ? scene.name + ' (entire scene)' : 'mapped surfaces in ' + scene.name}.`);
  };

  const removeClip = assets.remove;

  const removeCue = useCallback(
    (surfaceID: string, cueID: string) =>
      edit((current) =>
        withSurfaceCollection(current, surfaceID, (list) =>
          list.map((s) =>
            s.id === surfaceID ? { ...s, cues: s.cues.filter((c) => c.id !== cueID) } : s,
          ),
        ),
      ),
    [edit],
  );

  const addMedia = useCallback(
    async (picked: File, backgroundSceneID?: string, credit?: MediaRef["credit"]) => {
      const intent = { ...mediaIntent.current }, sceneID = scene.id;
      if (intent.pngOnly) {
        try { await validateTransparentPng(picked); }
        catch (problem) { setError((problem as Error).message); return; }
      }
      const targetID = intent.kind === "assign" ? intent.targetID : intent.kind === "new-layer" ? undefined : selected?.id;
      const clipID = nextId("k");
      const created = !backgroundSceneID && (intent.kind === "layer" || intent.kind === "new-layer") && !targetID ? newFeature("surface", sceneSize(show), activeSurfaces(show).length) : null;
      const kind: MediaRef["kind"] = picked.type.startsWith("audio") ? "audio" : picked.type.startsWith("video") ? "video" : "image";
      if ((intent.kind === 'simple' || intent.kind === 'replace-visual') && kind === 'audio') {
        setError('Choose an image or video for a visual. Soundtracks can be added in the advanced editor.'); return;
      }
      const url = URL.createObjectURL(picked);
      let size;
      try {
        if (backgroundSceneID && kind !== "image") throw new Error("Choose a static image for the setup background.");
        size = await naturalSize(url, kind);
      } catch (problem) {
        URL.revokeObjectURL(url);
        setError((problem as Error).message);
        return;
      }
      const id = nextId("m");
      const media: MediaRef = {
        id,
        file: `${id}.${mediaExtension(picked)}`,
        name: picked.name,
        kind,
        bytes: picked.size,
        ...(credit ? { credit } : {}),
        width: size.width,
        height: size.height,
        ...(size.duration ? { duration: size.duration } : {}),
      };

      if (hosted) {
        try {
          await uploadMedia(picked, media.file);
          knownFilesRef.current.add(media.file);
          URL.revokeObjectURL(url);
        } catch (problem) {
          URL.revokeObjectURL(url);
          setError((problem as Error).message);
          return;
        }
      } else {
        setLocalUrls((current) => ({ ...current, [media.file]: url }));
      }

      edit((current) => {
        const next = { ...current, media: [...current.media, media] };
        if (backgroundSceneID) return {
          ...next,
          scenes: next.scenes.map((scene) => scene.id === backgroundSceneID
            ? { ...scene, setupBackground: { mediaId: media.id, visible: true, opacity: 0.6 } }
            : scene),
        };
        if (intent.kind === 'simple') return addSimpleVisual({ ...next, activeSceneId: sceneID }, { mediaId: media.id, rect: [0, 0, size.width, size.height] }, media.name, undefined, clipID);
        if (intent.kind === 'replace-visual') return replaceSimpleVisual(next, intent.targetID!, { mediaId: media.id, rect: [0, 0, size.width, size.height] }, media.name);
        if (intent.kind === "library" || kind === "audio") return next;
        if (intent.kind === "scene") return { ...next, visuals: [...(next.visuals ?? []), { ...newVisual(next, { mediaId: media.id, rect: [0, 0, size.width, size.height] }, [{ sceneID }], timeS), id: clipID }] };
        if (created) return { ...next, scenes: next.scenes.map(item => {
          if (item.id !== sceneID) return item;
            const board = sceneSize(next, item);
            const scale = Math.min(1, board.width * .6 / size.width, board.height * .6 / size.height);
            const width = size.width * scale, height = size.height * scale;
            return { ...item, surfaces: [...item.surfaces, { ...created, name: picked.name, lockAspectRatio: true,
              corners: quadCorners([(board.width - width) / 2, (board.height - height) / 2, width, height]),
              source: { mediaId: null, rect: [0, 0, size.width, size.height] }, sequence: true,
              clips: [contentClip({ mediaId: media.id, rect: [0, 0, size.width, size.height] }, [media], timeS, clipID)] }] };
        }) };
        if (targetID && next.visuals?.some(v => v.id === targetID)) return { ...next, visuals: next.visuals.map(v => v.id === targetID && !v.locked ? { ...v, source: { mediaId: media.id, rect: [0, 0, size.width, size.height], ...(visualSource(show, v).shader ? { shader: visualSource(show, v).shader } : {}) } } : v) };
        if (!targetID) return next;
        return withSurfaceCollection(next, targetID, list => list.map(surface => {
            if (surface.id !== targetID || surface.locked) return surface;
            const previous = assetSurface(surface, activeAsset(surface, intent.clipID ?? null, timeS), next.media).source;
            const source: Surface['source'] = { mediaId: media.id, rect: [0, 0, size.width, size.height], ...(intent.kind === 'assign' && previous.shader ? { shader: previous.shader } : {}) };
            return intent.kind === 'assign' ? patchAssetSource(surface, source, intent.clipID ?? null, next.media, timeS, clipID)
              : appendContent(surface, source, next.media, timeS, clipID).surface;
          }));

      });
      if (intent.kind === "simple") { selectAsset(clipID, clipID); playFrom(timeS); }
      else if (intent.kind === "scene") selectAsset(clipID, clipID);
      else if (created) selectAsset(created.id, clipID);
      else if (intent.kind === "layer" && targetID) selectAsset(targetID, clipID);
      setError("");
      return media.id;
    },
    [edit, scene.id, show, selected, timeS, selectAsset, playFrom],
  );

  const removeMedia = useCallback(
    (mediaID: string) => edit((current) => removeUnusedMedia(current, mediaID)),
    [edit],
  );

  /**
   * Delete stored files this show no longer references. The server refuses any
   * file another saved show still uses, so this cannot strip a show of its
   * pixels — it only tidies what is genuinely orphaned.
   */
  const cleanupMedia = useCallback(async () => {
    if (!file) return 0;
    const stored = await library.read(file.id);
    const saved = parseShow(fromBase64(stored.data_base64 ?? ""));
    const keep = new Set(saved.media.map((m) => m.file));
    let removed = 0;
    for (const name of knownFilesRef.current) {
      if (keep.has(name)) continue;
      if (await deleteMedia(name)) {
        knownFilesRef.current.delete(name);
        removed += 1;
      }
    }
    return removed;
  }, [file]);

  const importSvg = useCallback(
    async (picked: File) => {
      try {
        const { surfaces: imported, skipped } = importSurfacesFromSvg(
          await picked.text(),
          show,
        );
        if (imported.length === 0) {
          setError(skipped[0] ?? "No usable shapes in that drawing.");
          return;
        }
        edit((current) => withSurfaces(current, (list) => [...list, ...imported]));
        selectSurface(imported[0].id);
        setError("");
        setStatus(
          `Imported ${imported.length} surface${imported.length === 1 ? "" : "s"}` +
            (skipped.length ? ` · ${skipped.join("; ")}` : ""),
        );
      } catch (problem) {
        setError((problem as Error).message);
      }
    },
    [edit, show, selectSurface],
  );

  const exportProject = useCallback(() => {
    if (!file) {
      setError("Save the show first — the bundle is built from the saved copy.");
      return;
    }
    // The host builds it: it already holds the document and every asset.
    location.assign(`/api/map/project/${encodeURIComponent(file.id)}.zip`);
  }, [file]);

  const exportWireframe = useCallback(() => {
    try { downloadProjection(mappingSvg(show), `${exportName(file?.name ?? 'Show')}-mapping.svg`); }
    catch (error) { setError((error as Error).message); }
  }, [show, file]);

  const urls: Record<string, string> = {};
  for (const media of show.media) {
    urls[media.id] = localUrls[media.file] ?? mediaUrl(media);
  }

  // Visualization evaluates the playhead. Mapping renders authored geometry
  // independently, without changing this document or the live output.
  const resolved = evaluateShow(show, timeS);
  // Stepping back from a surface composition shows the complete Main composite.
  const previewShow = mode === 'visualization' && editingTimelineID !== MAIN_TIMELINE
    ? { ...show, activeTimelineID: MAIN_TIMELINE } : show;
  const previewResolved = previewShow === show ? resolved : evaluateShow(previewShow, timeS);

  /**
   * A browsed asset enters the show exactly as a local upload does: the same
   * `addMedia` path, so sizing, storage and placement cannot drift between the
   * two. Provider credit is saved with that exact media in the same undo step.
   */
  const importAsset = useCallback(async (picked: File, result: AssetResult) => {
    mediaIntent.current = { kind: "library" };
    const id = await addMedia(picked, undefined, assetCredit(result));
    if (!id) throw new Error("The file could not be imported. Check the file format and your project connection, then try again.");
  }, [addMedia]);

  const assetsPanel = (
    <MediaPanel
      show={show}
      settled={Boolean(file) && !dirty}
      onAdd={() => pickMedia("library")}
      onRemove={removeMedia}
      onCleanup={cleanupMedia}
      targetLayer={selectedVisual ? selectedVisual.name : selected && !selected.locked ? selected.name : null}
      selectedID={selectedID}
      onPlace={placeOnLayer}
      onImportAsset={importAsset}
    />
  );

  // Advanced keeps multi-timeline work in its own sidebar tab.
  const timelineActions: TimelinePoolActions = {
    onOpen: openTimeline,
    onSelect: id => {const surfaceID=show.timelines?.find(t=>t.id===id)?.surfaceID;setSelectedPoolID(null);setShowInput(true);
      if(surfaceID){const use=show.visuals?.find(v=>v.timelineRefID===id);if(use)selectAsset(use.id,use.id);else selectSurface(surfaceID);}
      else {setPreviewOverride({timelineID:editingTimelineID,surfaceID:null});setSelectedClipID(null);setSelectedID(null);}},
    onCreate: name => { edit(s => createTimeline(s, name)); focusTimeline(); },
    onRename: (id, name) => edit(s => ({ ...s, timelines:s.timelines?.map(t => t.id === id ? { ...t, name } : t) })),
    onRemove: id => { edit(s => removeTimeline(s, id)); focusTimeline(); },
    onAppend: id => placeFromPool(`${TIMELINE_DRAG_PREFIX}${id}`),
  };

  // One selection and one target editor shared by the compact tray and timeline.
  const surfaceStrip = (
    <SurfacesStrip
      assignment={mode === "visualization" && selectedVisual && !selectedVisual.timelineRefID && show.tracks?.find(t => t.id === selectedVisual.trackID)?.kind !== "audio" ? { visual: selectedVisual, onChange: visual => assets.change(visual.id, visual, null) } : undefined}
      show={show}
      selectedID={selectedID}
      timeS={mode === "mapping" ? 0 : timeS}
      urls={urls}
      onSelect={selectSurface}
      addLabel={mode === "mapping" ? "New surface" : "Add visual"}
      onAdd={() => mode === "mapping" ? setAddingShape(true) : pickMedia("layer")}
      onEdit={editSurface}
    />
  );

  const workspaceTray = (
    <WorkspaceTray docked
              storageKey={TRAY_KEY(mode)} height={timelineHeight} onHeightChange={setTimelineHeight}
              open={openPanels}
              onToggle={togglePanel}
              toolbarRef={setTimelineToolbarHost} timelineLabel={`${timelineName(show)} timeline`}
              panels={{
                surfaces: surfaceStrip,
                timeline: (
                  <div className="map-bottom-timeline-content">
                  <TimelineTabs show={show} onOpen={openTimeline} onCreate={name => { edit(s => createTimeline(s, name)); focusTimeline(); }} />
                  <CompositionTimeline
                    show={show} trackID={selectedTrackID} toolbarHost={timelineToolbarHost}
                    onOpenClip={id => { const ref = show.visuals?.find(v => v.id === id)?.timelineRefID; if (ref) openTimeline(ref); }}
                    mixerOpen={openPanels.includes('audio')} onToggleMixer={() => togglePanel('audio')}
                    onOpenAudio={id => { setMixerTrackID(id); setWorkspace("audio"); }}
                    onTrack={id => { setSelectedTrackID(id); setSelectedClipID(null); setSelectedPoolID(null); }} onEdit={edit}
                    onDropPoolAsset={(assetID, trackID, time) => placeFromPool(assetID, trackID, time)}
                    timeS={timeS}
                    playing={transport.playing}
                    selectedID={focus === "layer" ? selectedID : null}
                    selectedClipID={focus === "layer" ? selectedClipID : null}
                    onSeek={seek}
                    onTogglePlay={togglePlay}
                    onSelectClip={selectAsset}
                    onChangeClip={(track, clip, key) => assets.change(track, { id: clip.id, startS: clip.startS, durationS: clip.durationS, inS: clip.inS, loop: clip.loop, continuous: false } as import('./visual-model').Visual, key)}
                    onRemoveClip={removeClip}
                    onAddCue={addCue}
                    onRemoveCue={removeCue}
                    onDuration={durationS => currentTimelineID(show) === MAIN_TIMELINE
                      ? patchScene(scene.id, { durationS }, `timeline-range:${scene.id}`)
                      : edit(s => ({ ...s, timelines:s.timelines?.map(t => t.id === currentTimelineID(s) ? { ...t, durationS } : t) }), `timeline-range:${currentTimelineID(show)}`)}
                    onMode={(mode) =>
                      edit((current) => ({
                        ...current,
                        playback: { ...current.playback, mode },
                      }))
                    }
                  />
                  </div>
                ),
                audio: <TimelineMixer tracks={timelineTracks(show)} selectedID={mixerTrackID} onSelect={setMixerTrackID}
                  onPatch={(id, patch) => edit(s => ({ ...s, tracks:s.tracks?.map(t => t.id === id ? { ...t, ...patch } : t) }))}
                  onClose={() => updatePanels(openPanels.filter(p => p !== 'audio'))} />,
              }}
            />
  );

  const outputProperties = <OutputProperties show={show} output={selectedOutput} workspace={outputWorkspace} size={artboardSize} display={deviceSize}
            documentID={file?.id ?? null}
            onChange={(patch) => selectedOutput && patchOutput(selectedOutput.id, patch)}
            onOpen={(display) => selectedOutput && openOutput(selectedOutput.id, display)}
            onOpenWireless={(kind) => selectedOutput && openWirelessOutput(selectedOutput.id, kind)}
            onMatchDisplay={matchOutputSize}
            recordingSize={recordingSize} onRecordingSize={setRecordingSize} />;

  // Show cues: timeline cues the playhead crosses, and MIDI-control cues.
  useEffect(() => {
    if (mode === 'show' && transport.playing) for (const cue of crossedCues(show, lastShowTime.current, timeS)) runCueRef.current(cue);
    lastShowTime.current = timeS;
  }, [timeS, mode, transport.playing, show]);
  useEffect(() => {
    if (mode !== 'show') return;
    let serial = midiState().eventSerial;
    return subscribeMidi(() => {
      const midi = midiState();
      if (midi.eventSerial === serial) return; serial = midi.eventSerial;
      const cc = midi.lastControl;
      if (cc === null || !(midi.controls[cc] > 0)) return;
      for (const cue of activeShow(showRef.current)?.cues ?? []) if (cue.trigger === 'midi' && cue.control === cc) runCueRef.current(cue);
    });
  }, [mode]);
  if (!persistence.ready) return <div role="status" className="map-loading">{error || "Opening your show…"}</div>;

  // Show control: edit the show timeline; fire cues from the timeline, GO and MIDI.
  const editShowTimeline = (change: (timeline: ShowTimeline) => ShowTimeline) => edit(s => withActiveShow(normalizeShowTimeline(s), program => ({ ...program, ...change(program) })));
  const selectedCue = activeShow(show)?.cues.find(c => c.id === selectedCueID) ?? null;
  const selectedShowClip = activeShow(show)?.tracks.flatMap(t => t.clips).find(c => c.id === selectedShowClipID) ?? null;
  const selectedShowAudio = activeShow(show)?.audio?.find(a => a.id === selectedShowClipID) ?? null;
  const runCue = (cue: ShowCue) => {
    if (!cueAllowed(cue, midiState().controls, cueRuns.current)) return;
    cueRuns.current.set(cue.id, (cueRuns.current.get(cue.id) ?? 0) + 1);
    if (cue.action === 'play') { if (!transport.playing) togglePlay(); }
    else if (cue.action === 'pause') { if (transport.playing) togglePlay(); }
    else if (cue.action === 'stop') { if (transport.playing) togglePlay(); seek(0); cueRuns.current.clear(); }
    else if (cue.action === 'jump') seek(cue.toS ?? 0);
    else edit(s => ({ ...s, output: { ...s.output, blackout: cue.action === 'blackout-on' } }));
    setStatus(`Cue: ${cue.name}`);
  };
  const runNextGo = () => {
    const go = (activeShow(show)?.cues ?? []).filter(c => c.trigger === 'go');
    if (!go.length) return;
    const cue = go[goIndex.current % go.length]; goIndex.current += 1; runCue(cue);
  };
  runCueRef.current = runCue;
  // One LayersPanel factory: Mapping's Layers/Scenes, Visualization's scene
  // picker and the Show workspace's Scenes section share its commands.
  const layersPanel = (view: "layers" | "scenes" | "scene-picker") => <LayersPanel view={view}
              onTreeEdit={edit}
              showAssets={false}
              show={show}
              selectedID={selectedVisual ? "" : selectedID} selectedClipID={null}
              selectedLayerIDs={selectedLayerIDs}
              onSelectLayers={ids => { selectSurface(ids.at(-1) ?? null); setSelectedLayerIDs(ids); }}
              scenes={{
                // A scene row is a cut and a selection at once: Properties
                // follows it, and a *different* scene also rewinds the
                // transport and drops the layer selection.
                // Selecting a scene row means the scene is the selection, so
                // the layer selection has to go either way. Cutting to a
                // different scene already clears it; clicking the scene you
                // are on has to clear it too, or the one toolbar would still
                // be pointed at a layer while a scene row is highlighted.
                select: (id) => {
                  setFocus("scene");
                  if (id !== show.activeSceneId) selectScene(id); else leaveScene();
                },
                add: addScene,
                duplicate: duplicateScene,
                delete: deleteScene,
                move: moveScene,
                patch: patchScene,
                addPreset: (presetID) => {
                  const preset = SCENE_PRESETS.find((entry) => entry.id === presetID);
                  if (!preset) return;
                  const scene = preset.build(show.output);
                  edit((current) => ({ ...current, scenes: [...current.scenes, scene], activeSceneId: scene.id }));
                },
                openProperties: (id) => {
                  if (id === null) setSceneDraft({ id: null, name: `Canvas ${show.scenes.length + 1}`, size: artboardSize });
                  else { selectScene(id); leaveScene(); }
                },
                openPresets: () => setPickingPreset(true),
              }}
              onSelectAsset={selectAsset} onEditAsset={editAsset}
              onChangeAsset={assets.change} onDeleteAsset={assets.remove} onDuplicateAsset={assets.duplicate} onMoveAsset={assets.move} onDropAsset={assets.drop}
              onSelect={selectSurface}
              onDelete={deleteLayer}
              onDuplicate={duplicateLayer}
              onEdit={editSurface}
              onPatch={patchSurface}
              onReorder={reorderSurface}
              onAdd={() => addFeature("surface")}
              onSetFolder={setFolder}
              onRenameFolder={renameFolder}
              onDissolveFolder={dissolveFolder}
              onNewFolder={newFolder}
            />;
  const showScenes = layersPanel("scene-picker");
  // The one file row's entries for this document: its Show, Canvases and Scenes.
  const documentEntries: DocumentEntry[] = [
    ...(show.shows ?? []).map(p => ({ id: `show:${p.id}`, label: p.name, kind: 'show' as const, icon: <AetherIcon name="play" /> })),
    ...show.scenes.map(c => ({ id: `canvas:${c.id}`, label: c.name, kind: 'canvas' as const, icon: <AetherIcon name="scene" /> })),
    { id: `scene:${MAIN_TIMELINE}`, label: 'Main', kind: 'scene', icon: <AetherIcon name="timeline-tracks" /> },
    ...(show.timelines ?? []).map(t => ({ id: `scene:${t.id}`, label: t.name, kind: 'scene' as const, icon: <AetherIcon name="timeline-tracks" /> })),
  ];
  return (
    <TimelineAudioProvider><ModulationContext.Provider value={{ lfos: show.lfos ?? DEFAULT_LFOS, timeS, onLfos: lfos => edit(current => ({ ...current, lfos })) }}>
    <div className="map-editor aui-studio-app aether-theme-model-studio">
      <TimelineAudio show={mode === 'show' ? showForOutput(playbackShow, rehearsalOutput) : playbackShow} timeS={timeS} playing={transport.playing} urls={urls} />
      <MapDocumentHeader fileMenuTarget={fileMenuTarget} visualEditor={visualEditor} onVisualEditor={changeVisualEditor} workspace={mode} onWorkspace={enterMode} file={file} preset={layout}
        onUndo={undo} onRedo={redo} canUndo={document_.canUndo} canRedo={document_.canRedo}
        onImport={() => svgRef.current?.click()} onExport={exportProject} onExportOptions={() => setExportOptions(true)} onWireframe={exportWireframe} canExport={Boolean(file)}
        onPresetChange={changeLayout} onSave={save} onStatus={setStatus}
        panelsOnOuterEdge={panelsOnOuterEdge} onPanelEdgeChange={changePanelEdge}
        sidebarVariant={sidebarVariant} onSidebarVariantChange={changeSidebarVariant}
        onRename={() => rename()} onSaveCopy={() => rename(true)}
        surfaceLook={show.surfaceLook ?? DEFAULT_SURFACE_LOOK}
        onSurfaceLook={(surfaceLook) => edit((current) => ({ ...current, surfaceLook }), "surface-look")}
        onShowPanel={id => workspaceShell.current?.showPanel(id)} />
      <div className="map-editor-content">
      <div className="map-editor-workspace">
    <WorkspaceShell pinnedPanels={[mode === "show" ? "show-outputs" : "layers"]}
      workspaceControls={<MapWorkspaceControls workspace={mode} onWorkspace={enterMode} visualEditor={visualEditor} onVisualEditor={changeVisualEditor}/>}
      controllerRef={workspaceShell} toolbarSpan="center" frameToolbar={false} centerBottom={undefined}
      contentPresentation="framed"
      sideBottom={{ right: <MapViewTools workspace={mode} onPerformance={() => setPerformanceOpen(true)} showInput={showInput} onInput={toggleInput}
        grid={mappingPreferences.grid} onGrid={()=>setMappingPreferences({grid:!mappingPreferences.grid})}
        xray={xray} onXray={()=>setXray(v=>!v)}
        snap={mappingPreferences.snapping} onSnap={()=>setMappingPreferences({snapping:!mappingPreferences.snapping})}
        backdrop={scene?.setupBackground ? scene.setupBackground.visible : null}
        onBackdrop={()=>edit(current=>({...current,scenes:current.scenes.map(item=>item.id===current.activeSceneId&&item.setupBackground?{...item,setupBackground:{...item.setupBackground,visible:!item.setupBackground.visible}}:item)}))}
        blackout={Boolean(show.output.blackout)} onBlackout={()=>edit(s=>({...s,output:{...s.output,blackout:!s.output.blackout}}))}/> }}
      // One shell per room: remounting on switch applies that room's defaults,
      // and the storage key keeps each room's own remembered layout.
      key={simple ? "simple-visuals" : mode}
      storageKey={simple ? "aether-map.simple-visuals.studio-v1" : `aether-map.${mode}.studio-v1`}
      // Measure the stage within the window, never from its own split contents.
      style={{ height: "100%" }}
      preset={layout}
      panelsOnOuterEdge={panelsOnOuterEdge}
      sidebarVariant={sidebarVariant}
      preservePanelContent
      bottom={dockWidget === "files" ? <ShowFileTabs file={file} saveState={saveState} connection={documentConnection} onSaveCopy={()=>rename(true)} status={error||status} fileActions={<span ref={setFileMenuTarget}/>}
        entries={documentEntries} activeEntry={mode==='show'?`show:${activeShow(show)?.id}`:mode==='mapping'?`canvas:${show.activeSceneId}`:`scene:${currentTimelineID(show)}`}
        onEntry={entry=>{const [kind,id]=[entry.kind,entry.id.slice(entry.id.indexOf(':')+1)];
          if(kind==='show'){if(id!==activeShow(show)?.id)edit(s=>({...s,activeShowID:id}));enterMode('show');}else if(kind==='canvas'){enterMode('mapping');selectScene(id);}
          else{enterMode('visualization');if(id!==currentTimelineID(show))openTimeline(id);}}}
        onCreate={kind=>{if(kind==='show'){edit(s=>{const n=normalizeShowTimeline(s),p=newShowProgram(n,`Show ${(n.shows?.length??0)+1}`);return {...n,shows:[...(n.shows??[]),p],activeShowID:p.id};});enterMode('show');return;}if(kind==='canvas')setSceneDraft({id:null,name:`Canvas ${show.scenes.length+1}`,size:artboardSize});
          else{edit(s=>createTimeline(s,`Scene ${(show.timelines?.length??0)+2}`));enterMode('visualization');}}} contents={{activeID:show.activeSceneId, documentGroups:[{id:"scenes",label:"Scenes",items:show.scenes.map(scene=>({id:scene.id,name:scene.name,kind:"scene",detail:"Scene",icon:<AetherIcon name="scene"/>}))}], onOpenItem:item=>selectScene(item.id)}}/>
        // The surfaces widget keeps Map's own rendered strip (selected surface
        // highlighted), not the generic parts footer.
        : dockWidget === "surfaces" ? surfaceStrip
        : dockWidget === "timeline" ? (mode === 'show' ? <ShowTimelinePanel show={show} timeS={timeS} selectedClipID={selectedShowClipID} onSelectClip={id=>{setSelectedShowClipID(id);if(id){setSelectedCueID(null);workspaceShell.current?.showPanel('properties');}}} onSeek={seek} onEdit={editShowTimeline}/> : workspaceTray) : undefined}
      statusBar={<ApplicationStatusBar appName="Aether Map" companyName="Jenkins Robotics" connection={hosted ? "connected" : "local"}/>}
      // The simple editor keeps the standard left sidebar too (Jonathan).
      defaultOpenLeft={[mode === 'show' ? 'show-outputs' : 'layers']}
      defaultOpenRight={["properties"]}
      leftPanels={standardWorkspacePanels([...(mode === 'show' ? [{id:'show-outputs',title:'Show',icon:<AetherIcon name="play"/>,collection:true,content:
        // The show's lists: Cues, then Players, then Canvases (collapsed). Clips
        // live on the show timeline; outputs and routing are Mapping's.
        <TreePanelSplit primaryLabel="Cues" secondaryLabel="Players and canvases" storageKey="aether-map.show-cues-split" primary={<CueList show={show} selectedID={selectedCueID} onSelect={id=>{setSelectedCueID(id);if(id)setSelectedShowClipID(null);workspaceShell.current?.showPanel('properties');}} onEdit={editShowTimeline}/>} secondary={
          <TreePanelSplit primaryLabel="Players" secondaryLabel="Canvases" storageKey="aether-map.show-players-split" collapsible={["primary", "secondary"]} defaultCollapsed={["secondary"]}
            primary={<PlayersTree show={show} onManage={()=>setManagingDevices(true)}/>} secondary={showScenes}/>}/>}] : []),
        { id: "assets", title: "Media library", icon: <AetherIcon name="import" />, content: assetsPanel },
        {
          id: "layers", collection: true,
          title: "Layers",
          icon: <AetherIcon name="layers" />,
          content: (<>
            {/* Visualization: standard tabs Surfaces | Visual layers (the
                concept); other rooms keep the List/Cards view switch. */}
            {mode === "visualization"
              // The reference head: title + add, then the standard full-width
              // tabs (the Comments | Tasks widget's control).
              ? <div className="map-visual-panel-head">
                  <div className="map-visual-panel-title"><strong>Layers</strong>
                    <IconButton label="Add layer" onClick={addVisual}><AetherIcon name="plus"/></IconButton></div>
                  <SegmentedControl className="ps-review-conversation-tabs" ariaLabel="Panel view" value={vizTab} onChange={value=>setVizPanelTab(value as typeof vizPanelTab)}
                    options={[{id:"list",label:"Surfaces",icon:<AetherIcon name="list-tree"/>},{id:"visuals",label:"Visuals",icon:<AetherIcon name="palette"/>}]}/>
                </div>
              : null}
            {/* Visual layers: the visual list tree, identical in simple and
                advanced (reorder, group, hide, lock, rename, duplicate). */}
            {/* Visualization: one asset set, two views — the List tree and the
                Visuals cards — filtered to a working surface. No layers or
                outputs tree here; that is Mapping's general list tree. */}
            {((panel: (view: "layers" | "scenes" | "scene-picker") => React.ReactNode) => mode === "visualization"
            // Visualization mirrors Mapping's three sections: Media (visuals
            // only — never a timeline container), Scenes, then Timelines.
            // Selecting a scene or a timeline switches the media list.
            ? <TreePanelSplit primaryLabel="Layers" secondaryLabel="Canvases and scenes" storageKey="aether-map.media-scenes-split" primary={
              <div className="map-visual-layers">
                <VisualAssetsPanel ariaLabel={vizTab === "visuals" ? "Visuals" : "Visual list"} view={vizTab === "visuals" ? "cards" : "tree"}
                  sceneID={show.activeSceneId} addLabel="Add layer" urls={urls} show={show} selectedID={selectedClipID} onSelect={selectAsset}
                  onChange={assets.change} onRemove={assets.remove} onDuplicate={assets.duplicate} onMove={assets.move} onDrop={assets.drop}
                  onAdd={addVisual} />
              </div>} secondary={
              <TreePanelSplit primaryLabel="Canvases" secondaryLabel="Scenes" storageKey="aether-map.scenes-timelines-split" collapsible={["primary", "secondary"]} defaultCollapsed={["primary", "secondary"]} primary={panel("scene-picker")}
                secondary={<TimelineTree show={show} actions={timelineActions}/>}/>}/>
            :
            <TreePanelSplit primaryLabel="Layers" secondaryLabel="Canvases and outputs" storageKey="aether-map.layers-scenes-split" primary={panel("layers")} secondary={
              <TreePanelSplit primaryLabel="Canvases" secondaryLabel="Outputs" storageKey="aether-map.scenes-outputs-split" collapsible={["primary", "secondary"]} defaultCollapsed={["primary"]} primary={panel("scenes")} secondary={
            // The asset list tree lives only in Visualization's Visual layers
            // tab; this split is the general list tree: layers over outputs.
            <OutputsPanel show={show} selectedID={selectedOutputID} displays={displays}
              documentID={file?.id ?? null}
              onSelect={selectOutput} onAdd={addOutput} onPatch={patchOutput}
              onDelete={deleteOutput} onOpen={openOutputWindow} onClose={closeOutput}
              onDevices={() => setManagingDevices(true)} showName={file?.name?.replace(/\.aethermap$/i, "") || "Show"} />
            } />} />)(layersPanel)}
          </>),
        },
        ...(scene ? [{ id: "agent", title: "Aether Agent", icon: <AetherIcon name="aether" />,
          content: <MapAssistant key={`${agentEditorID}:${scene.id}`} show={show} scene={scene}
            interaction={agentInteraction}
            session={assistantSessions.read(`${agentEditorID}:${scene.id}`)}
            onSession={patch => assistantSessions.patch(`${agentEditorID}:${scene.id}`, patch)}
            surfaceIDs={resolveTreeID(show, selectedID ?? '')?.kind === 'folder'
              ? scene.surfaces.filter(s => folderID(scene.id, s.folder ?? '') === selectedID).map(s => s.id)
              : [...selectedLayerIDs, ...(selectedID ? [selectedID] : [])]} mediaUrls={urls} /> }] : []),
      // Standard aux rail (CAD's composition): tasks are merged into the
      // comments review panel, and Create version / notes / reminders open from
      // their own commands and the version panel's header, not rail buttons.
      // The simple visuals editor rides the same standard frame: full aux
      // panel set and footer toggles, with only the timeline kept to the
      // advanced visualization and show rooms.
      ], { features: "layers", advisor: "agent",  }, documentConnection).filter(panel=>panel.id!=="part-manager" && panel.id!=="tasks")
        .map(panel=>["create-version","notes","reminders"].includes(panel.id)?{...panel,inToolbar:false}:panel)
        // The footer widgets toggle from the aux toolbar like CAD's part list.
        .concat([
          {id:"dock-files",title:"Open files",icon:<AetherIcon name="folder"/>,content:null,toggle:{pressed:dockWidget==="files",onToggle:()=>pickBottomWidget("files")}},
          {id:"dock-surfaces",title:"Mapped surfaces",icon:<AetherIcon name="surface-map"/>,content:null,toggle:{pressed:dockWidget==="surfaces",onToggle:()=>pickBottomWidget("surfaces")}},
          ...(mode==="mapping"||simple?[]:[{id:"dock-timeline",title:"Timeline",icon:<AetherIcon name="timeline"/>,content:null,toggle:{pressed:dockWidget==="timeline",onToggle:()=>pickBottomWidget("timeline")}}]),
        ])}
      rightPanels={[
        {
          id: "properties",
          title: "Properties",
          icon: <ToolIcon name="properties" />,
          content: mode === 'show' && (selectedCue || selectedShowClip || selectedShowAudio) ? (selectedCue ? <CueProperties cue={selectedCue} onEdit={editShowTimeline}/> : selectedShowAudio ? <ShowAudioProperties show={show} clip={selectedShowAudio} onEdit={editShowTimeline}/> : <SceneClipProperties show={show} clip={selectedShowClip!} onEdit={editShowTimeline}/>) : (<section aria-label="Selection properties">
            {(
            // Scenes and outputs come first: they are whole-tree selections, and
            // the layer branches below are only meaningful when Layers is what
            // you last touched.
            focus === "output" ? outputProperties
            : focus === "scene" && scene ? <><SceneProperties key={scene.id} show={show} scene={scene}
                onPatch={patchScene} onDelete={deleteScene} />
                <SetupBackgroundPanel show={show} onChange={changeBackground} /></>
            : backgroundSelected ? <section aria-label="Backdrop layer properties">
                <SetupBackgroundPanel show={show} onChange={changeBackground} />
              </section>
            : selectedPool ? <PoolProperties asset={selectedPool} show={show} onChange={changePool} onPaint={() => { setTool('paint'); setShowInput(true); }} />
            // One Properties for both editors; only timeline timing differs.
            : selectedVisual ? <VisualInspector key={selectedVisual.id} visual={selectedVisual} show={show} timelines={!simple}
              placementFrame={selectedVisual.mapping !== 'span' ? previewSurface?.source.rect : undefined}
                onChange={(visual,key) => assets.change(visual.id, visual,key)} onPickMedia={() => pickMedia('assign', selectedVisual.id)}
                onDuplicate={() => assets.duplicate(visualSurface(show, selectedVisual), selectedVisual)}
                onRemove={() => assets.remove(selectedVisual.id, selectedVisual.id)} onReplace={() => setGallery(selectedVisual.id)}
                onMove={direction => edit(current => moveSimpleVisual(current, selectedVisual.id, direction))}
                onAdvanced={simple ? () => changeVisualEditor('advanced') : undefined} />
             : mode === "mapping" && selectedID && resolveTreeID(show, selectedID)?.kind === "folder" ? (() => {
                const target=resolveTreeID(show,selectedID);if(target?.kind!=="folder")return null;
                const members=(target.scene?.surfaces??show.unassignedSurfaces).filter(s=>s.folder===target.folder);
                if(!members.some(s=>s.groupShape==='cube'))return null;
                return <CubePosePanel key={selectedID} show={show} memberID={members[0].id} readOnly={file?.writable===false}
                  onChange={changes=>edit(current=>{try{return applyCubeGeometry(current,members[0].id,changes);}catch(error){queueMicrotask(()=>setError((error as Error).message));return current;}})}
                  onGestureStart={()=>{gestureDirtyBefore.current=dirty;setGestureSnapshot(show);document_.beginGesture();}}
                  onGestureEnd={cancel=>{document_.endGesture(cancel);setGestureSnapshot(null);if(cancel)setDirty(gestureDirtyBefore.current);}}/>;
              })()
            : <PropertiesPanel
              workspace={outputWorkspace}
              onEditOutline={mode === "mapping" ? () => setTool("node") : undefined}
              surface={selected}
              show={show}
              onPatch={patchSurface}
              onDelete={deleteSurface}
              onReorder={reorderSurface}
              onOutputSize={matchOutputSize}
              deviceSize={deviceSize}
              onMasks={setMasks}
            />
          )}
            {mode === 'visualization' && focus === 'layer' && selected && !selectedVisual && <SurfaceAnimationProperties surface={selected} timeS={timeS} onSeek={seek} onPatch={patchSurface} onAddCue={addCue} onRemoveCue={removeCue} />}
            {mode === "mapping" && focus === "layer" && !selectedVisual && <InspectorSection title="Combine surfaces" defaultOpen={false}><RegionControls show={show} selectedID={selectedID} selectedIDs={selectedLayerIDs} onEdit={edit} onSelect={selectSurface} /></InspectorSection>}
            {mode === "mapping" && focus === "layer" && !selectedVisual && <MappingControls show={show} selectedID={selectedID}
              onPatch={patchSurface}
              onDetach={ref => edit(current => detachCorner(current, ref))}
              handle={tool === "node" ? activeMappingHandle : null}
              preferences={mappingPreferences} onPreferences={setMappingPreferences}
              onGeometry={changes => edit(current => {
                const ids = new Set(changes.map(c => c.id));
                if (allSurfaces(current).some(s => ids.has(s.id) && s.locked)) return current;
                return changes.reduce((result, change) => withSurfaceCollection(result, change.id,
                  list => list.map(s => s.id === change.id ? { ...s, ...change.geometry } : s)), current);
              })}
              onRound={(id, shape, points) => {
                document_.beginGesture(); setMaskShape(id, shape, points); document_.endGesture();
              }} />}
          </section>),
        },
        // Effects apply to the selected visual: the right sidebar's Effects tab
        // is VisualProperties' own standard effects editor, scoped.
        ...(mode === "visualization" ? [{
          id: "effects", title: "Effects", icon: <AetherIcon name="sparkles" />,
          content: selectedVisual && !selectedVisual.timelineRefID
            ? <div className="ps-properties"><VisualProperties only="effects" timing={!simple} visual={selectedVisual} show={show} onChange={(visual, key) => assets.change(visual.id, visual, key)}
                onPickMedia={() => {}} onDuplicate={() => {}} onMove={() => {}} /></div>
            : <EmptyState compact title="Effects" icon={<AetherIcon name="sparkles" />} description="Select a visual to add and adjust its effects." />,
        }] : []),
        ...(mode !== "mapping" ? [{ id: "program", title: "Program", icon: <AetherIcon name="play" />,
          content: <><ProgramPanel show={show}
            onMix={(mix) => edit((current) => ({ ...current, mix }), "scene-mix")}
            onShowChange={(next) => edit((current) => ({ ...current, output: next }), "output-region")} />
            {mode === 'show' && <ShowPlaybackFields show={show} onEdit={editShowTimeline} onPlayback={mode=>edit(current=>({...current,playback:{mode}}))}
              onShowName={name=>edit(s=>withActiveShow(s,p=>({...p,name})))} onPlayerShow={id=>edit(s=>({...s,playerShowID:id}))}
              onDeleteShow={()=>edit(s=>{const id=activeShow(s)?.id;const shows=(s.shows??[]).filter(p=>p.id!==id);return shows.length?{...s,shows,activeShowID:shows[0].id,playerShowID:s.playerShowID===id?undefined:s.playerShowID}:s;})}/>}</> }] : []),
        // Export acts on the selected output and the show: a properties-side tab.
        ...(mode === 'show' ? [{ id: "export", title: "Export", icon: <AetherIcon name="export" />,
          content: <ShowExportPanel show={show} name={file?.name.replace(/\.aethermap$/i,'')??'Untitled show'} urls={urls} documentID={file?.id??null} dirty={dirty}
            onOpenOutput={openOutputWindow} onExportProject={exportProject} onExportWireframe={exportWireframe}/> }] : []),
        // The dedicated tools stay on the rail beside Properties. Properties
        // answers for whatever is selected; these are the same editors reachable
        // without selecting anything first, which is how you reach an output's
        // settings or a scene's backdrop directly.
        // A selected visual has its own transform and appearance: these tabs
        // edit it rather than showing "select a layer".
        { id: "transform", title: "Transform", icon: <ToolIcon name="scale" />,
          content: visualTabs ? <VisualProperties only="transform" timing={!simple} visual={visualTabs} show={show}
              placementFrame={visualTabs.mapping !== 'span' ? previewSurface?.source.rect : undefined}
              onChange={(visual, key) => assets.change(visual.id, visual, key)} onPickMedia={() => {}} onDuplicate={() => {}} onMove={() => {}} />
            : <TransformPanel surface={transformLayer} output={artboardSize} timeS={mode === "mapping" ? 0 : timeS} onPatch={patchLayer} /> },
        ...(mode === "visualization" ? [{ id: "color", title: "Appearance", icon: <AetherIcon name="palette" />,
          content: visualTabs ? <VisualProperties only="appearance" simple timing={!simple} visual={visualTabs} show={show}
              onChange={(visual, key) => assets.change(visual.id, visual, key)} onPickMedia={() => {}} onDuplicate={() => {}} onMove={() => {}} />
            : <ColorPanel key={selectedID} surface={transformLayer} backdrop={backgroundSelected} onPatch={patchLayer} /> }] : []),
        { id: "crop", title: "Output", icon: <AetherIcon name="window" />,
          content: outputProperties },
        { id: "setup", title: "Scene setup", icon: <AetherIcon name="file-show" />,
          content: <SetupBackgroundPanel show={show} onChange={changeBackground} /> },

      ].filter(panel=>(mode !== 'show' || ['properties','program','export'].includes(panel.id))).map(panel => ({ ...panel, content: <Inspector className="map-inspector">{panel.content}</Inspector> }))}
      // Visualization's toolbar is the surface bar: pick a visual, then click
      // surfaces to turn it on or off (the mockup's "Apply to surfaces").
      // The simple editor keeps the standard toolbar and surface tray too.
      // Visualization: the standard command field stays; its icon row is the
      // surface strip — pick a visual, click surfaces to apply it.
      toolbar={
        <MapRibbon onGo={runNextGo} toolRow={mode === 'visualization' ? <section className="map-apply-surfaces" aria-label="Apply to surfaces">
          <div className="map-apply-surfaces-title"><strong>Apply to surfaces</strong><span>Click a surface to turn this visual on or off.</span></div>
          {surfaceStrip}
        </section> : undefined} docked={layout === 'docked'} workspace={mode} onWorkspace={enterMode}
        onSave={save} onOutput={()=>setChoosingOutput(true)} playing={transport.playing} onPlay={togglePlay}
        canUndo={document_.canUndo} canRedo={document_.canRedo} onUndo={undo} onRedo={redo}
        tool={tool} onTool={next=>{setTool(next);stageRef.current?.querySelector<HTMLElement>('.map-canvas-host')?.focus({preventScroll:true});}}
        cutout={cutout} onCutout={()=>setCutout(v=>!v)} onAdd={addFeature} onAddCompound={addCompound}
        onSetupImage={()=>backgroundRef.current?.click()} onTransparentPng={()=>pickMedia('new-layer',undefined,true)}
        onEdit={()=>selectedID&&(selectedClipID?editAsset(selectedID,selectedClipID):editSurface(selectedID))}
        hasSelection={focus==='output'?Boolean(selectedOutputID&&selectedOutput):Boolean(selectedVisual||selectedID&&resolveTreeID(show,selectedID))}
        canEdit={focus!=='output'&&(Boolean(selectedVisual)||Boolean(selected)||backgroundSelected)}
        canDelete={focus==='output'?Boolean(selectedOutputID&&selectedOutput):Boolean(selectedVisual?!selectedVisual.locked:selectedID&&(selectedLayerIDs.includes(selectedID)?selectedLayerIDs:[selectedID]).every(id=>canDeleteLayer(show,id)))}
        onDelete={()=>{if(focus==='output'){if(selectedOutputID)deleteOutput(selectedOutputID);}else if(selectedVisual)assets.remove(selectedVisual.id,selectedVisual.id);else if(selectedID)deleteLayer(selectedID);}}
        onImport={()=>svgRef.current?.click()} onExport={exportProject} canExport={Boolean(file)}
        onMedia={()=>pickMedia('layer')} showInput={showInput} onInput={toggleInput}
        onNewOutput={addOutput} onDevices={()=>setManagingDevices(true)} onWireframe={exportWireframe}
        blackout={Boolean(show.output.blackout)} onBlackout={()=>edit(s=>({...s,output:{...s.output,blackout:!s.output.blackout}}))}
      />}

    >
      <div ref={stageRef} className={`map-stage${mode === 'visualization' ? ' map-production-workspace' : ''}`}>
        {/* Visualization's center, both editors: the selected scene's render
            fills the space, input side by side; advanced adds the timeline. */}
        {mode === 'visualization' ? <SimpleVisualWorkspace showInput={showInput} show={show} urls={urls} selectedID={selectedClipID} timeS={timeS} playing={transport.playing}
          onPlay={togglePlay} onSeek={seek} onBrowse={addVisual} onPlayback={mode => edit(current => ({ ...current, playback: { mode } }))} onChange={(visual, key) => assets.change(visual.id, visual, key)} />
        : mode === 'show' ? <ShowWorkspace show={show} urls={urls} timeS={timeS} playing={transport.playing} onPlay={togglePlay} onSeek={t=>{if(t===0){cueRuns.current.clear();goIndex.current=0;}seek(t);}} onGo={runNextGo} selectedCanvasID={show.activeSceneId} onSelectCanvas={selectScene}/>
        : <>
          <div style={{ width: "100%", height: "100%" }}>
            <div className="map-preview-panes is-output-only">
              <section className="map-output-preview" aria-label="Mapping canvas">
            <MapCameraControls/>
            <SurfaceCanvas
              xray={xray}
              mappingPreferences={mappingPreferences}
              onActiveHandle={setActiveMappingHandle}
              onWeldCorners={(a, b) => edit(current => joinCorners(current, a, b))}
              onCurveControl={(id, shape, edge, control, point, independent) => edit(current => withSurfaceCollection(current, id, list => list.map(s => {
                const curve = s.maskCurves?.[shape]?.[edge];
                return s.id === id && !s.locked && curve ? { ...s, ...moveMaskControl(s, shape, edge, control, point, independent) } : s;
              })), `curve:${id}:${shape}:${edge}`)}
              previewMode={outputWorkspace}
              show={previewShow}
              resolved={previewResolved}
              mediaUrls={urls}
              selectedID={selectedID}
              onSelect={selectSurface}
              onSelectScene={selectScene}
              onMoveToScene={(id, sceneID, offset) => {
                const destinationID = canvasDestinationRowID(show, id, sceneID);
                edit((current) => {
                  const moved = sceneID
                    ? moveCanvasItemToScene(current, id, sceneID, offset)
                    : unassignCanvasItem(current, id, offset);
                  return moved === current || !sceneID ? moved : { ...moved, activeSceneId: sceneID };
                });
                setSelectedID(destinationID);
                setSelectedClipID(null);
                setFocus("layer");
                seek(0);
              }}
              onDelete={deleteLayer}
              onEdit={editSurface}
              onGeometry={(id, geometry) => patchLayer(id, geometry, `move:${id}`)}
              onGroupGeometry={(id, changes) => edit(current => {
                const target = resolveTreeID(current, id);
                if (target?.kind !== "folder") return current;
                const member = (target.scene?.surfaces ?? current.unassignedSurfaces)
                  .find(surface => surface.folder === target.folder);
                return member
                  ? withSurfaceCollection(current, member.id, list => applyGroupGeometry(list, target.folder, changes))
                  : current;
              }, `move:${id}`)}
              onGestureStart={() => {
                gestureDirtyBefore.current = dirty;
                setGestureSnapshot(show);
                document_.beginGesture();
              }}
              onGestureEnd={(cancel) => {
                document_.endGesture(cancel);
                setGestureSnapshot(null);
                if (cancel) setDirty(gestureDirtyBefore.current);
              }}
              onCorners={(id, corners: Quad) =>
                patchLayer(id, { corners }, `corners:${id}`)
              }
              onMaskPatch={patchSurface}
              onMaskShape={setMaskShape}
              onDrawShape={drawShape}
              tool={tool}
              timeS={timeS}
              playing={transport.playing}
              onCrop={(crop) => selectedOutput && patchOutput(selectedOutput.id, { crop })}
              outputID={selectedOutput?.id ?? null}
              displays={displays}
              documentID={file?.id ?? null}
              paint={{ color: paintColor, widthPx: paintWidth, onColor: setPaintColor, onWidth: setPaintWidth }}
            />
              </section>
            </div>
          </div>
        </>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,audio/*"
        hidden
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) void addMedia(picked);
          event.target.value = "";
        }}
      />
      <input ref={backgroundRef} type="file" accept="image/*" aria-label="Import backdrop image" hidden
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked && scene) {
            selectSurface(backgroundLayerID(scene.id));
            void addMedia(picked, scene.id);
          }
          event.target.value = "";
        }} />
      <input
        ref={svgRef}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) void importSvg(picked);
          event.target.value = "";
        }}
      />
      {creatingMask && <CreateMaskDialog mode={creatingMask} size={artboardSize} onClose={() => setCreatingMask(null)} onCreate={surface => {
        edit(current => withSurfaces(current, list => [...list, surface])); selectSurface(surface.id); setCreatingMask(null);
      }} />}
      <AddShapeSheet open={addingShape} onClose={() => setAddingShape(false)} onChoose={addShape} />
      {sceneDraft && (sceneDraft.id === null || show.scenes.some((scene) => scene.id === sceneDraft.id)) && (
        <ScenePropertiesDialog name={sceneDraft.name} size={sceneDraft.size} creating={sceneDraft.id === null}
          onClose={() => setSceneDraft(null)}
          onApply={(properties) => {
            if (sceneDraft.id === null) addScene(properties); else patchScene(sceneDraft.id, properties);
            setSceneDraft(null);
          }} />
      )}
      {gallery && <VisualGallery actionLabel={gallery === 'add' ? 'Add visual to scene' : 'Replace selected visual'} onClose={() => setGallery(null)}
        pool={{ assets: show.pool ?? [], thumbnail: id => { const asset = show.pool?.find(a => a.id === id); return asset ? <VisualThumbnail source={asset.source} show={show} urls={urls} /> : null; },
          onChoose: id => { const asset = show.pool?.find(a => a.id === id); if (asset) chooseVisual(asset.source, asset.name, asset.id); },
          onRemove: id => edit(s => removePoolAsset(s, id)) }}
        timelines={gallery === 'add' ? { items: (show.timelines ?? []).filter(t => t.sceneID === show.activeSceneId && canNestTimeline(show, t.id)), onChoose: timelineActions.onAppend } : undefined}
        onlineLibrary={<AssetBrowser targetLayer={null} destination="pool" onChooseFile={() => pickMedia("library")} onImport={importAsset} />}
        onChoose={visual => chooseVisual({ mediaId: null, rect: [0, 0, sceneSize(show).width, sceneSize(show).height], shader: visual.shader }, visual.name)}
        onCreate={kind => chooseVisual(poolSource(kind, sceneSize(show)), POOL_SOURCES.find(s => s.id === kind)!.label)}
        onChooseLoop={async picked => { mediaIntent.current = galleryIntent(); return !!await addMedia(picked, undefined, loopCredit); }}
        onImport={() => { mediaIntent.current = galleryIntent(); fileRef.current?.click(); }} />}
      {pickingPreset && <VisualGallery onClose={() => setPickingPreset(false)} actionLabel="Add as a new scene" onChoose={visual => {
        const scene = newScene(visual.name, { widthPx: show.output.width, heightPx: show.output.height });
        const surface = newSurface(show.output, 0);
        surface.name = visual.name; surface.kind = 'shader';
        surface.source = { mediaId: null, rect: [0, 0, show.output.width, show.output.height], shader: visual.shader };
        surface.corners = [[0, 0], [show.output.width, 0], [show.output.width, show.output.height], [0, show.output.height]];
        scene.surfaces = [surface];
        edit(current => ({ ...current, scenes: [...current.scenes, scene], activeSceneId: scene.id }));
      }} />}
      <Dialog open={exportOptions} title="Export options" onClose={() => setExportOptions(false)}>
        <ExportWorkspace show={show} mediaUrls={urls} documentID={file?.id ?? null} dirty={dirty} onExportProject={exportProject} onExportWireframe={exportWireframe} />
      </Dialog>
      <Dialog open={managingDevices} title="Devices" onClose={() => setManagingDevices(false)}
        actions={<Button onClick={() => setManagingDevices(false)}>Done</Button>}>
        {/* With the show, so players can be deployed and mirrored from here. */}
        <DeviceManager show={show} documentID={file?.id ?? null} installerURL={installerURL()} dirty={dirty} />
      </Dialog>
      <OutputDialog
        open={choosingOutput}
        onClose={() => setChoosingOutput(false)}
        documentID={file?.id ?? null}
        output={show.output}
        reportedDisplay={deviceSize}
        onUseMonitor={(display) => selectedOutput && openOutput(selectedOutput.id, display)}
        onOpenWireless={(kind) => selectedOutput && openWirelessOutput(selectedOutput.id, kind)}
        dirty={dirty}
        onMatchDisplay={(width, height) =>
          edit((current) => ({ ...current, output: { ...current.output, width, height } }))
        }
        onDeploy={async (deviceID) => {
          if (!file || dirty) throw new Error("Save the latest changes before deploying this show.");
          await devices.assign(deviceID, file.id);
          setStatus("Deployed. The device pulls it within a few seconds.");
        }}
      />

      <Dialog
        open={naming}
        title="Save show"
        onClose={() => setNaming(false)}
        actions={
          <>
            <Button onClick={() => setNaming(false)}>Cancel</Button>
            <Button
              primary
              onClick={() => {
                setNaming(false);
                const trimmed = nameDraft.trim() || "Untitled show";
                void store(trimmed.endsWith(EXTENSION) ? trimmed : trimmed + EXTENSION);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <FieldRow label="Name">
          <TextField
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
          />
        </FieldRow>
      </Dialog>
    </WorkspaceShell>
      </div>
      </div>
    </div>
    {performanceOpen && <PerformanceView show={show} urls={urls} selectedID={selectedClipID} timeS={timeS} playing={transport.playing}
      onSelect={id => selectAsset(id, id)} onScene={selectScene} onChange={(visual, key) => assets.change(visual.id, visual, key)}
      onPlay={togglePlay} onSeek={seek} onClose={() => setPerformanceOpen(false)} onPickMedia={id => pickMedia('assign', id)}
      onUndo={undo} onRedo={redo} canUndo={document_.canUndo} canRedo={document_.canRedo} readOnly={file?.writable === false}
      onGestureStart={() => { gestureDirtyBefore.current = dirty; document_.beginGesture(); }}
      onGestureEnd={cancel => { document_.endGesture(cancel); if (cancel) setDirty(gestureDirtyBefore.current); }} />}
    </ModulationContext.Provider></TimelineAudioProvider>
  );
}
