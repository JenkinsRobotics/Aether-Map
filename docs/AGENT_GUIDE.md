# Aether Map agent control

Map owns one validated command API. The open editor, Studio saved-file workers,
and local CLI/MCP all use that API and the ordinary `.aethermap` document.
Agents can build scenes and surfaces, create visuals, assign targets, change
geometry, timing, placement and effects, inspect results and test composition.

## In the app

In Visualization → Simple, click **Agent tools**. The included program creates a
new scene, a mapped wall and a neon visual, then asserts that one layer renders
at five seconds. Click **Run program**, close the dialog and choose **Agent light
show** in the scene picker. Ordinary Undo reverts the whole build. This works
without a model connection.

The advanced editor's **Aether Agent** panel exposes the same tools to providers
connected through Studio → Plugins → My connections. Start with:

> Discover your Map tools and gallery. Build a new 1280 × 720 scene with two
> mapped walls, apply an aurora visual to both, and add a title. Verify the
> composition at 0, 5 and 20 seconds. Show me the shader source preview.

This source build exposes 15 product commands plus undo/redo. A host declaring
`images-v1` also enables the mapping-mask and shader-source PNG tools (19 total).
The installed body-modulation build still has 14 commands until the matching
frontend/worker candidate is accepted and promoted. The direct Agent tools panel
can preview shader sources on either host version. Discovery returns product command names such
as `map.visual.create`; live tools use `aether_map_visual_create`. Programs use
the product names. The agent never receives arbitrary JavaScript/shell execution.

## Local files, immediately usable

Requires Node 22.12 or later. Run from this repository after `npm run build`.
The generated bundle is self-contained and can run from any directory.

```sh
node service/aether_map_service/runtime/cli.mjs init --file /absolute/new-show.aethermap
node service/aether_map_service/runtime/cli.mjs inspect --file /absolute/new-show.aethermap
node service/aether_map_service/runtime/cli.mjs catalog --write
```

`init` refuses an existing file. Inspection returns `file_sha256`. Editing requires
`--write` and that current hash, preventing stale overwrites. `run` reads one JSON
argument object from stdin. For example:

```sh
node service/aether_map_service/runtime/cli.mjs run \
  --file /absolute/new-show.aethermap --command map.agent.docs <<'JSON'
{"topic":"recipes"}
JSON
```

Pass `{"program_json":"<JSON-encoded recipe>"}` to `map.show.runprogram`, together
with `--write --expected-sha256 <hash from inspection>`. A failed step or assertion
saves nothing. Successful local writes replace the same file atomically; keep
backups as usual. Local commands do not provide Studio's durable revision history.

## Local MCP

Add this stdio server to a compatible agent host's MCP configuration, replacing
the two paths with absolute paths. Omitting `--write` exposes only read tools.
The launch-selected file is the full scope; tools cannot choose another path.

```json
{
  "mcpServers": {
    "aether-map": {
      "command": "node",
      "args": [
        "/absolute/Aether-Map/service/aether_map_service/runtime/cli.mjs",
        "mcp", "--file", "/absolute/show.aethermap", "--write"
      ]
    }
  }
}
```

MCP tools use `map_show_inspect`, `map_agent_docs`, `map_show_runprogram`, etc.
Write arguments include `expected_sha256` from the latest inspection. Identical
request-ID retries reuse the last 100 session receipts. A restarted process or an
evicted receipt requires fresh inspection; do not infer durable exactly-once behavior.

Studio's separate scoped saved-file connections remain available through
Plugins → Agent access. These use file IDs and expected revisions, retain Studio
permission checks and revision history, and address saved files. Open editors
must reload a file changed through saved-file agents. The in-app agent edits the
current unsaved show and ordinary undo/autosave directly.

## Discovery, execution and evidence

`map.agent.docs` topics: `tools`, `gallery`, `sources`, `recipes`. Tools/gallery
are paged by `offset`; follow `next_offset`. Search with `query`, or get an exact
command's executable schema with `name`. The gallery has 155 editable presets/recipes from 41 generators (seven additional image filters are excluded from that count). Six original video loops are listed separately in `bundled_video_loops`. Import a loop through the editor gallery, inspect its media ID, then place it with `kind:"media"`; loop IDs cannot be passed to procedural `kind:"gallery"` commands. The imported file uses normal save/export and layer semantics.

Commands:

- `map.show.inspect`, `map.show.evaluate`, `map.show.verify`
- `map.agent.docs`, `map.show.runprogram`
- `map.scene.create`, `map.surface.create`, `map.surface.bounds`, `map.surface.rotate`, `map.cube.pose`
- `map.visual.create`, `map.visual.edit`
- `map.asset.place`, `map.clip.move`, `map.clip.edit`

Programs contain `version: 1`, 1–32 `steps`, and optionally up to 16 composition
assertions. Each step has a unique `id`, `command`, and `arguments`. Reference
created identities with `{"$ref":"earlierStep.scene_id"}`; other available fields
are `surface_id`, `clip_id`, `asset_id`, and `track_id`. `source_json` and
`changes_json` may be objects inside a program, allowing references in targets.
Individual tool calls take JSON strings. There are no nested programs.

An assertion is `{ "scene_id": "…", "time_s": 5, "layer_count": 2 }`.
It uses Map's actual Main composition evaluator before committing the candidate.
`map.show.verify` also round-trips the canonical parser and checks asset, track,
timeline, media and target references. It reports bounded layer data and whether
that listing is complete. Reverify after editing.

Source specs: gallery `{kind:"gallery",id:"aurora:0"}`, color
`{kind:"color",color:"#2060ff"}`, text `{kind:"text",text:"Hello",size:120}`, or
existing imported media `{kind:"media",media_id:"…"}`. Colors are hex.
`map.visual.edit` documents its exact fields in discovery. Source replacement
changes only that visual's use; other uses of the pool asset remain unchanged.

## Qualified scope

Numerical verification is composition evidence, not rendered-pixel certification
or a guarantee that external media files are available. The live source preview
renders the actual shader at an explicit source time; it excludes mapping,
clip effects, other layers and live modulation. The mapping preview is a
calibration mask. A complete composed-show PNG is not offered.

Media upload/download, new camera permissions, arbitrary filesystem/URL access,
physical-player playback/deployment, and complete editor automation are outside
these tools. Existing images/videos can be used once imported normally. Provider
transport and tool execution are separate from account sign-in and model access.


## Parameter motion

`map.visual.edit` accepts `shader.animation` and `shader.modulation`, keyed by an
existing numeric shader parameter. Assignments merge; a null entry clears that
parameter, while a null map clears all. Effect entries can contain `animation`
and `modulation` alongside kind/amount/enabled. Effects replace the full ordered
stack. Discover current bounds and contracts with `map.agent.docs` topic `sources`.

A curve is an array of `{id?, timeS, value, interpolation?}`. Use unique IDs/times,
0–604800 seconds, up to1000 keys, and linear/smooth/hold interpolation. Effect
values use catalog bounds. Curves set the base; modulation follows. A range is
absolute, while an amount without a range adds to the base. LFOs use scene time;
local time cycles can request `clock:"scene"`. Audio/MIDI stay zero in saved
`map.show.evaluate`, which now returns `evaluated_shader` numbers and enabled
effect amounts. Live preview consumes actual inputs when the operator enables them.

For example, a shader's Glow can fade from0.2 to2 over four source seconds with
`{"shader":{"animation":{"glow":[{"timeS":0,"value":0.2},{"timeS":4,"value":2}]}}}`.
The same curve is editable under Parameter keyframes in Simple and Advanced mode.

### Body tracking modulation

Shader numeric parameters and post-effect amounts accept `source:"body"` with
`bodySignal`: `x`, `y`, `size`, `leftHand`, `rightHand`, `spread`, `lean`, or
`presence`. `map.app.describe` supplies meanings. For example:

```json
{"shader":{"modulation":{"glow":{"source":"body","bodySignal":"leftHand","range":{"min":0.2,"max":2}}}},"effects":[{"kind":"zoom","amount":0,"modulation":{"source":"body","bodySignal":"x","range":{"min":0,"max":100}}}]}
```

Use these as `map.visual.edit` changes. Assignments are saved and undoable;
camera selection, mirroring, confidence and smoothing are device preferences.
An operator must press **Start body tracking** in the modulation controls. Agent
authoring never opens a camera. Missing/occluded/stale measurements are zero;
ranges therefore resolve to their minimum (maximum when inverted). Saved-worker
evaluation has zero body input. Local output windows consume editor measurements
without another camera. This does not transport body signals to remote edge players.

### Visual opacity and placement motion

`map.visual.edit` accepts `changes_json.motion.animation` and
`changes_json.motion.modulation` maps for `opacityPercent` (0–100),
`xPercent`/`yPercent` (−1000–1000), `widthPercent`/`heightPercent` (0.1–2000)
and `rotationDeg` (−3600–3600). These are clip properties, independent of source
shader parameters. Ordinary `opacity` is still 0–1. Inspect returns authored
`motion`; evaluate returns derived opacity and placement at the requested time.

Use the same keyframe and modulation schemas as shader/effect motion. Source
time includes trim and looping; explicit scene clocks and shared LFOs use the
active timeline clock. Child clip opacity multiplies each compound instance's
evaluated opacity once. Compound instances accept opacity motion only. Audio
and mask clips reject picture motion. Live inputs are zero in saved-worker
evaluation; saved assignments never start a camera or microphone.

Entries merge. `null` clears one channel, an entire animation/modulation map, or
all motion. Base opacity/placement edits preserve assignments; clear the relevant
motion channel to take manual control. Invalid keys, ranges or duplicate times
reject the entire command. The editor, Performance and Main timeline automation
panel share this model and Undo. Shows using visual motion write format8; use a
matching current editor/player. Older shows keep their existing version.

## Compound mapping and cube pose

`map.surface.create` accepts optional `shape: "rectangle" | "cube" | "box"`.
A cube creates three faces; a box creates five. Use a unique compound name to
keep the new folder separate. The result includes `created.surface_ids` and the
first `created.surface_id`, which is usable in program references. Inspection
returns each face's `folder` and `group_shape`; changing order/names keeps roles.

`map.cube.pose` takes `scene_id`, any member `surface_id`, and either:

- `mode: "rotate"`, with at least one nonzero `x_degrees`, `y_degrees` or
  `z_degrees` (−180 to180, applied X, then Y, then Z around the cube center).
- `mode: "inside-out"`, without angles, for the opposite room-corner faces.

The operation edits ordinary mapped corner geometry at time zero, using the
existing three-face layout to fit a projective camera. Manual calibration
residuals are retained; zero motion does not reset pins. Face IDs, visuals, masks,
curve controls and animation keys remain attached. No separate pose angles are
saved. Large turns that hide/fold faces, horizon crossings, incomplete/separated
groups, locks and conflicting welded neighbours are refused atomically. Mask
Bézier control points follow each face homography; this is not a rational-curve
conversion. Inspection/verify are numerical proof; use the live mapping preview
for rendered geometry and ordinary editor Undo for a live edit.

## MIDI controller feedback

MIDI assignments still use `source:"midi"` and `control:0..127` through the same
visual/shader/effect edits. The editor derives Launch Control XL MK1/MK2 light
feedback from those canonical assignments and its current visual selection.
Agents never start MIDI, select hardware or send raw messages. The operator must
start input and explicitly enable feedback in **MIDI controllers**. Green shows
assigned controls, amber shows selected-visual assignments, and brightness follows
the raw input level. See [MIDI setup](MIDI_CONTROLLERS.md). Saved worker evaluation
continues using zero for absent live input; hardware state is not document data.


## Source parameter motion

`map.visual.edit` accepts `source_parameters` for static numeric bases and
`source_motion` with `animation` and `modulation` maps. Inspection returns the
active `source_parameters` and authored `source_motion`; evaluation returns the
same parameter names at the requested time. Discover the catalog with
`map.agent.docs` and inspect the visual before assigning controls. Source type
and enabled source features determine available channels; unsupported channels
reject the entire edit.

- Media: `cropLeftPx`, `cropTopPx`, `cropWidthPx`, `cropHeightPx` in input pixels.
- Text: `textSizePx`, `textLineHeight`, `textLetterSpacingPx`.
- Color/gradient: `fillOpacityPercent`; linear gradients also `gradientAngleDeg`.
- Tracker: `trackerScale`.
- Drawing with replay: `drawingDurationS`.
- Enabled green screen: `keySimilarityPercent`, `keySoftnessPercent`,
  `keySpillPercent`.

For example, a text visual can use:

```json
{"source_parameters":{"textSizePx":80},"source_motion":{"animation":{"textSizePx":[{"timeS":0,"value":20},{"timeS":4,"value":100}]},"modulation":{"textLineHeight":{"source":"midi","control":17,"range":{"min":1,"max":3}}}}}
```

Bases stay in their existing source fields. Curves use clip source time,
including trim, loop and nested schedules. Shared LFO/explicit scene-clock
assignments use top-level show time. Audio/MIDI/body values are zero in saved
CLI/MCP evaluation. Crop channels evaluate together and stay within actual media
bounds; no axis can produce an empty or inverted crop. Font selection and camera
connection settings remain ordinary controls. Color and choice motion is below.

Entries merge; `null` clears one channel, a map or all source motion. Agent base
edits preserve assignments until explicitly cleared. Simple/Advanced source
controls and Performance manual takeover clear only touched channels, with
ordinary Undo. Performance's Source tab and Main's clip automation expose the
same source channels. Inactive feature assignments are retained across toggles;
they evaluate only when the feature is in use. Source replacement uses the new
source's assignments, preserving other uses of a pooled source.

Shows containing this motion require format9 and matching editor/player. Older
files retain their version unless motion is added; readers predating format9
must reject it. Saved assignments never start MIDI, microphones or cameras.

### Color and choice motion (format10)

`map.show.inspect` and evaluation return `source_parameter_specs` with each active
channel’s key, label, bounds, unit and named choice options. Use the same
`source_parameters` and `source_motion` fields as numeric source motion.

Color channels are `color:<binding>:hueDeg`, `saturationPercent`,
`brightnessPercent` and, where the renderer supports it, `alphaPercent`. Hue is
0–360 degrees; the other channels are 0–100 percent. Bindings include fill, text,
textBackground, tracker, chroma, gradient:0..15, shader:palette:0..9 and
shader:parameter:<name>. Only actually authored, recognized colors are exposed.
Map’s RGB-only generators and chroma keys offer hue/saturation/brightness; use
visual opacity for whole-visual transparency. Gradient alpha writes the existing
stop opacity and keeps its color in hex6. Color values evaluate together before
conversion, so animating hue and saturation does not lose either channel.

Choices use `choice:<name>`. Inspect options to obtain the zero-based integer
index. Keyframes must use hold interpolation (the default for choices), and
continuous modulation rounds to the nearest option index. Supported choices
include text alignment/italic, media fit, gradient type, test pattern, drawing
loop, camera mirror/flip, tracker style/hand, and shader enums/booleans. These
assignments never open a camera or select a new device.

```json
{"source_motion":{"animation":{"color:text:hueDeg":[{"timeS":0,"value":0},{"timeS":4,"value":240}],"choice:textAlign":[{"timeS":0,"value":0},{"timeS":4,"value":2}]}}}
```

These channels follow clip source time; shader colors/choices additionally honor
the shader’s reverse/loop/offset/freeze clock, matching its numeric parameters.
Shared LFOs and explicit scene clocks follow scene time. Base values stay in the original source fields. A
normal color-picker edit takes over that color’s channels; Performance’s manual
button takes over just the selected channel. Undo restores either edit. Agent
base edits preserve assignments until explicitly cleared. Disabled or currently
inactive assignments are retained. Commands reject fractional choice indices,
non-hold choice keys and out-of-range writes atomically.

Shows containing new color/choice assignments require format10; numeric-only
source motion still requires format9. Update editor and player together. Prior
readers must refuse format10. Source/build qualification does not imply that the
running installation or physical devices have been updated.

### Full visual presets (format11)

Simple and Advanced → Adjust → Presets and Performance share three appearance
slots, A/B/C. Store captures the concrete source, its controls and source motion,
effects and their motion, visual opacity/placement/motion, and Repeat/Span mapping.
It captures authored settings, so a saved curve stays editable. Recall keeps the
destination clip’s identity, name, timing, surface assignments, visibility and
layer order. “Use saved look” recalls another visual’s slot independently.
Images/videos used only by a preset remain referenced for cleanup and export.

Use `map.visual.edit` with one of these `changes_json` objects:

```json
{"preset":{"action":"store","slot":"A"}}
{"preset":{"action":"recall","slot":"A"}}
{"preset":{"action":"recall","slot":"B","from_clip_id":"another-clip-id"}}
{"preset":{"action":"clear","slot":"C"}}
{"preset":{"action":"random","seed":123}}
```

A preset action runs after other changes in that same atomic edit. Inspection
lists each populated slot as `visual` or `legacy_shader`. Random seeds must be
integers 0–4294967295; equal inputs and seeds produce equal output. Random changes
valid shader variations, aesthetic colors and effect amounts; image/camera/test
sources without these controls receive a Vintage effect. It preserves media,
device settings, timing, targets, placement and stored slots. Directly changed
controls take over their motion assignments; unrelated motion stays intact.

Store, Recall, Clear and Random are separate Undo steps in each editor mode.
Locked visuals/tracks and audio/mask/nested-timeline clips reject preset writes.
Missing media rejects recall without changing the visual. Older shader-only
slots retain their historical shader-only behavior until stored over or cleared.
Full slots never contain another preset bank. Shows with full presets require
format11 and a matching editor/worker/player; older readers must refuse them.
Creating a saved camera setting does not grant camera permission or activate a
new device connection. This source capability does not certify installed or
physical-device acceptance.

### Aligned timeline automation

Main and child timelines have an **Automation tracks** control. It shows each
animated visual/source/shader/effect channel beneath its clip track, aligned to
the same ruler, zoom and scroll area. The lines show authored base curves before
live modulation; modulated channels are labeled. Selecting a row opens that
parameter in Clip automation.

Double-click a lane to add a key. Drag a key horizontally to retime and vertically
to change its value; release commits one Undo step. Escape, pointer cancellation
and lost capture discard the preview. Arrow keys adjust time/value, Shift makes
larger steps, and Delete removes only the key. Normal timeline snapping applies;
Alt allows unsnapped pointer placement. Locked visuals/tracks reject all edits,
including a track locked during a drag.

These rows project canonical source-time keys into the currently edited timeline.
Clip start/trim, media loops/holds, nested durations and shader offset/reverse/
ping-pong/freeze are respected. Repeated markers refer to the same key: editing
one changes every occurrence. Held source time has no unique movable marker;
use the same inspector to edit the original keys. Extremely dense loops use a
bounded display with an explicit source-key editing message.

No extra lane state or document version is stored. Agent edits continue using
`motion`, `source_motion`, `shader.animation` and effect `animation` through
`map.visual.edit`. Their times remain source seconds; the UI performs the
timeline-to-source conversion for pointer/keyboard gestures. Save/reopen,
inspection/evaluation, Performance and output consume the same original keys.

### Surface automation

In Advanced Visualization, select a surface and open **Surface animation**.
Opacity, horizontal/vertical offset, horizontal/vertical scale, rotation, corner
radius and bend angle support keyframes and Time, shared LFO, audio, MIDI or body
modulation. Keys set the base before modulation. Absolute ranges replace the base;
Amount adds to it. **Use manual … control** retains the evaluated value and clears
only that property's keys/assignment. Undo restores the previous setup. Corner
radius affects rectangular outlines; bend warps Repeat visuals, while Span keeps
one shared picture across its targets. The bend axis remains a normal setting.

`map.surface.animate` takes `scene_id`, `surface_id`, and `changes_json` with
optional `bases`, `animation`, `modulation`, and `bend_axis`. Parameter keys are
`opacity`, `xPx`, `yPx`, `scaleX`, `scaleY`, `rotationDeg`, `radiusPx`, and
`bendAngleDeg`; inspect `surface_parameter_specs` for bounds/units. Maps merge;
null clears a channel or an entire animation/modulation map. Base changes retain
assignments; clear the channel explicitly for manual control. Unknown channels,
nonfinite/out-of-range values, duplicate key IDs/times, and locked surfaces fail
atomically. At most1,000 keys per property and604,800seconds are accepted.

Surface keys/time cycles follow the containing timeline clock, including nested
uses; LFO and `clock:"scene"` follow the parent scene clock. Mapping freezes
calibration at zero and ignores modulation; Visualization, preview, output and
saved evaluation use the same evaluator. Handles, picking, snapping and inverse
geometry edits carry the same live inputs; a drag retains its starting input
snapshot. Saved evaluation treats live signals as zero and never activates devices.
Surface MIDI assignments also feed the existing controller-light projection.

Surface modulation and radius/bend keys require show format12. Existing ordinary
surface keys retain their prior format. Frontend, native/local worker and Pi player
must be updated together; format11 readers refuse these files. The additive command
is available through saved CLI/MCP and the ordinary undoable live agent adapter.
