# Content and Scene Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Content workspace that builds reusable compound clips on their own board, and turn the Scene workspace into assigning those clips to surface tracks.

**Architecture:**
- A clip is a `MapTimeline` carrying `board: { widthPx, heightPx }`. Its visuals render on that board and ignore surface targets, so a clip is independent of any canvas.
- A scene stays a canvas-bound timeline. It gets one video track per surface; each holds clip uses (`timelineRefID` visuals) that project the clip's board onto that surface through the r23 `hosts` path.
- Content edits a clip by making it the active timeline, so the existing tracks, keyframes and advanced timeline work on it unchanged.

**Tech Stack:** React 18 + TypeScript, `@aether/ui` (TreePanel, SegmentedControl, SelectField, NumberField, StudioToolBar), vitest + Testing Library, Playwright e2e (`e2e/host.py` serves `dist`).

**Spec:** `docs/superpowers/specs/2026-10-24-content-and-scene-workspaces-design.md`

## Global Constraints

- **Branch and commits:**
  - Work only in Aether-Map, on branch `alpha-0.1`. Commit locally; never push.
  - Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **UI copy:**
  - Workspace order is `Mapping | Content | Scene | Show`. Sidebar tabs read exactly `Media pool` and `Visuals`. The gallery section is `Project clips`.
  - The UI never says "Scene" for a canvas. Canvases are "Canvas"; assignment timelines are "Scene".
- **UI building blocks:**
  - Only the standard Aether UI: the shared TreePanel ("+" header, right-click menus, Delete/F2 through `TreeContextArea`), `SegmentedControl` with class `ps-review-conversation-tabs`, StudioToolBar ribbon commands, inspector sections, and the existing advanced timeline.
  - No new containers inside containers.
- **Keep everything that works today:**
  - multi-file import, "Add to project", fit, placement handles, render view and the backdrop toggle;
  - the surface row and its toggle, `TransportLength`, nested scenes on surfaces;
  - player cue logic (`advanceShow`) and the Show workspace.
- **Players:** Pi players render with this code (`visual-render.ts`, `timelines.ts`, `output.tsx`), so a saved document must render identically in the editor and on a player.
- **Document format:** version becomes `13`. Older files still load. A file without clips round-trips unchanged except for its version.
- **Version number:** the work ends by bumping `package.json` to `0.1.0-alpha.3` with a local tag `v0.1.0-alpha.3`.

## Review Focus

1. **Deleting a canvas must not delete clips.** A clip made while Canvas 1 was active survives Canvas 1's removal and still plays on Canvas 2. Pinned in Task 1.
2. **A clip used inside itself, directly or through another clip, must be refused, not hang.** Pinned in Task 1 (`canNestTimeline` across clips).
3. **An existing r23 project renders pixel-identical after migration:** Timeline 3 is nested in Timeline 4 and placed on two surfaces. Pinned in Task 2.
4. **Switching Content → Scene → Content returns to the same clip and the same scene timeline**, without adding undo entries. Pinned in Task 4.
5. **Clips play on a surface whose shape differs from the board.** A 1920 × 1080 clip on a tall surface uses Fill (cover) by default and doesn't stretch. Pinned in Task 3.

---

### Task 1: Clips: model, board rendering, persistence

**Files:**
- Create: `src/compound-clips.ts`, `src/compound-clips.test.ts`
- Modify:
  - `src/timelines.ts`: `MapTimeline`, `currentTimelineID`, `canNestTimeline`, `validateTimelines`, `copySceneTimelines`, `removeSceneTimelines`, `ScheduledVisual`, `scheduledVisuals`
  - `src/visual-render.ts`: `sceneVisuals`, `place`, `hosted`
  - `src/show-file.ts`: version 13; read and write `board`
  - `src/document.ts`: `version` union gains `13`; `activeClipID?: string`

**Interfaces:**
- Produces:
  - In `timelines.ts`: `interface MapTimeline { …existing; board?: { widthPx: number; heightPx: number } }`. A timeline with `board` is a clip. Its `sceneID` is the canvas it was made on, kept for information only and never used for rendering or validation.
  - `isClip(t: MapTimeline | undefined): t is MapTimeline & { board: … }`
  - `projectClips(show: MapShow): MapTimeline[]`: every clip, in document order.
  - `createClip(show: MapShow, name: string, board?: { widthPx: number; heightPx: number }): MapShow`
    - It adds the clip plus a `V1` video track and an `A1` audio track (`timelineID` = the clip id, `targets: []`).
    - The board defaults to `show.output.width × show.output.height`.
    - It sets `activeClipID` to the new id and keeps `activeTimelineID` unchanged.
  - `clipBoardRect(t: MapTimeline): [0, 0, w, h]`
  - `ScheduledVisual.board?: { widthPx: number; heightPx: number }`: set on every visual scheduled from inside a clip (the innermost clip's board).
  - In `visual-render.ts`: `clipPictures(show: MapShow, clipID: string, timeS: number, inputs?: VisualMotionInputs): ResolvedSurface[]`. It returns the clip's pictures in board space for the Content preview.

- [ ] **Step 1: Write the failing tests** in `src/compound-clips.test.ts`:
  - `test('a clip renders on its board regardless of targets')`
    - Arrange: `createClip(show, 'Card', { widthPx: 1000, heightPx: 500 })`. Make it active, then `addSimpleVisual` a colour fill.
    - Assert: `clipPictures(show, id, 0)` has length 1, with corners `[[0,0],[1000,0],[1000,500],[0,500]]`.
  - `test('a clip made on Canvas 1 plays on Canvas 2 surfaces')`
    - Arrange: nest the clip on a Canvas-2 scene track whose `targets: [{ sceneID: canvas2, surfaceID: s }]`.
    - Assert: `sceneVisuals(show, canvas2, 0)` returns one picture whose corners equal surface `s`'s corners.
  - `test('removing the canvas a clip was made on keeps the clip')`
    - Assert: `removeSceneTimelines(show, canvas1)` still has the clip, and `validateTimelines` doesn't throw.
  - `test('a clip cannot contain itself through another clip')`
    - Arrange: A contains B.
    - Assert: `canNestTimeline(show, 'A', 'B') === false` and `placeTimeline` into B's track returns the show unchanged.
  - `test('board survives save and load')`
    - Assert: `parseShow(serializeShow(show)).timelines` has the clip's `board` intact, and the version is `13`.
  - `test('documents without clips load as before')`
    - Assert: a version-12 fixture parses, and nothing but the version changes when it's re-serialized.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run src/compound-clips.test.ts`. Expected: FAIL (`createClip`/`clipPictures` not exported).
- [ ] **Step 3: Implement.**
  - **`currentTimelineID`:** returns `activeTimelineID` when it names a clip, whatever the active canvas.
  - **`canNestTimeline`:** clips are nestable from any canvas, with the same cycle walk. A non-clip child still requires `child.sceneID === show.activeSceneId`.
  - **`validateTimelines`:** skips the scene-existence check for clips. The nested check accepts any clip child; for a non-clip child it keeps the `parent.targets` scene match.
  - **`copySceneTimelines` and `removeSceneTimelines`:** they ignore clips, which belong to the project rather than a canvas.
  - **`scheduledVisuals`:** when it visits a clip, pass its board down. Results carry `board`. A nested clip inside a clip uses its own board for its children, and its use is a picture on the outer board (see `hosted` below).
  - **`place`:** when the scheduled visual has a `board`, the only target is one full-board rectangle `[[0,0],[w,0],[w,h],[0,h]]` and `visual.targets` is ignored.
  - **`hosted`:** maps from `quadCorners([0,0,board.w,board.h])` when a board is present; otherwise from the canvas rect, as today.
  - **`clipPictures`:** a thin wrapper that runs the same scheduling from the clip id with no canvas geometry. Pictures with `hosts` inside a clip are ignored.
- [ ] **Step 4: Run tests.** Run `npx vitest run src/compound-clips.test.ts src/nested-scenes.test.ts src/surface-timelines.test.ts src/show-file*.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** Run `git add -A src && git commit -m "Clips: canvas-independent compound clips on their own board"`.

### Task 2: Migration: whole-canvas timelines become clips

**Files:**
- Modify:
  - `src/compound-clips.ts`: add `migrateTimelinesToClips`
  - `src/normalize-document.ts`: append it last
- Test: `src/compound-clips.test.ts`

**Interfaces:**
- Consumes: `isClip`, `MapTimeline.board` (Task 1).
- Produces: `migrateTimelinesToClips(show: MapShow): MapShow`. It is idempotent and returns the same object when nothing changes.

**Rule (decided):**
- A non-Main timeline without `surfaceID` and without `board` becomes a clip when every visual on its tracks targets only the entire canvas (`targets.every(t => !t.surfaceID)`). Its board is its canvas's artboard (`scene.artboard ?? show.output`). That rendering is pixel-identical, because the board equals the canvas rect it already used.
- Timelines whose visuals target specific surfaces stay as scenes. They still render exactly as today, and Scene lists them.

- [ ] **Step 1: Write the failing tests.**
  - `test('an r23 nested project renders identically after migration')`
    - Fixture: Timeline 3 has one full-canvas text visual. Timeline 4 nests Timeline 3 on surfaces A and B.
    - Assert: `sceneVisuals(before, canvas, 2)` and `sceneVisuals(normalizeDocument(before), canvas, 2)` have deep-equal corners, masks, and opacity per picture.
  - `test('a timeline with surface-targeted visuals stays a scene')`
    - Assert: its `board` is undefined after normalizing.
  - `test('migration is idempotent')`
    - Assert: `normalizeDocument(normalizeDocument(x))` deep-equals `normalizeDocument(x)`.
- [ ] **Step 2: Run and confirm they fail.** Run `npx vitest run src/compound-clips.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `migrateTimelinesToClips`** and add it to `normalizeDocument` after `normalizeShowTimeline`.
- [ ] **Step 4: Run the full unit suite.** Run `npx vitest run`. Expected: all pass. Fixture expectations that list timelines may need `board` added; update them only where the assertion is about structure, never about rendered output.
- [ ] **Step 5: Commit.** Run `git commit -am "Migrate whole-canvas timelines to clips"`.

### Task 3: Assigning clips to surfaces

**Files:**
- Modify:
  - `src/compound-clips.ts`
  - `src/visual-model.ts`: `Visual.transitionS?: number`
  - `src/timelines.ts`: the crossfade in `scheduledVisuals`
  - `src/show-file.ts`: read and write `transitionS`
- Test: `src/compound-clips.test.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `isClip`, `canNestTimeline`, `placeTimeline(show, id, trackID, startS?)`
  - from `media-pool.ts`: `addVisualTrack(show, targets, name?, kind?)`
- Produces:
  - `surfaceTrack(show: MapShow, sceneTimelineID: string, surfaceID: string): VisualTrack | undefined`: the video track whose `timelineID` is `sceneTimelineID` (or no timeline id for `main`) and whose `targets` is exactly `[{ sceneID, surfaceID }]`.
  - `ensureSurfaceTracks(show: MapShow, sceneTimelineID: string): MapShow`
    - It adds one such track, named after the surface, for every non-mask, non-`sceneCanvas` surface of the timeline's canvas that has none. Order follows the surface order.
    - It never removes tracks.
  - `assignClip(show: MapShow, clipID: string, trackID: string, startS?: number): MapShow`
    - It calls `placeTimeline`, then sets the new use's `targets` to the track's targets so `hosts` resolve. Duration is the clip's `durationS`.
    - It returns the show unchanged when refused.
  - `wrapInClip(show: MapShow, source: Surface['source'], name: string, poolID?: string): { show: MapShow; clipID: string }`
    - It makes a one-visual clip; the board is the active canvas size.
    - It contains `addSimpleVisual(…)`'s visual, made while the new clip is active.
    - It then restores the previous `activeTimelineID`.
  - `clipUses(show: MapShow, clipID: string): { sceneID: string; surfaceID?: string }[]`: every surface, or whole canvas, where a use of this clip, directly or through a clip that contains it, ends up projected. Results are de-duplicated.
  - `Visual.transitionS`: a crossfade into this clip use. Opacity ramps linearly from 0 at `startS` to 1 at `startS + transitionS`. The default is `undefined`, meaning a hard cut.

- [ ] **Step 1: Write the failing tests.**
  - `test('ensureSurfaceTracks adds one track per surface, once')`
    - Assert: there are 2 surfaces, so 2 tracks; calling it again changes nothing. Names equal the surface names.
  - `test('assignClip projects the clip onto that surface only')`
    - Assert: `sceneVisuals` has one picture with surface A's corners and none on B.
  - `test('a 1920×1080 clip on a tall surface fills without stretching')`
    - Assert: the picture's `source.fit === 'cover'`.
  - `test('wrapInClip makes a one-visual clip and leaves the scene active')`
    - Assert: `projectClips(next)` has length +1, the clip has 1 visual, and `currentTimelineID(next)` is unchanged.
  - `test('clipUses lists every surface a clip lands on, through nesting')`
    - Arrange: A is on surface 1 directly. B, which contains A, is on surface 2.
    - Assert: `clipUses(show, 'A')` equals both.
  - `test('transitionS fades a clip use in')`
    - Assert: with `transitionS: 2`, picture opacity is `0.5` at `startS + 1` and `1` at `startS + 2`.
- [ ] **Step 2: Run and confirm they fail.** Run `npx vitest run src/compound-clips.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the five functions and the crossfade.** In `scheduledVisuals`, multiply the nested `opacity` by `transitionS ? clamp01((time - startS) / transitionS) : 1`.
- [ ] **Step 4: Run tests.** Run `npx vitest run src/compound-clips.test.ts src/nested-scenes.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** Run `git commit -am "Assign clips to surface tracks; crossfade into a clip"`.

### Task 4: Content workspace: mode, board preview, clip properties

**Files:**
- Modify:
  - `src/panels/map-ribbon-layout.ts`: `MapWorkspace` gains `"content"`; `MAP_WORKSPACES` gets `{ id: "content", label: "Content" }` between mapping and visualization; the Content ribbon tab gets the same tool groups as `media` (Select, Add, Edit, Preview)
  - `src/App.tsx`: `enterMode`, the center stage, `rightPanels`, `leftPanels` (the head only; the lists come in Task 5)
- Create:
  - `src/panels/ClipBoard.tsx`: the board preview
  - `src/panels/ClipProperties.tsx`
  - `src/panels/ClipBoard.test.tsx`
- Modify the tests: `src/panels/map-ribbon-layout.test.ts`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `clipPictures`, `clipBoardRect`, `createClip`, `projectClips`, `clipUses` (Tasks 1–3); `PlacementHandles` (existing); `OutputSurface` (existing).
- Produces:
  - `ClipBoard({ show, clipID, urls, timeS, playing, placement? }): JSX`. The placement prop has the same shape as ShowPreview's `placement`. Frame = `clipBoardRect`. Draws the board fitted with `contain`, plus a canvas-style label `"<name> · W × H"`.
  - `ClipProperties({ show, clip, onChange(patch: Partial<MapTimeline>), onBoardFromSurface(surfaceID) }): JSX`, with fields:
    - Name
    - Board: a `SelectField` with options `1920 × 1080`, `1280 × 720`, `1080 × 1920`, `1080 × 1080`, `3840 × 2160`, `Custom`, and `Match surface…`
    - W/H as `NumberField`s when Custom is chosen
    - Length (`TransportLength`)
    - Loop
    - "Used on N surfaces", with the list from `clipUses` as `Canvas › Surface` rows
  - `Match surface…` sets the board to the surface's `source.rect` size, rounded.
- **App behaviour (decided):**
  - Entering `content` remembers the current scene timeline in a ref (`sceneTimelineRef`). It then sets `activeTimelineID = activeClipID ?? projectClips(show)[0]?.id`. With no clips, it creates "Clip 1" through `createClip`.
  - Leaving `content` restores `activeTimelineID` from the ref.
  - Both switches go through the non-undo selection path, whichever one `openTimeline` uses today (`edit(..., key)`). If none exists, add `selectTimeline(id)` that writes without an undo entry, the way `activeSceneId` changes are handled.
  - In `content`, the timeline dock is on, the surface row is hidden, and the render-view selector is hidden.

- [ ] **Step 1: Write the failing tests.**
  - In `ClipBoard.test.tsx`: `test('draws the clip on its board with the label')`
    - Assert: `getByText('Card · 1000 × 500')`. One `.map-output-surface` exists.
  - In `ClipBoard.test.tsx`: `test('dragging a visual updates its placement')`
    - Uses `installPointerEvents`, as in `PlacementHandles.test.tsx`.
    - Assert: `onChange` is called with the `xPercent` changed.
  - In `map-ribbon-layout.test.ts`:
    - Assert: `MAP_WORKSPACES.map(w => w.label)` equals `['Mapping','Content','Scene','Show']`.
  - In `App.test.tsx`: `test('Content opens the first clip and Scene gets its timeline back')`
    - Steps: open Scene on Timeline 4 → Content shows the "Clip 1" board → Scene shows Timeline 4 again.
    - Assert: `document_.canUndo` is unchanged by the switches.
- [ ] **Step 2: Run and confirm they fail.** Run `npx vitest run src/panels/ClipBoard.test.tsx src/panels/map-ribbon-layout.test.ts src/App.test.tsx -t "Content"`. Expected: FAIL.
- [ ] **Step 3: Implement** `ClipBoard`, `ClipProperties`, the workspace entry and the App wiring above. With a clip and no visual selected, Properties shows `ClipProperties`. With a visual selected, the existing `VisualInspector` shows, with `placementFrame = clipBoardRect(clip)`.
- [ ] **Step 4: Run tests.** Run `npx vitest run src/panels src/App.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit.** Run `git commit -am "Content workspace: clip board, properties and workspace switch"`.

### Task 5: Content sidebar: Media pool | Visuals, gallery into the clip

**Files:**
- Create: `src/panels/ClipPoolTree.tsx`, `src/panels/ClipPoolTree.test.tsx`
- Modify:
  - `src/App.tsx`: Content's `layers` panel content; `chooseVisual` / `addSceneVisual` when the mode is `content`
  - `src/panels/VisualAssetsPanel.tsx`: only if it needs a `timelineID` prop to list a clip's visuals

**Interfaces:**
- Consumes: `projectClips`, `createClip`, `removeTimeline`, `timelineUses`, `clipUses`; `TreePanel`, `TreeContextArea`.
- Produces: `ClipPoolTree({ show, selectedID, onSelect(id), onCreate(), onRename(id, name), onDuplicate(id), onRemove(id), onFolder(id, folder) }): JSX`.
  - Rows: one per clip, with icon `timeline-tracks`. The detail text is `"N surfaces"` from `clipUses`, or `"unused"`.
  - Rows are grouped by `MapTimeline.folder?: string`; add that field to the type and serialize it.
  - The header has only "+" (New clip). Right-click offers New clip, New folder, Rename (F2), Duplicate, Delete (Del). Delete is disabled while `timelineUses > 0`, with a hint.
  - Rows drag with `POOL_DRAG_TYPE` = `${TIMELINE_DRAG_PREFIX}${id}`, the existing contract.
- **Decided:**
  - The Content sidebar head reuses the Scene head markup: title "Layers" plus "+", then a `SegmentedControl`. Its options are `pool` ("Media pool", icon `timeline-tracks`) and `visuals` ("Visuals", icon `palette`), stored in localStorage `aether-map.content-tab`.
  - *Visuals* is the existing `VisualAssetsPanel` (tree view) listing the active clip's visuals (`timelineVisuals(show, clipID)`). It supports reorder, rename, hide, lock and right-click.
  - "+" in the Visuals tab, the Add ribbon tools and the gallery add into the active clip. Because `activeTimelineID` is the clip, `addSimpleVisual` already does this; check that its targets are irrelevant.

- [ ] **Step 1: Write the failing tests.**
  - In `ClipPoolTree.test.tsx`:
    - `test('lists clips with where they are used')`: assert the rows `Card` with `2 surfaces` and `Spare` with `unused`.
    - `test('right-click offers New clip, New folder, Rename, Duplicate, Delete')`.
    - `test('delete is disabled for a clip in use')`.
  - In `App.test.tsx`: `test('adding a colour in Content puts it in the open clip')`
    - Assert: `timelineVisuals(show, clipID)` has length +1, and no visual is added to a scene timeline.
- [ ] **Step 2: Run and confirm they fail.** Run `npx vitest run src/panels/ClipPoolTree.test.tsx src/App.test.tsx -t "Content"`. Expected: FAIL.
- [ ] **Step 3: Implement** `ClipPoolTree` and the Content sidebar. Duplicate deep-copies the clip's tracks and visuals with new ids, the same way `copySceneTimelines` remaps.
- [ ] **Step 4: Run tests.** Run `npx vitest run src/panels src/App.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit.** Run `git commit -am "Content sidebar: Media pool and Visuals tabs"`.

### Task 6: Scene workspace: assign clips to surface tracks

**Files:**
- Modify:
  - `src/App.tsx`: the Scene `layers` panel content; the surface row click handler; the Properties branch for a selected surface in Scene
  - `src/panels/ClipTimeline.tsx`: only if dropping a `timeline:` id onto a surface track needs a hook
- Create: `src/panels/SurfacePlayback.tsx`, `src/panels/SurfacePlayback.test.tsx`
- Test: `src/App.test.tsx`, `src/App.gallery-loops.test.tsx`

**Interfaces:**
- Consumes:
  - `ensureSurfaceTracks`, `surfaceTrack`, `assignClip`, `clipUses`, `Visual.transitionS` (Task 3)
  - `ClipPoolTree` (Task 5)
- Produces: `SurfacePlayback({ show, sceneTimelineID, surface, timeS, onChange(visual), onOpenClip(clipID) }): JSX`.
  - It shows **Now playing** and **Next**: clip names on that surface's track at `timeS`, or "Nothing".
  - It shows Fit (the existing fit field on the use) and Transition (a `NumberField`, s, 0–10, writing `transitionS`).
  - Its button reads **Open clip in Content**.
- **Decided:**
  - Entering Scene runs `ensureSurfaceTracks` for the active scene timeline through the non-undo path, and again whenever a surface is added.
  - The sidebar has the same head and `SegmentedControl` as Content: Media pool | Visuals, with localStorage key `aether-map.scene-tab`.
    - *Media pool* shows `ClipPoolTree` (read-mostly: + New clip switches to Content) above the existing canvases/scenes split.
    - *Visuals* shows the selected clip's visuals: the selected use's `timelineRefID`, or the clip picked in the pool. It's read-only (`VisualAssetsPanel` with no edit callbacks), with a footer button **Edit in Content**.
  - Dropping a pool clip onto a surface track calls `assignClip`.
  - The surface row stays. With a clip selected in the pool, clicking a surface toggles its use on that surface: a use covering the scene's full length is added at 0, or removed if one is already there. With an ordinary visual selected, the r19 behaviour is unchanged.
  - Legacy scenes keep their direct visuals on their existing tracks, which render and stay editable as today. Surface tracks are added beside them.

- [ ] **Step 1: Write the failing tests.**
  - In `SurfacePlayback.test.tsx`: `test('shows now and next for the surface')`
    - Assert: Card covers 0–10 s and Snow covers 10–20 s, so at 4 s it shows Now `Card` and Next `Snow`.
  - In `SurfacePlayback.test.tsx`: `test('transition writes transitionS')`.
  - In `App.test.tsx`: `test('Scene has a track per surface')`
    - Assert: the timeline track names equal the canvas's surface names.
  - In `App.test.tsx`: `test('dropping a clip on the Wall track plays it on Wall')`
    - Assert: `sceneVisuals` has a picture on Wall only.
  - In `App.gallery-loops.test.tsx`: `test('surface row assigns the selected pool clip')`.
  - In `App.gallery-loops.test.tsx`: `test('Scene Visuals tab is read-only and offers Edit in Content')`.
- [ ] **Step 2: Run and confirm they fail.** Run `npx vitest run src/panels/SurfacePlayback.test.tsx src/App.test.tsx src/App.gallery-loops.test.tsx -t "Scene"`. Expected: FAIL.
- [ ] **Step 3: Implement** the Scene wiring and `SurfacePlayback`. Show `SurfacePlayback` in Properties when a surface is selected in Scene, above the existing surface sections.
- [ ] **Step 4: Run the full unit suite.** Run `npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit.** Run `git commit -am "Scene workspace assigns clips to surface tracks"`.

### Task 7: Quick adds in Scene become clips; gallery Project clips

**Files:**
- Modify:
  - `src/App.tsx`: `chooseVisual` / `addSceneVisual` / `addFeature` when the mode is `visualization`
  - `src/panels/VisualGallery.tsx`: the `timelines` shelf label `'Scenes'` → `'Project clips'`, listing `projectClips` with the empty text `['No clips yet','Make one in the Content workspace; it can then be added like any visual.']`
- Test: `src/App.gallery-loops.test.tsx`, `src/panels/VisualGallery.test.tsx` (create if missing)

**Interfaces:**
- Consumes: `wrapInClip`, `assignClip`, `surfaceTrack`, `projectClips`.
- **Decided:**
  - In Scene, adding a gallery item or using an Add tool calls `wrapInClip`. It then calls `assignClip` on the surface track of every selected surface, or every surface when none is selected, at the playhead.
  - Choosing a Project clip in the gallery assigns that clip the same way.
  - Content's gallery also lists Project clips, adding the clip as a nested use inside the open clip, with `canNestTimeline` guarding cycles.

- [ ] **Step 1: Write the failing tests.**
  - `test('adding an image in Scene makes a one-visual clip on the selected surface')`
    - Assert: `projectClips` has length +1 and `clipUses` equals `[{ sceneID, surfaceID: selected }]`.
  - `test('gallery lists Project clips')`
    - Assert: there's a section labelled `Project clips` containing `Card`.
  - `test('a clip cannot be added into itself from the gallery')`
    - Assert: the card is disabled or the choice is refused, and the show is unchanged.
- [ ] **Step 2: Run and confirm they fail.** Run `npx vitest run src/App.gallery-loops.test.tsx src/panels/VisualGallery.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full unit suite.** Run `npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit.** Run `git commit -am "Scene quick adds become clips; gallery Project clips"`.

### Task 8: End-to-end proof, docs, version

**Files:**
- Create: `e2e/content-workspace.spec.ts`
- Modify:
  - `e2e/workspace-navigation.spec.ts`: workspace list includes Content
  - `dev/docs/reality/STATUS.md`: an alpha.3 entry with honest limits
  - `package.json` / `package-lock.json`: `0.1.0-alpha.3`

- [ ] **Step 1: Write the e2e test.** `test('build a clip in Content and play it on two canvases')`:
  1. Open Content. Choose "+" → New clip "Card", board 1920 × 1080. Add Colour, then add Text "Merry Christmas".
  2. Open Scene on Canvas 1. Drag Card from the Media pool onto the Wall track.
  3. Switch to Canvas 2 and drag Card onto the Top face track.
  4. Assert that the scene preview shows pictures on Wall and Top face, and Card's properties in Content read "Used on 2 surfaces".
  5. Save, reload, and assert the same.
- [ ] **Step 2: Build and run it.**
  - Run `npm run build && npx playwright test e2e/content-workspace.spec.ts e2e/workspace-navigation.spec.ts`. Expected: PASS.
  - Run the full `npx vitest run`. Expected: all pass.
- [ ] **Step 3: Record the release and bump the version.**
  - Add the STATUS entry, listing what's done and these limits:
    - Legacy surface-targeted timelines stay scenes.
    - Nested hosts only apply at the outermost level.
    - The node page isn't built yet.
  - Run `npm version 0.1.0-alpha.3 --no-git-tag-version`.
- [ ] **Step 4: Commit and tag.**

  ```bash
  git add -A e2e dev/docs package.json package-lock.json
  git commit -m "Content and Scene workspaces: e2e, status, 0.1.0-alpha.3"
  git tag -a v0.1.0-alpha.3 -m "Aether Map 0.1.0-alpha.3: Content workspace builds clips; Scene assigns them to surfaces"
  ```

- [ ] **Step 5: Release.** Follow `RELEASING.md`.
  - Build the player downloads into a fresh `build/player`.
  - From `../AetherStudio`, run `app_update.py stage --app map` with `--frontend dist`, `--worker`, `--downloads` and `--backward-compatible`. The working tree must be clean.
  - Check `status`, then `activate` with the returned release ID (the next `alpha-0.1.N`, which Studio assigns), the SHA-256 and `--expected-current`.
  - Activation only replaces Map, with no restart. Never run the old whole-installation promote scripts.
