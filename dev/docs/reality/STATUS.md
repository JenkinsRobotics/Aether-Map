# Aether Map status

## Map release alpha-0.1.4 — 2026-10-25: contextual panel actions

Installed from source `902b2e9` through the independent app updater, without a
restart. All 3,520 frontend files match the qualified build. The alpha-0.1.3
worker and six Pi downloads are retained; host and all other apps are unchanged.

Built on the committed alpha-0.1.3 Files/media/tray checkpoint. Shared Aether UI
alpha.211 applies the CAD context-menu standard to Map: menus contain actions
for the clicked item or panel; there is no generic Undo/Redo/Settings popup or
footer. Native text editing keeps the browser menu.

Layers and Outputs backgrounds expose their available creation, folder, device,
recording and tree-filter controls. Visuals backgrounds retain Add layer and
View in both cards and list layouts, without duplicate entries. Right-clicking
a card selects that target while preserving an existing selected group. The
Files browser fills its panel, so its blank area offers New design and view
controls. Its product-supplied capabilities determine available folder actions.
Submenus keep focus and remain open through live panel refreshes. Existing
history shortcuts, canvas zoom, timeline clipboard and item commands remain.

Verification: 1,190 tests / 166 files pass; typecheck and production frontend /
automation builds pass. Five Chrome workflows cover the committed Files/media
layout, panel creation/device actions, row menus, Visuals view switching, Files
blank-area controls, scoped canvas zoom, native fields and timeline copy/paste.
The regenerated worker is byte-identical to the alpha-0.1.3 checkpoint. UI211
has 921 passing shared tests. Earlier stale browser selectors were replaced with
the actual Content workflow and portalled timeline toolbar. The repository's
previous broad e2e failures remain documented under alpha-0.1.3 below.

## Map release alpha-0.1.4 — 2026-10-25: Media pool | Browse tabs

- The Media panel has the Comments widget's header: full-width Media pool | Browse
  tabs (the same shared control). Browse is the import library (Pixabay, your own
  files); the Media pool page is the shared Files browser (CAD) list or gallery,
  with search, + and the view switch in one row.
- Limit: in the light theme the picked tab is dark on dark, as the Comments widget's
  is; the shared control is styled for dark only (Aether-UI).

## Map release alpha-0.1.3 — 2026-10-25: Media pool and the suite's left aux bar

Installed 2026-10-25 through Studio's per-app update (source `397ada9`, no restart;
CAD alpha-0.1.15 and UI unchanged). Map now uses Aether-UI 0.2.0-alpha.208.
A full e2e run (285 failed, 49 passed) matched a baseline build of alpha-0.1.2 on
the sampled specs (`layer-controls`, `scenes`: 11/11 fail on both); those specs
wait for UI the shared Studio interface removed and need rewriting.

- **Media pool** (replaces the Media library side panel and the Layers sidebar's
  Media pool tab): everything already in the project — imported files, generated
  sources, compound clips — in bins (Master plus named bins, kept while empty), as
  a list or thumbnails, with search and sort. Right-click: New clip, New bin,
  Import media… (into the open bin), Open gallery…, View, Sort; on an item Open in
  Content, Add to clip / Add to scene, Rename, Duplicate, Move to bin, Delete (only
  when unused). Ctrl/Cmd- and Shift-click pick several; rows drag onto timeline
  tracks and onto bins. The gallery (Pixabay, visual gallery) stays the import source.
- **Left aux toolbar follows CAD:** Comments, AI, Version control, Files (CAD's left
  Files browser, Aether-UI 0.2.0-alpha.208 `DocumentTabBrowser`), then the Media
  pool. The dock toggles (Open files, Mapped surfaces, Timeline) moved to the
  right-hand view tools, where CAD keeps its tray toggle; in Show, Layers moved to
  the right sidebar tabs.
- Aether-UI 0.2.0-alpha.208 now stops the aux panel level with the dock, so Map's
  workaround for that is gone; Map still clears the extension after the dock closes.
- Dropped with the old panel: MediaPanel's "Apply to / Action" placement row (drag
  a pool row, or Add to clip/scene instead) and the unused old `MediaPool` component.
- Limits: bins are one level deep; no smart bins, proxy media or relinking. The
  right sidebar tab row already overflowed in Scene (Output, Scene setup) before
  this release. e2e `online-assets.spec.ts` drove the old, never-mounted Media Pool
  component and needs rewriting for the gallery.

## Map release alpha-0.1.2 — 2026-10-25: clip editing fixes

Installed 2026-10-25 through Studio's per-app update (source `5e6c44d`, no restart).
- Content's timeline shows the open clip's tracks (it showed none) and names the clip.
- Visuals uses the card list in Content and Scene; every right-click menu of the
  panel (card, row, empty space) ends with Add layer and View › Cards / List.
- Ctrl/Cmd-click and Shift-click pick several layers; their menu hides, groups or
  deletes them all (one undo step), and Delete removes them.
- Scene: a clip on a surface moves and resizes with the preview handles, like any
  visual. With Input on, a picked clip shows its own board there, with handles for
  the layer chosen in "Clip layer". Its layer list is editable in Scene (duplicate,
  reorder, hide, delete).
- Clip layers reorder (Move forward/backward found no neighbour in a clip).
- The Comments/Tasks panel ends with the dock row, and no longer runs off the window
  after the dock closes. Map works around Aether-UI 0.2.0-alpha.207 keeping the last
  dock height; the fix belongs in Aether-UI.
- Limits: the clip handles resize along the frame axes only; a clip's Input board
  plays at the clip's own clock. e2e `bottom-dock.spec.ts` (3) and `video.spec.ts`
  fail on UI removed with the shared Studio interface; they predate this release.

## 0.1.0-alpha.3 — 2026-10-24: Content and Scene workspaces

Installed 2026-10-24 as Map release `alpha-0.1.1` through Studio's per-app update
(source `45a0ce3`, worker and Pi downloads included, no restart; other apps unchanged).
Workspaces are now Mapping | Content | Scene | Show. Design:
`docs/superpowers/specs/2026-10-24-content-and-scene-workspaces-design.md`.
- **Content** builds compound clips with no surfaces. Each clip sits on its own
  board (a preset size, or a surface's proportions), with layers, placement
  handles and its own timeline.
  - Media pool | Visuals tabs: the project's clips (folders; each row says where
    it plays) and what the open clip holds.
  - Properties: name, board, length, and "Used on N surfaces".
- **Scene** assigns clips.
  - Pick a clip in the Media pool and the surface row puts it on surfaces,
    looping for the scene.
  - The advanced timeline gets a track per surface to drop clips on. A pool
    item dropped there becomes a one-visual clip.
  - A selected surface shows what plays now and next, Fill or Stretch, and a
    fade-in.
- **Model:** a clip is a timeline with a `board`.
  - It belongs to the project: deleting a canvas keeps it.
  - It fills a surface without stretching (cover, clipped to the surface's
    outline).
  - Clips nest inside clips, and a clip can't contain itself.
  - Document version 13.
- **Older projects:** a timeline whose visuals all fill the canvas becomes a
  clip and draws exactly as before, including when a show plays it on another
  canvas. Each old timeline is decided once.
- **Not yet / limits:**
  - Timelines aimed at particular surfaces stay scenes, and their direct
    visuals stay editable in Scene's Visuals tab.
  - Scene's Add tools still add ordinary scene visuals.
  - Only the outermost host applies to nested surface hosting.
  - A picture's own mask isn't intersected with the surface outline.
  - Selected-tab text in the shared segmented control is hard to read in the
    light theme (Aether-UI style).
  - No node effects page yet.

## Installed release — 2026-10-23 (r23)

`map-visualizer-20261023-r23`. Since r20:
- **r21:** Scene's Add tools are standard tool bar commands; the surface row is
  an independent, toggled panel.
- **r22:** a Render view picker (whole scene, or one surface straight-on) and
  on-canvas placement handles (move, resize from centre).
- **r23:** nested scenes applied to surfaces project their whole picture onto
  each surface, like a generator. Only the outermost hosting nest applies.

## Installed release — 2026-10-23 (r20)

`map-visualizer-20261023-r20` builds on r19's Scene fixes (backdrop toggle,
tool row, fill-by-default visuals, multi-import, "Add to project", editable
lengths).
- **Sidebars:** Mapping's artboard tree (canvases hold their layers); quiet
  tree headers ("+", the rest on right-click); no canvases in the file row.
- **Drawing:** pen snapping and close preview; outline-following placeholder
  edges.
- **Show:** the backdrop toggle.
- **Not yet:** dragging content inside a surface on the canvas (placement is in
  Properties → Transform).

## Installed release — 2026-10-23 (r18)

`map-visualizer-20261023-r18`: a deployed player now runs the show's timeline
cues itself (`advanceShow` in `src/show-timeline.ts`). That covers loops (a jump
with a repeat count), pause, stop and blackout, so a Pi plays the whole show
logic with no editor attached. GO cues are operator-only. Cue conditions need
MIDI, which a player lacks, so a conditional cue stays off on a Pi.

## Installed host release — 2026-10-23 (aether-network-r1)

Generation `aether-network-20261023-r1` carries the current Map frontend,
player downloads rebuilt from it, and the native worker. It also brings the
Studio host's local-network setup: a portal-made certificate, a CA download and
a Bonjour `.local` name. Pi installers embed and trust the CA once Studio serves
HTTPS. Access schema is now 26. Details are in AetherStudio `LOCAL_DEVELOPMENT.md`.
- **Browser tests:** `show-workspace` passes end to end, including live
  mirroring, so the r17 note below is out of date. Map's full Playwright run now
  starts (sketch alpha.5): 44 passed, 287 failed, 1 skipped. Failing specs
  target pre-redesign UI or other products (about 31 specs: CAD/IO/Sketch).
  Updating them is a separate task.

## Installed release — 2026-10-23 (r17)

Generation `map-visualizer-20261023-r17` is r16 re-gated, with `@aether/ui`
alpha.207 (submenus clamped to the window). The full suite passed. r16 had
shipped with an incomplete gate. Contents, building on r15's Show
architecture:
- **Several shows per document** (setlists).
  - Each show has its own entry in the file row, and "+" can create one.
  - The Program tab sets the show name and which show players play, and can
    delete a show.
  - The r15 single show migrates to "Show 1".
- **Show audio:** a soundtrack row under the canvas tracks. It plays through
  the existing timeline audio engine on the show clock, in the editor and on
  players.
- **Cue logic:** jump cues can repeat N times per run (loops), and any cue can
  be gated on a MIDI control value (conditions; sensors via a MIDI bridge).
  Agents get `times` and `condition_*` on `map.show.cue.add`.
- **Sequences:** a clip can play another show on the same canvas. Nesting is
  depth-limited, so a show nested in itself goes dark.
- **Map's own browser tests:** `workspace-navigation` was rewritten for the
  three workspaces and passes. `show-workspace` now gets past deploy and the
  headless player rendering the show timeline; it still fails at live
  mirroring (WebRTC never connects in this environment).

**Known gaps:**
- Map's full Playwright suite is mostly stale (see the host release above).
- Multi-canvas output routing.
- OSC and native sensor inputs (these need the host).
- Cameras.

## Installed release — 2026-10-22 (r15)

Generation `map-visualizer-20261022-r15`: the Show / Scene / Mapping
architecture, steps 1–7 of
`../AetherStudio/dev/docs/roadmap/Aether_Map_Document_Tabs.md`.
- **Vocabulary:** workspaces Mapping, Scene and Show. Canvases are artboards
  with surfaces; Scenes are saved timelines; Layers are visuals; surface keys
  replace "cues" on surfaces.
- **One file row:** the open document's typed entries (Show, Canvas, Scene),
  with "+" offering Scene, Canvas or Map document.
- **Show workspace:** live canvas wall, transport with GO, a show timeline of
  scene clips on per-canvas tracks, Cues and Players lists, and Properties,
  Program and Export tabs.
- **Cues:** timeline, GO and MIDI CC triggers.
- **Scene reuse:** by surface role, with per-clip overrides.
- **Players:** deployed outputs follow the show timeline.
- **Agent tools:** `map.show.clip.add`, `map.show.cue.add`, and a `show`
  inspect section.

**Known gaps:**
- One show per document.
- Single-canvas output routing.
- No show-level audio.
- `e2e/show-workspace.spec.ts` still times out in its live-mirroring segment.
- Saved-file agents need Studio's worker package update for the new commands.

(r14 is the Properties-categories release; see LOCAL_DEVELOPMENT.md.)

## Installed release — 2026-10-22 (r13)

Generation `map-visualizer-20261022-r13` (`@aether/ui` alpha.206):
- Sidebar header is "Assets & Layers". The media list treats every asset
  alike, a timeline nested as an asset included, in both editors.
- Visual gallery › Advanced gains a Timelines shelf: add a timeline like any
  asset (only timelines that can nest without a cycle are offered; it appends
  to the current track).
- Visualization's tool bar keeps the standard command field; the icon row is
  replaced by the Apply-to-surfaces strip (shared StudioToolBar `toolRow`,
  alpha.206). The command field still searches every tool.

## Installed release — 2026-10-22 (r12)

Generation `map-visualizer-20261022-r12` (`@aether/ui` alpha.205):
- Sidebars: Mapping is Layers (active scene only) / Scenes / Outputs;
  Visualization is Media / Scenes / Timelines. Selecting a scene or timeline
  switches the list. Scenes and Timelines start collapsed as bottom tabs
  (shared TreePanelSplit `collapsible`). Visualization can't create scenes; it
  can create timelines. The media list lists only media (no timeline rows,
  no surface children, no target chips); the scene dropdown is gone.
- No per-surface timelines by default: a new show has one scene and one Main
  timeline. Saved surface timelines are kept and maintained.
- Advanced Media Pool column removed; the "+" gallery covers media,
  generators, online library and the show's pool.
- One Properties for both editors (VisualInspector): Adjust first with the
  source's controls (colors, speed…), then Fit, Shapes. Change over time
  (visual/source/placement/effect motion, Timing) is advanced-only. Effects
  is only the right sidebar's Effects tab.
- Visualization center, both editors: full-space scene render, input side by
  side, play bar with a Loop toggle on a fixed 0–duration scale. New shows
  loop one minute by default; saved continuous shows stay continuous.
- No double insets: preview heading bars removed; shared panel body is the
  only container (alpha.204).
Known gap: advanced lost the canvas-based surface composition editor in the
input pane; placement is edited in Properties › Fit.

## Installed release — 2026-10-22 (r11)

Generation `map-visualizer-20261022-r11`: right sidebar leads with Properties
and Effects (all other tabs kept). Properties uses standard elements
(`.ps-properties`, PanelHeading with ⋮ menu, SegmentedControl sub-tabs);
Map's custom inspector CSS removed. Effects tab reuses VisualProperties
(`only="effects"`); Media Pool's Effects tab removed. Visual gallery gains an
Advanced section (Test pattern, Tracker, In this show). Advanced "+" opens the
gallery.
Deferred (Jonathan, 2026-10-22): icon-only narrow mode for the sub-tabs and a
shared selection header card — these tabs are expected to be rebuilt soon.

## Installed release — 2026-10-22 (r9)

Generation `map-visualizer-20261022-r9`: simple and advanced share the whole
frame (they differ only in the center workspace). Visualization sidebar:
"Surfaces & Layers" + add, Surfaces | Visuals tabs (Comments-widget style),
working-scene picker, then the visual list tree or visual cards; visuals can
be grouped (`folder`). Clip index removed from Mapping (Layers over Outputs).
Surface tray above the tool bar in both editors; input splits left of the
render via view tools; view tools are per workspace. Removed: Edit
mapping/visuals, Agent tools, simple header, Mapping List/Cards switch
(online media is now a Visual gallery source). Advanced/Simple in the pill
beside MIDI; timeline docks in the footer.


## Installed release — 2026-10-21 (fourth round)

Generation `map-visualizer-20261021-r4` (`@aether/ui` alpha.203):
- Visualization left panel: standard Surfaces | Visual layers tabs. The
  Visual layers tab is the card rail; in simple it is the simple editor's
  own rail, portaled from the main window (all behavior intact).
- The simple editor rides the full standard frame: toolbar with Command
  search, right sidebar (Properties hosts the simple inspector), right view
  tools, pinned left sidebar, aux rail, footer dock, status row.
- Advanced visualization keeps the apply-to-surfaces tray in the toolbar;
  simple keeps its own targets section (no duplication).
- The input side-by-side split is owned by the view tools' Input button.
- alpha.203: right-click Toolbar settings on the classic ribbon too (the
  suite-wide density rollout; CAD takes it in its r37).


## Installed release — 2026-10-21 (third round)

Generation `map-visualizer-20261021-r1` (`@aether/ui` alpha.202):
- Visualization workspace per the Prism pavilion reference, on the standard
  frame: the apply-to-surfaces bar sits in the toolbar row above the slim
  Studio tool bar; the Layers panel toggles List ⇄ Cards (cards are the
  media-pool browser).
- The classic tab ribbon is retired everywhere; the Studio tool bar with the
  command field is the only toolbar. Right-click it for Toolbar settings:
  density compact (packed icons), standard (even spacing), expanded
  (captions under icons).
- Visual gallery: curated "Ink mesh gradient" and "Shader flow" presets
  matching the reference artwork.
Deferred: the reference's per-visual transport bar under the preview, and a
dedicated card design for the layers Cards view (currently the pool browser).


## Installed release — 2026-10-21 (second round)

Generation `map-grid-camera-20261021-r1`:
- The grid is real: scene-space inside each artboard (demo styling, 32px
  pitch, one-screen-pixel lines at any zoom), toggled from the view tools,
  and drags snap to it (geometry beats grid; grid snaps draw no guides).
- View tools: Grid, X-ray, Snap, Backdrop image, Input preview, Blackout.
  X-ray and Snap moved here from the canvas strip; a new toggle shows/hides
  the scene's setup backdrop.
- Zoom in/out and Fit live in the shared StudioCameraControl (CAD's
  collapsing cube) at the canvas top right; the strip keeps the zoom readout.
- Snapping preference now applies in every room; X-ray is app state.
Deferred: grid pitch is fixed at 32 scene px (make it a mapping preference
when asked); simple-visuals mode has no camera control or view tools.

## Previous — 2026-10-21

Generation `map-standard-rail-20261020-r3`:
- Document controls hamburger restored to the file footer's standard actions
  cluster (header placement reverted — not the standard layout).
- Right-sidebar view tools (`sideBottom.right`, CAD's placement):
  Fit canvas / zoom in / zoom out (canvas context commands), Input preview,
  Blackout — all real existing actions.
- Canvas grid uses the Map Studio demo's raster (subtle slate lines + depth
  vignette) in place of full-strength border lines.
- Cross-app standard per Jonathan: file-footer aux toggle icon is `folder`;
  CAD's Part list toggle updated in its working tree.
Open: Snap/X-ray remain in the canvas strip (component-local state); fold
them into the view tools if Jonathan wants them there.

## Previous — 2026-10-20 (third round)

The local install (localhost:8780) serves Map generation
`map-standard-rail-20261020-r2`: identical to r1 below except the Mapped
surfaces widget's content is Map's own `SurfacesStrip` again (the rendered
surface cards with the selected surface highlighted) — Jonathan keeps the
aux-toggle behavior but the widget's design was never meant to change to the
generic parts footer.

## Previous — 2026-10-20 (second round)

Generation `map-standard-rail-20261020-r1` (`@aether/ui` alpha.198,
`@aether/session` alpha.190), after Jonathan's screenshot review of
`map-standard-shell`:
- One aux toggle pattern everywhere: the footer widgets (Open files, Mapped
  surfaces, Timeline) toggle from the aux toolbar like the sidebar panels;
  the footer's own switcher rail is deleted, and toggling the active widget
  off closes the footer. Timeline only exists outside the Mapping workspace.
- Tasks merged into the comments review panel; no separate Action items
  toggle. Create version lives in the version panel's header; Document notes
  and Reminders open from the ⌘K palette. Document controls sit in the header
  utilities next to the settings cluster.
- Exactly one status row: alpha.198's standard CSS hides the app's own
  `ApplicationStatusBar` when the Studio session chrome injects its
  `.suite-status-row` (the doubled footer Jonathan saw on /map/).

## Previous release — 2026-10-20 (first round)

Generation `map-standard-shell-20261020-r1`, built on `@aether/ui`
0.2.0-alpha.197. It replaced `aether-suite-studio-layout-20261017-r1`'s Map.

What it carries:
- Standard header via `ModelStudioHeader` (`app="map"`): wordmark, show name,
  workspace pill (real branch when hosted), share-link icon, "Local preview"
  chip, and a ⌘K command palette wired to Map's real workspace and document
  commands. Right-side utilities are the real `WorkspaceQuickControls` cluster
  plus Map's settings window (alpha.196 added the export).
- alpha.197 studio frame: aux toolbar under the pinned tree card; aux sidebar
  (version control, comments, notes, reminders, AI advisor, action items,
  media library) opens full height at the far left, beside the footer.
- `WorkspaceRibbon` compact tools with the Command field and Undo / Redo /
  Frame chips (Frame runs the canvas's own `zoom-fit` context command).
- Footer is a switchable widget dock (`StudioBottomDock`): open files, mapped
  surfaces, timeline; flush edge-to-edge when the aux sidebar is closed.
  Document controls live in the dock's always-mounted trailing slot.

Verification: 1,112 tests / 155 files and typecheck green; frozen-build browser
acceptance passed; all 3,520 installed files byte-identical to the build;
server ready with schema, tables, providers and workers unchanged. Evidence in
`../AetherStudio/.verification/map-standard-shell-2026-10-20/`.

Open questions for Jonathan:
- "Edit visuals" and "MIDI" buttons sit in the workspace pill row; the demos
  show only the workspace selector plus display toggles. Keep or move?
- The Map Studio demo has a view-tools bar under the right inspector; Map's
  view controls (Snap, X-ray, Fit, zoom) live in the canvas strip instead.

Known limits: the mapping workspace's surfaces drawer still floats over the
canvas center rather than docking; dev against a running Studio host uses
`.claude/launch.json`'s `AETHER_DEV_SERVER` (currently localhost:8780).
