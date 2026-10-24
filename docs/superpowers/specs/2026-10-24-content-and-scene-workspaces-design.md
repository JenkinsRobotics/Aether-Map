# Content and Scene workspaces: design

Date: 2026-10-24. Product owner: Jonathan. Status: draft for approval.

## Why

Today the Scene workspace mixes two jobs, which makes it hard to tell what is what:

- making content: layering images, text and generators over time;
- deciding what plays on which surface.

The sidebar shows separate Visuals, Canvases and Scenes lists with no visible
relationship between them. "Scene 1" is used both as a canvas name and as a
timeline name. Jonathan's case was this: he made an image with text arranged
on it as its own asset, then wanted to drop it into another scene and project
it onto one surface. The pieces exist (since r23 a timeline can be nested inside another and put on
chosen surfaces), but nothing on screen leads you there.

The model is Onshape: you build parts in a part studio, then put them together
in an assembly. Here you build clips in **Content**, then say which surface
plays which clip in **Scene**.

## Words used in the UI

| Word | Meaning | In code today |
|---|---|---|
| Canvas | A projection layout with its surfaces (from Mapping) | `Scene` (`show.scenes`) |
| Surface | A projected shape on a canvas | `Surface` |
| Clip | A reusable compound clip: visuals layered over time, on its own board | `MapTimeline` + its `VisualTrack`s / `Visual`s |
| Visual | One item inside a clip: image, video, text, generator, colour, shape, camera, or another clip | `Visual` |
| Gallery | The full library opened by "+": imports, generators, presets and **Project clips** | the existing gallery |
| Media pool | The project's clips | today's "Scenes" list (timelines) |
| Scene | An assignment: what each surface plays, as a sequence over time | new use of a timeline (below) |
| Show | Scenes on canvas tracks, plus cues, which players run | `ShowProgram`, unchanged |

The builder may rename code types or keep them. What matters is that the UI never
uses "Scene" to mean a canvas.

## Goals

1. **A new Content workspace** between Mapping and Scene, for building clips with
   no surfaces involved.
   - **Board:** the canvas shows the selected clip's board. A board is a standard
     size preset (1920 × 1080 and so on) or takes the shape and aspect of a
     chosen surface, so you can design on the wall's proportions without
     assigning anything.
   - **Sidebar:** a two-tab switch, **Media pool | Visuals**, the same control
     as today's Surfaces | Visuals.
     - *Media pool* lists the project's clips: create, rename, duplicate, delete
       and folders, through the standard tree with "+" and right-click.
       Selecting a clip opens it on the board.
     - *Visuals* lists what the selected clip contains, top to bottom in
       stacking order. Drag to reorder; select one to edit its properties.
   - **"+" opens the gallery.** It adds an import, generator, preset or another
     project clip into the selected clip.
   - **Timeline:** the existing advanced timeline, scoped to the selected clip.
     It shows each visual's in/out, keyframes and loops, and the clip's length.
   - **Tools:** the standard Aether tool bar with the existing Add tools (Image,
     Video, Camera, Colour, Text, Drawing, Generator), plus Shape where the
     content model supports it.
   - **Properties:** the right panel shows fit (fill, fit, crop, stretch),
     position and size, rotation, opacity, blend and effects. It also shows
     the clip's length and loop setting, and **"Used on N surfaces"**.
   - **On-canvas placement handles:** move and resize visuals on the board, as
     the r22 handles do today.
2. **The Scene workspace becomes assign-only.**
   - **Sidebar:** the same **Media pool | Visuals** tabs. *Media pool* lists
     the clips you can assign. *Visuals* shows what the selected or assigned
     clip contains, for reference. The canvases and their surfaces are listed
     with them, as in Mapping's combined tree.
   - **Timeline:** one track per surface. You drag clips from the media pool or
     gallery onto a surface's track and line them up in a sequence. Each placed
     clip has an in point, length, loop and transition (a crossfade length).
   - **Surface properties:** selecting a surface shows what it plays now and
     next, its fit and transition, and **"Open clip in Content"**.
   - **Nothing gets built here.** Dropping a single gallery item (one image or
     generator) straight onto a surface track quietly wraps it in a
     one-visual clip in the media pool, so a quick job doesn't need a trip to
     Content.
   - **What stays:** the render-view selector (whole canvas, or one surface
     straight-on), the backdrop toggle and the surface row toggle.
3. **One clip, many places.** A clip can play on any number of surfaces on
   any number of canvases. Editing it in Content changes it everywhere it plays.
   Clips can contain other clips (r23 nesting).
4. **Gallery: Project clips.** The gallery gets a **Project clips** section
   listing the media pool's clips, the way timelines appear there today.
5. **Old projects keep working.**
   - Existing timelines become clips in the media pool.
   - Visuals applied directly to surfaces turn into clips on those surfaces'
     tracks.
   - Projects that are already deployed must look and play the same, including
     on Pi players.

## Non-goals (this round)

- The node-based effects page. It comes later as a second way to edit the same
  clip, a tab or mode of Content. Nothing here may stop a clip from getting a
  node view later.
- Changes to Mapping (canvas and surface geometry) or to Show (scene clips on
  canvas tracks, and cues).
- New effect types, new generators or new media formats.

## Anti-goals (a failure even if it works)

- Custom panels, containers inside containers, or new chrome. Use the
  standard Aether UI: the shared TreePanel ("+" header, right-click menus,
  Delete/F2), StudioToolBar, the existing segmented switch, the inspector
  panels and the advanced timeline.
- Removing things that work today and weren't part of this request:
  - multi-file import and "Add to project";
  - fit, placement handles, render view and the backdrop toggle;
  - the surface row, transport length editing, nested scenes on surfaces;
  - player cue logic.
- Losing or silently changing anything in an existing project.
- Two kinds of reusable content. A clip is the only kind.

## Decided how

- **Content builds clips; Scene assigns them.** The two workspaces share one
  media pool.
- **The clip is the timeline.** A compound clip is a `MapTimeline` with its own
  tracks and visuals. Nesting uses `timelineRefID`, as since r23.
- **Assigning reuses what r23 proved:** a track whose targets name one surface,
  holding clip references, plays that clip on that surface.
- **The gallery stays the way to add raw assets.** The media pool holds clips.

## Builder's calls (the product owner may override)

- **One scene belongs to one canvas, as timelines do today.** Its tracks are
  that canvas's surfaces, so Show keeps working unchanged: each canvas track
  holds scenes for that canvas. A clip can still play on several canvases,
  because each canvas's scene places it.
- **Clips are canvas-independent.** Visuals inside a clip have no surface
  targets; they are placed on the clip's board, which is `placement` relative
  to the board. The clip's board size is stored on the clip.
- **Fit belongs to the assignment.** A clip whose board shape differs from the
  surface it plays on uses that placement's Fit (fill by default, as scene
  visuals today), set in Scene's surface properties.
- **Scene's Visuals tab is for reference only.** Editing happens through
  "Open clip in Content", so one clip has only one place to change it.
- **The surface row stays in Scene as a shortcut.** With a clip selected,
  clicking surfaces adds the clip to (or removes it from) those surfaces'
  tracks across the scene's length.
- **Migration approach:** a normaliser at load, as with the earlier
  `normalize-document` steps. It bumps the document version, and saved files
  keep opening in older players until they are re-saved.
- **Exact names:** "Content" for the workspace and "Media pool" / "Visuals" for
  the tabs, unless the UI copy review prefers better words.
- **Order of work:**
  1. the data model and migration, with tests;
  2. Content;
  3. Scene as assign-only;
  4. the gallery Project clips section;
  5. e2e coverage.

## Constraints

- **Repo and branch:** work only in Aether-Map, on `alpha-0.1`. Commit locally;
  never push. Each installed update bumps `0.1.0-alpha.N` and gets a matching
  local tag.
- **Pi players:** they render with the same Map code (`visual-render`,
  `timelines`), so whatever the editor plays the player must play too. Cue logic
  (`advanceShow`) is unchanged.
- **Release:** go through Studio's per-app update when it's ready. AetherStudio
  is owned by another agent and isn't edited here.
- **Tests:** unit tests (vitest) for the model and migration; component tests
  for both sidebars; an e2e that builds a clip in Content and assigns it to two
  surfaces on two canvases in Scene. Run `npm run build` before e2e, since the
  e2e host serves `dist`.
