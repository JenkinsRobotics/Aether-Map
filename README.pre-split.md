# Aether Map

Projection mapping and show control. Author a projection onto real physical
geometry in the browser, then run it unattended from a Raspberry Pi wired to a
projector.

Design and full scope: [`dev/docs/roadmap/Aether_Map.md`](../dev/docs/roadmap/Aether_Map.md).
Shipped behavior: [`dev/docs/reality/STATUS.md`](../dev/docs/reality/STATUS.md).
Workflow review, remaining gaps and test evidence:
[`Functional review — 2026-09-14`](../dev/docs/roadmap/Aether_Map_Functional_Review_2026-09-14.md).
Reference comparison and tomorrow's live test:
[`map.club feature review`](../dev/docs/roadmap/Aether_Map_Reference_Review_2026-09-14.md).

## Workspace navigation — 2026-10-08

Mapping, Visualization and Show now live in persistent header tabs. Below 850px,
the same navigation becomes a compact header selector. Arrow keys move between
tabs. Mapping retains its top toolbar without a workspace selector; Visualization
and Show have no top toolbar.

Mapping's drawing/editing toolbar retains shape variants, masks, imports and
selection commands. It follows docked/floating/canvas layout and has no duplicate
tools above Layers. Visualization creates sources in the Media Pool; its Input
preview toggle is beside the Scene heading. Show contains its rehearsal, output,
Players and Export controls. All three workspaces retain the standard Aether
left tray, including version control, comments, notes, reminders and action items.
Show adds Outputs and opens it by default. Document commands remain in the header menu.


## Show workspace — 2026-10-07

Choose **Show** in the workspace selector. Its three tabs keep delivery separate
from authoring:

- **Show:** rehearse the selected output's Main composition, set Main length and
  loop/play-once/continuous playback, select outputs and edit routing, crops and
  schedules in Properties. Rehearsal controls this computer, not a remote Pi.
- **Players:** download the Pi installer, pair its six-digit code, name devices,
  inspect reachability, deploy the saved show, stop or forget a device. Each
  player needs exactly one explicitly assigned edge output and a valid scene.
- **Export:** download the editable project/media bundle, export a projection or
  wireframe, or record an output using the browser's capture picker.

Aether Player downloads the show, media and renderer and renders locally. A video
export is optional. A completed deployment continues offline and after reboot.
Assigned players automatically follow saved updates; this is a live document
assignment, not an immutable published release. “Assigned” confirms the host's
assignment, not completed transfer; this protocol has no deployment acknowledgement.
Stop reaches an offline player only after it reconnects.

Output schedules use the player's local clock, support selected weekdays and
windows crossing midnight, and restart Main at the beginning of each opening
window. Starting or rebooting inside the window starts from the beginning then.
Play once holds the final frame until the window closes. The Pi requires Raspberry
Pi OS **with the desktop** and desktop autologin: unattended playback still uses
Chromium's graphical renderer. Existing players need the installer rerun to accept
current timeline show versions (1–7). Other IoT transports and remote pause/seek
are not implemented. Project ZIPs are editable bundles, not standalone players.

## Visualization workspace layout — 2026-10-07

Visualization uses the shared framed workspace, like a table or editor. Changing
Studio mode between Docked, Floating and Canvas keeps the Media Pool and previews
inside the area clear of the side panels and bottom timeline. Preview
zoom controls use the preview's own edges. The floating bottom editor also stays
between the side panels; its mixer remains part of the timeline.

When panels leave less horizontal space, the Media Pool stacks above the previews.
The working area scrolls when necessary, keeping controls reachable without
forcing the whole page wider. Layout changes retain the Media Pool's current view
and search. Mapping continues to use the full canvas layout.

## Surface editing and preview quality — 2026-10-08

Visualization keeps the full Main scene in the right render pane. Selecting a
surface in Layers or the canvas, a surface timeline clip, or a timeline card
opens its composition in the left pane, including the currently playing assets.
Double-click a timeline card to open its editing tracks. Selecting a Media Pool
item or creating a generator switches the left pane to that source instead.

The surface preview's bottom controls include **Normalized / Raw**, Snap, zoom,
Fit and reset. Normalized removes perspective; Raw shows the mapped quad.
Cube faces default to square. Other surfaces start with their source proportions;
choose a ratio or enter a custom one to match the real surface. View proportions
are saved separately and never move the projector's corners or change output
resolution. A drawn quadrilateral alone does not identify its physical ratio.

Text selection follows the wrapped browser text, including font and spacing.
Media bounds exclude Fit's empty margins. Move and align use these visible bounds;
corner resizing anchors the opposite content corner. Snapping uses the surface's
edges/center and other assets, with guides; hold Alt to temporarily bypass it.
The editor uses layout zoom and affine transforms for crisp text/SVG and sizes
shader sampling for display density, with a bounded preview pixel budget. This
improves generated/vector previews without inventing detail in small source images.

Select a clip in the timeline or its picture in the surface view. Drag its body
to move it, corner handles to resize it, or the round handle to rotate it.
Arrow keys nudge by one local pixel; Shift moves ten. Escape cancels a drag,
and Undo/Redo treats a drag as one edit. **Properties → Fit → Position & size**
provides center X/Y, width/height, rotation, edge/center alignment and reset.
The view also offers zoom and Fit surface.

Placement belongs to each clip use. It is saved without changing the Media
Pool source, the mapped surface geometry, or another use of the same asset.
Repeat targets share relative placement; Span retains its shared window.
Editor and output rendering apply placement within the fixed surface warp and
clipping. Existing clips default to filling their target.

## Bottom panels — 2026-10-06

The bottom bar toggles **Surfaces** and **Timeline**. The timeline command bar
toggles **Audio mixer**, which is part of the timeline. Hiding Timeline hides
its mixer too; reopening restores the previous mixer visibility. Surfaces remains
independent above the timeline. Each workspace remembers its preferences across
reloads. The dock retains its resizing and stays centered in floating layouts.

Audio combines soundtrack channels (meters, mute, solo, volume and EQ) with
**Configure audio** for microphone devices, sensitivity, smoothing and modulation
levels. It works in Standard and Advanced timeline modes. A track's EQ button
opens Audio and selects that channel. Microphone capture still requires Start.
Export tools are in **Document controls → Export options…**.

## Sources and libraries — 2026-10-06

Visualization’s media panel owns content creation:

- **Media Pool:** imported files, reusable sources and timelines. Drag a source
  onto a track or choose **Append to track** to schedule it.
- **Generators:** Text, Shader, Paint, Colour, Test pattern, Webcam and Tracker.
  Creating one adds a reusable pool asset without adding geometry or a timeline
  clip. Adjust its source in Properties; use **Paint source** to draw in the
  input preview, then **Done painting**. Pool edits flow to inheriting clips.
- **Effects:** add an effect to the selected timeline clip, then adjust its stack
  in Properties → Effects.
- **Online Library:** the existing Openverse image search/import, plus external
  provider links under **More places to find content**. Imports download into the
  pool with credit metadata. The other providers are links, not connected APIs;
  download a file there and use the pool’s **Import** button.

Source creation and file import live in the media panel. Mapping geometry tools
remain in the Mapping toolbar; preview controls are beside the scene. Delivery lives in Show.

## Surface timelines and command bar — 2026-10-06

Every mapped surface gets a reusable timeline with initial **V1** and **A1**
tracks. **Main** starts with one nested layer per surface plus one shared **A1**.
The tab strip opens Main or a surface in either mode; double-clicking a nested
clip also opens its timeline. Drop pool media on a Main surface layer to place
it inside that surface's sequence. Appending places another use after the last
clip on the selected track. Add tracks for overlapping layers in Advanced.

Existing sequential surface clips migrate together; overlapping tracks retain
ordering. Shared/multi-target visuals and scene-wide content remain explicit
layers. Interleaved shared layers stay in Main when regrouping would change
compositing. Removing a surface removes its default Main use and keeps the
sequence in the pool for reuse. Sources, clip identity, targets and timing remain
intact; automatic surface setup is idempotent across edits and reloads.

The compact top command row includes Select/Trim, split and trim-to-playhead,
snapping with independent clip-edge/playhead/grid switches, zoom/Fit, a saved
master volume/mute/DIM control, Mixer and settings. Trim mode drags the nearer
edge of the clip; edge handles remain available in Select. DIM attenuates the
soundtrack by 20 dB. Master controls apply once after nested audio evaluation;
they do not change microphone modulation input.

## Reusable timelines — 2026-10-06

The Media Pool includes **Timelines**, with **Main** as the default. In Advanced
mode choose **New timeline**, name it, then edit its V1/A1 tracks. Double-click a
timeline card (or press Enter) to open it; the tabs below the timeline command bar
switch between Main and the scene's named timelines. Right-click a card to open,
rename, append or delete it. Main cannot be deleted; a referenced timeline must
have its scheduled uses removed before deletion.

Drag a named timeline onto a video track in Main or another timeline to schedule
it as one nested clip. Move/trim, in-point, duration and looping apply to that
use. Its child clips retain their own tracks and surface assignments, including
Repeat/Span, and share the Media Pool's reusable sources. Edit the child to update
all uses. Nesting cycles are rejected. Audio in the child follows its local clock,
track mute/solo, volume and EQ. This is nested scheduling of mapped layers, not
rendering a timeline into a single texture with group-level effects.

Named timelines belong to their scene. The editor previews the open timeline;
physical outputs run Main. New timelines use file format **7**, preserving
source/clip/track identities and timeline references. Existing shows continue to
load; older Map builds reject format 7. Standard and Advanced use the same tracks;
Standard exposes Main and automatic surface timelines. Additional timeline creation,
nesting, track creation/reordering/routing and track settings are Advanced controls.
Switching from an additional timeline to Standard returns to Main; all saved
sequences and playback content remain intact.

## Lazy Lighting reference controls — 2026-10-04

The [current acceptance matrix](../dev/docs/roadmap/Aether_Map_Lazy_Lighting_Acceptance.md)
covers Jonathan's supplied guide. Full competitor parity is still open; older
seven-item comparisons are not a release sign-off.

- Mapping → Properties → **Show visual** previews the current content while
  calibration geometry stays fixed. This preference survives reload locally.
- Drawing content → **Animate strokes** adds constant-speed reveal in draw order,
  with duration and loop/hold. Pausing and scrubbing use the same clock on output.
- Shader → **Animate a parameter** supports a saved min/max range, Flip, Clear,
  and four **shared LFOs**. Parameters on one LFO share its waveform, period and
  phase even when their clips have different offsets. Existing additive cycles
  retain their behavior when Use range is off.
- Shader **A/B/C** buttons recall looks; the save icon under each stores the current
  look. Random starts from a valid variation and changes colors/continuous controls.
- **MIDI Learn** arms for the next control change; the existing last-fader shortcut
  also remains. Local output windows now follow the editor's audio/MIDI values.
- **Configure audio** exposes microphone sensitivity, smoothing and four band
  meters, also available in Visualization's Audio tray. Device access always needs
  an explicit Start action; no soundtrack/timecode capability is implied.

Effects stacks, modulation of non-shader parameters, whole-body control,
performance faders and a QR-paired Android TV receiver remain on the acceptance
checklist. Browser Cast routing and Aether Player do not certify that receiver.

## What works today

- **Header workspace navigation.** Mapping, Visualization and Show use shared
  header tabs with a compact selector on narrow windows. The header also carries
  application identity, document commands/name/save status and layout/settings/
  account controls. Document commands include Save, Rename, links and exports.
  Sidebar layouts remain docked/floating/canvas. Mapping keeps its top toolbar without a workspace selector;
  shape variants include Square, Circle and Box. Rectangle/Ellipse constrain with
  Shift. Add Shape stays in the Surfaces tray, and New Surface stays in Layers.
  Visualization uses Media Pool creation and a Scene-heading input-preview toggle.
  Show owns playback, output routing, Players and Export. Shared Aether widgets
  and artwork supply the controls. Visualization and Show omit the ribbon.

- **Surfaces and assets.** Layers owns scene geometry: surfaces, warp, masks and
  geometry animation. Assets is an independent tree beside Layers and Outputs.
  Select a shader, image, video, text, camera, tracker or drawing there to open
  **Targets / Adjust / Fit / Effects** in Properties. Double-click and Edit use
  that same inspector; Map has no CAD-style feature edit window.
  A visual can target one surface, several surfaces, or entire scenes. **Repeat**
  places the complete source on each face with shared settings and timing.
  **Span** uses a shared output-space window clipped to the target outlines;
  it is not an unfolded box/UV wrap. Entire-scene targets obey ordinary asset
  paint order; Move backward makes a scene visual act as a background.
  Each visual has one timeline track per assigned scene. Duplicate as independent
  visual copies its settings and targets at the same time, with separate identity.
  Surface animation/cues remain in that surface's Properties. Mapping shape
  creation and geometry editing remain surface-based. Visualization creation
  targets the selected surface(s), the selected asset's targets, or the scene.
  Six ordered source effects are available: slide, rotate, zoom, blur, grayscale
  and color cycle. Additional effects/modulation are tracked in the acceptance
  matrix; the current release does not claim full Lazy Lighting parity.
  Saves use format **4**: `visuals` owns source, timing, effects and targets;
  `scenes[].surfaces` owns geometry. Formats 1–3 import automatically, retaining
  continuous sources, clip identities, timing, geometry and legacy overlap rules.
  Older Map builds reject format 4 rather than silently discard shared assets.
  The Mapping workspace's **Add Shape** sheet is a compact route to the same
  Create tools. It creates a square or circle as one
  drawn surface, Text as timed content, and an Outline with the pen. Cube places
  three connected faces; Box places a back face and four walls. Each face is its
  own selectable surface in the tray, while matching shared corners move together.
  A new Cube or Box starts with its folder selected. Dragging any face then moves
  the entire shape; clicking a face again selects that face for independent
  alignment and node editing. Selecting the folder in Layers also selects the
  whole shape. A whole-group selection has the same eight corner/side resize
  handles and rotation handle as a single surface. Resizing maps every face
  through one shared frame so joined edges stay joined; Shift preserves the
  compound's aspect ratio, and Shift-rotation snaps to 15-degree increments.
  Arrow keys nudge the selected group, and one Undo restores a whole-group
  move, resize or rotation. A locked member prevents a partial group transform.
  Every placed solid receives its own group row, with a Cube or Box icon in
  Layers rather than a generic folder. That identity survives renaming and
  saving the show; manually regrouped faces use the ordinary folder icon.
  Transparent PNG imports an
  alpha-capable PNG onto a new surface, including when another face is selected;
  Import backdrop adds an editor-only reference image; it is the same action
  as Create → Import backdrop. Smart Shape Detection and AI Generation are
  visible but disabled in both the sheet and Create → Smart Tools.
- **Asset timing and commands.** Static/generated assets start at 30 seconds;
  videos use their natural duration. Select a child for its name, source, start,
  duration, in-point and loop/hold controls. Double-click opens the property
  window. The shared footer deletes/duplicates/renames the selected asset or
  moves it earlier/later; right-click provides hide/show and lock/unlock. Drag an
  asset onto another surface to transfer it, or before/after a sibling to place
  it there. Parent controls still act on the whole surface. Removing the last
  asset leaves an empty track. Existing continuous inputs stay continuous until
  explicitly timed or extended into a sequence; original media crops are retained.
- **Feature tools.** Surface, Mask, Text, Shader, Webcam and Tracker open the
  shared draggable CAD property window. Double-click an asset to reopen its content window; double-click a surface
  to edit its geometry and active input. Accept keeps edits; Discard restores the feature and removes
  canceled previews from undo history.
- **Input and output previews.** Inspect a selected source before its warp,
  alongside the composed workspace. Input crop selects original image/video
  pixels; X-ray helps align overlapping features without changing projection.
- **Shaders.** All 27 effects observed in the reference, from gradients/noise
  to water, liquid metal, dithering and image effects, using Paper Shaders.
  Effect controls and presets are editable; timed effects use their asset clock, while older continuous effects retain scene time.
- **Webcam and hands.** Explicit camera connection, device/aspect/mirror controls
  and actual local MediaPipe hand tracking. Four hand styles, one/two hands,
  side/size/colour, record and loop/hold playback. Stop recording to keep a take.
  Saved landmarks replay without camera access; live input reaches local output
  windows over WebRTC. It is not streamed to remote Pis yet.
- **Feature animation.** Opacity, horizontal/vertical movement, scale and rotation
  tracks with linear/smooth/hold keys. Select a layer, choose the property, set
  time/value and Add keyframe. Drag diamonds to retime; existing clips remain.
- **Scenes are artboards.** Each scene has its own dimensions and layers,
  independent of the output device. New scene and Scene properties offer a name,
  HD/Full HD/4K/square/portrait presets, aspect ratio, pixel width/height, aspect
  lock and orientation. Double-click a row or press F2 to edit; Apply/Create
  commits the draft, Cancel keeps the original. Resizing keeps existing layers
  and the Backdrop in place. Imports, snapping and alignment use the artboard.
  One bottom toolbar creates, duplicates, deletes and moves scenes up/down;
  drag rows to reorder without changing the playing scene. Undo/save preserve
  dimensions. Drag a surface body onto another artboard to move the surface to
  that scene: its Layers row moves with it, the shape stays under the pointer,
  and both artboards and linked outputs update immediately. Dragging a selected
  Cube or Box moves all of its face rows together and preserves the compound.
  The transfer and movement are one Undo step. Selecting a layer from another
  scene's tree branch activates its owning scene and leaves it editable. A
  surface can also live on the workspace without belonging to any scene: drag
  it off every artboard and its stable layer row moves to the tree root, where
  it remains visible, selectable, movable, resizable, rotatable, editable and
  saved, but no output projects it. Drop that root object onto an artboard to
  assign it to the scene under the pointer. Cube and Box groups keep their
  faces together through both transitions. Older shows inherit their original
  output dimensions and start with no unassigned surfaces.
- **Continuous playback.** New shows keep playing for as long as needed. The
  timeline's View range grows with content and the playhead; it is not a scene
  duration. Choose Loop or Hold in the timeline when a timed sequence is wanted,
  then set Sequence length. Saved explicit loop/hold settings remain intact.
- **Backdrop.** Choose Import backdrop in the Mapping toolbar to add a
  reference photo. Open Scene setup in the right rail to select an existing
  image, adjust its opacity, hide/show it, or remove it. It is saved
  per scene and never drawn on monitor, wireless or player output.
  The image also appears as the bottom **Backdrop** layer, with an editor-only
  state icon. Select it for input preview and Properties; right-click to hide/show
  or delete it, or use the shared Delete/Layer properties footer controls.
  Double-click opens a property window with Accept/Discard. It stays behind the
  projected layers; removal and property changes support undo.
- **Transform and Color inspectors.** Open Transform or Color in the right rail.
  Transform provides scene-pixel X/Y, width/height, aspect locking, a relative
  Scale by percentage, rotation, and scene-edge/center alignment. All layers,
  including Backdrop, use the same geometry controls. Normal canvas selection
  shows eight side/corner resize handles and a rotation handle; Create → Node (A) switches to individual
  projection-corner and mask-point handles. Create → Select (V) restores the
  standard transform box; Shift-drag rotation snaps in 15° increments. Snap aligns edges/centers to the scene
  or other visible layers, with guides; Alt bypasses snapping, Shift preserves
  proportions. Resizing moves the outlines with their content. Existing animation
  keys stay intact. Backdrop placement and locks persist in the show.
  Color edits rendered fill/text/tracker colors or individual shader palette
  colors, plus opacity and a separately labeled layer marker. Image/video colors
  remain source-driven; Backdrop opacity only affects the editor.
- **Media placement.** Media → Add Media appends an image/video asset to the
  selected surface, or creates a surface with the media's natural aspect ratio.
  Asset Properties → Choose file replaces that asset's input while retaining its
  timing and parent geometry. Assets → Add media imports into the library;
  Place appends it to the selected track. Backdrop remains the fixed bottom
  reference layer, excluded from output.
- **Standard trees.** Scenes and Layers use Aether UI's TreePanel, the same
  panel as CAD's feature tree: aligned rows, state icons with tooltips, one
  bottom toolbar, and right-click/Shift+F10 menus. Layer commands include
  rename (F2), duplicate, delete, properties, move forward/backward, hide/show
  and lock/unlock. Drag rows to reorder; hidden/locked state is shown only
  when applicable. Cue icons expose counts in their tooltips; root surfaces align with the tree edge and only child assets are indented.
- **Selection and movement.** Click a feature's body to select it and drag
  anywhere inside to move the whole feature and its mask. Picking respects
  layer order and shape clipping; Alt-click cycles overlapping features.
  Click blank canvas or Escape to clear selection. Double-click a feature or
  press Enter on the focused canvas to open its properties. Delete/Backspace
  remove the selected unlocked feature from the canvas or layer tree.
  Drawing a profile returns to Select, ready to manipulate the new feature.
- **Text surfaces.** Fill a surface with text instead of media; the same warp
  applies, so a sign reads correctly on an angled wall.
- **Warp.** Choose Create → Node (A) and drag a surface's four corners over the projector's output raster;
  an image or video is warped onto it by a true planar homography. Surfaces
  without media show a checkerboard, which makes the perspective visible while
  aligning to a physical shape.
- **Two rooms.** *Mapping* for surfaces and warp against the physical thing;
  *Sequence* for assets on layers over time. Switch with the workspace menu
  left of the tool tabs; each remembers its own layout.
- **Clips on tracks.** One track per surface. New assets append after existing
  content (or at the playhead if later). Drag a clip to move, its edges to trim; it loops or holds. A layer
  shows whichever clip covers the playhead, and nothing in a gap. Cues (show,
  hide, opacity steps) sit on the same track.
- **Layer colour.** Each layer's dot, outline and clips share one colour.
- **Automatic saving and refresh recovery.** Every document edit is captured in
  this browser tab immediately and saved to the Studio library automatically.
  New shows receive a library file on their first edit. Network failures retain
  the pending work and retry; conflicting or read-only files offer Save a copy.
  The header reports the actual save state and gives the filename room to fit;
  click the name to rename it. Manual Save remains available. Media is streamed
  to a separate store. Recovery survives refresh in the same tab; wait for Saved
  before closing a tab when the host is unavailable. Feature/Backdrop previews
  are protected locally while open, then saved on Accept or restored on Discard.
  The browser URL changes only when a draft receives a document identity;
  ordinary edits and save-state updates do not write browser history.
- **Projector output.** Open a separate output window, move it to the intended
  projector/monitor and double-click inside for fullscreen. It stays synced
  live over a channel belonging only to that editor session.
- **Output region.** Choose the scene rectangle to project, drag/resize it or
  enter pixel values, match the detected output-window size, and choose
  fit/fill/stretch. Blackout and an output test grid are available. This region
  is saved without changing the scene's original size or setup image. Its box
  stays anchored to the output's assigned scene while other scene artboards are
  selected; it becomes editable when that linked scene is active. The box is
  blue while assigned and green while its receiver or output window is live;
  the scene-name row does not repeat the output and device in a second badge.
- **Wireless output.** Output and Devices → Wireless provide a clean Cast tab
  and AirPlay window. Select the receiver in Chrome's Cast menu or macOS Screen
  Mirroring; share the output picture. These are complete-composition sharing
  flows, not native in-app receiver discovery. Physical receivers remain untested.
- **Surfaces, drawn like a sketch.** Pen, rectangle, ellipse, polygon and
  freehand in the Mapping toolbar (V/P/M/E/G/N), the same illustrated glyphs as Aether
  CAD. A closed profile *is* a surface: its bounding box is the warp quad —
  a perspective warp needs exactly four corners — and the profile is the
  outline that clips the picture. Round handles warp; square handles move the
  outline. **Cutout** makes the next profiles black: a projector masks by
  projecting nothing, so a black surface on top is the mask.
  Each scene's editing artboard shows only its own surfaces, including during a
  program crossfade. The output window continues to show the blended program.
- **Colour fills.** A surface can be a solid colour — light an edge or a frame.
- **Precision alignment.** Arrow keys nudge the selected feature, or an active
  corner/outline handle, by one output pixel; Shift moves ten pixels. Space or
  middle-button drag pans without editing geometry. Locked layers cannot be
  moved or deleted until unlocked.
- **Undo.** Cmd/Ctrl-Z and Shift-Cmd/Ctrl-Z. Each body/corner/outline drag is
  one undo step, including a drag paused for several seconds. Escape during
  a drag cancels it and preserves earlier undo/redo. Text fields retain their
  own deletion and undo keys.
- **Stable editing and recovery.** Dragging remains live, while recovery storage
  serializes the show once when the gesture finishes and projector updates are
  coalesced to the browser's paint frames. An unexpected editor render error
  opens an autosave-backed recovery screen instead of leaving a blank page.
  Repeated editing stays below Safari's History API rate limit because identical
  document and output-session URLs are never replaced again.
- **Media management.** See what a show carries, remove it, and delete orphaned
  files the server confirms nothing else uses.
- **Devices.** *Monitor*: **Open output window** works without display discovery.
  The panel reports the window's live content size; **Match window size** applies
  it to the show raster explicitly. Resizing/fullscreen update the measurement,
  and closing the window clears it. These are CSS-pixel rendering dimensions,
  not a claim about the panel's native resolution. Supporting browsers also offer
  optional display scanning and placement under **Choose a detected display**.
  *Edge device*: pair a Raspberry Pi by the code on its projector, deploy a
  show to it, and it runs offline from its own disk.

Video follows the show clock in both the preview and the projector, so a show
is deterministic: restart it and the clips restart with it.

- **Project bundles.** Export a folder holding the document, the device
  layout, every asset, and an SVG wireframe of the mapping.
- **SVG geometry.** Import surfaces from a drawing; export the mapping as SVG.

Not yet: remote live camera transport, NDI/capture-device integrations, audio
tracks, automatic scene playlists/transitions, edge blending across projectors,
mesh warp for curved surfaces, and OSC/Art-Net/timecode control. Tracker hand
styles use original 2D landmark rendering, rather than a textured 3D hand mesh.
Safari, physical receivers and Pi hardware performance still need live testing.

**On interchange:** there is no universal projection-mapping format — MadMapper,
Resolume, HeavyM and Millumin are all proprietary. SVG is the real
interoperability path for geometry, which is why it is what we read and write.
OSC, Art-Net/sACN, NDI and SMPTE timecode are the genuine industry standards for
control and transport.

See the design document.

## Commands

```bash
npm install
npm run dev      # http://localhost:5179
npm test         # vitest
npm run build    # tsc -b && vite build
npm run lint     # oxlint
npm run e2e -- --workers=1  # production Chrome flows, isolated Studio host
```

The camera test needs `ffmpeg` and uses a stock MediaPipe image through Chrome's
camera test input, including actual inference and output streaming. Builds
verify the committed model checksum and copy pinned runtime assets locally;
no CDN/model download is needed at runtime. Notices and provenance are in
[`public/vendor/README.md`](public/vendor/README.md).

The host serves the built app at `/map/` (`core/host/server.py`).

## Getting around the canvas

| Gesture | Does |
|---|---|
| Scroll / pinch | Zoom about the pointer |
| Shift + scroll | Nudge sideways |
| Space + drag, or middle-drag | Pan |
| `F` | Fit the raster |
| Arrow keys | Nudge the selected handle a pixel, Shift ten |

Drag the separator above the timeline to change how much room it gets; the
height is remembered on this machine. Fit follows available space until you
pan, zoom or choose 100%. Reopen output after refreshing the editor.

## One bundle, three roles

| URL | Role |
|---|---|
| `/map/index.html` | The editor. |
| `?output=1` | The projector picture — surfaces only, black ground. |
| `?portal=1&device=<id>` | The pairing code a new device shows. |

A device deploys one archive, and the warp cannot drift between the editor and
what lands on the wall.

## The warp

A surface is a quad in its scene's artboard, and its warp is a planar
homography emitted as a CSS `matrix3d`. The browser then performs the
perspective divide per pixel, in hardware.

This is deliberate. A subdivided mesh with four moved vertices interpolates
*affinely* across two triangles, which creases straight lines along the
diagonal — the most common bug in homegrown mappers. `matrix3d` is correct by
construction, keeps `<video>` in the hardware compositing path (which matters
on a Pi), and needs no WebGL.

The cost: `matrix3d` is planar and cannot bend. **Mapping onto a curved
surface — a cylinder, a vehicle, an animatronic face — requires a subdivided
mesh and a real shader, and that is the trigger to add a WebGL path.** Until
then it is not built.

## Shared vector region tools

Select surfaces (Shift-select rows, or select their group) and open Properties →
Combine vector surfaces. Union, Subtract front, Intersect and Exclude overlap replace
those surfaces in one undoable edit; the backmost surface supplies the content.
Curve tolerance is in scene pixels. Make compound retains Bézier curves; Even-odd
creates holes, Nonzero uses winding, and Independent outlines keeps legacy unions.
Release compound separates contours while preserving their content projection.
Node mode edits each contour's points/handles. Holes affect preview, picking and
live output, and survive save/reopen.

SVG import now retains closed curves, transformed groups and compound outlines,
rather than taking only four corners. It maps the SVG viewBox onto the current
artboard. Open paths and unsupported SVG effects/text/resources are reported;
outline text and expand effects before importing mapping geometry. Existing
Visualization text and editable text-silhouette controls remain available.

Boolean work runs off the UI thread. Operands must share a scene/collection and
be enabled, unlocked vector surfaces without alpha silhouettes, bends or animation.
Static transforms are baked. The operation retains the backmost content source;
it does not merge separate media tracks. Legacy masks without `maskFillRule` keep
their original independent-union semantics.

## Projection references and agent briefs

Open **Mapping → Export → Projection references** to download the active scene
as editable SVG or as a reference package. The document menu's **Download mapping
as SVG** includes all scene artboards. Both use current edits without requiring a
saved project. The older project ZIP is still the saved show/media backup.

Open **Aether Agent** on the right rail in Mapping or Visualization. Enter a
prompt in the single bottom composer. Use **+** to choose scene or selected-surface
context. Open **···** for animation duration (default 15 seconds) and **Download
creative brief**. Enter submits; Shift+Enter inserts a line. **New chat** clears the
conversation and draft. With no provider connected, text stays local.
**Connect agent** opens Studio’s account-only plugin marketplace (ChatGPT, Claude,
Google Gemini); enabled, connected providers use the shared streaming composer
and Stop control. Live account authorization and inference still require release
qualification. Conversations survive
workspace switches for the current session and are separate for each scene.
Reloading clears them.

The ZIP contains editable mapping.svg, mask.png for mapped geometry,
target-mask.png for the intended artwork area, prompt.txt, manifest.json with
IDs/dimensions, and reference.png when the scene backdrop is enabled. White mask
pixels allow artwork; black pixels exclude it. Scene targets cover the whole
artboard except cutouts. Surface targets preserve selected silhouettes and holes.
Geometry uses time zero, and content opacity/timing are not baked into the masks.
Generated results should retain the full artboard dimensions and framing.

This package is an artwork handoff, not MPCDI calibration. SVG preserves cubic
outlines but samples projected conics and does not vectorize raster alpha masks.
AI scene-surface detection, in-app media generation, and a review/apply workflow
for generated overlays remain planned. Account chat does not provide video generation.

## Release verification — 2026-09-30

See [the release verification report](../dev/docs/reality/Map_Release_Verification_2026-09-30.md)
for tested workflows, repaired regressions and remaining release gates. Browser
coverage exercises the production build with a temporary host and installed Chrome;
it does not certify physical projector hardware or live provider accounts.

## Sidebar position

Open the header gear → **Workspace → Sidebar position**. **Outside** (the Map
default) places sidebar panels at the window edges with the icon rails beside
the canvas. **Inside** restores rails at the edges and panels toward the canvas.
The preference applies to both Mapping and Visualization and survives reloads
on this browser. It works in Docked, Floating and Canvas layouts; the separate
Layout choice still controls whether panels push the workspace or overlay it.
Freely dragged windows retain their individual positions.


Sidebars use the shared Aether UI full-height top-tab variant by default.
**Settings → Workspace → Sidebar tabs** selects Top, Bottom, or Side rail;
the choice persists across reloads and workspaces. **Layout → Floating** gives
the floating full-height frame; existing layout preferences are preserved.
Inside/Outside rail positioning is available when Side rail is selected.

### Global sidebar navigation

Map's editor uses the same `ApplicationSidebar` as Vector: app identity and
collapse control at top, current show/document menu, Mapping / Visualization /
Show buttons, library links, and layout/window/app launcher plus account/settings
at bottom. Collapse survives workspace changes and reloads. The application
header is removed; Mapping retains its drawing toolbar. Document panels remain
beside the workspace, including the standard history, comments and tasks in
Show. Canvas, floating and docked layouts, timeline/mixer, rendering, playback
and device deployment use their existing state and controls.

The docked Mapping toolbar spans the center column, aligned with the canvas and
bottom tray. Left and right panels extend beside it from the workspace's top;
expanding/collapsing panels changes the toolbar and tray width together.

### Open-show tabs

A compact shared DocumentTabs row sits above the workspace, to the right of the
application sidebar. Open/New adds real shows from the existing personal or
workspace file browser. Tabs show file names, the active file and unsaved status;
close, drag reorder, keyboard selection and overflow are available. Open file
metadata persists in sessionStorage per authenticated account and browser tab;
file contents remain in the existing host/recovery system. Switching or closing
first flushes the current document, and a failed save keeps it open with an error.

This initial file-tab implementation uses the existing save-and-reopen navigation.
It does not keep inactive editors, undo stacks, active tools or output sessions
running in the background. Reload restores the open-file list; selecting a file
opens its saved/recovered contents. Branches have distinct tabs.
