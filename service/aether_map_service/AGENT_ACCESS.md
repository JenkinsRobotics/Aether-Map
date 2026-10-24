# Map saved-show agent tools

Available through the platform command gateway and local MCP adapter after building
Map (`npm run build`) and installing `aether-map-service` with platform 0.2.0a2+.
Node.js must be on the server's PATH. The wheel includes the product runtime;
`npm run build:automation` regenerates it from the same source as the editor.
No internet connection, browser process or paid model is required by the worker.

| Command | Use |
| --- | --- |
| `map.show.inspect` | Saved scenes, surface geometry, tracks, timelines, assets and clips |
| `map.show.evaluate` | Main composition of a specified scene at `time_s`; geometry and audio state |
| `map.clip.move` | Existing `clip_id` to compatible `track_id` at `start_s` |
| `map.clip.edit` | Duplicate, delete, split, trim-start or trim-end; split/trim use `time_s` |

Every call requires `app: "map"` and the saved document `id`. Mutations additionally
require `expected_revision` from the last inspection's `document.revision`.
Inspect again after editing to obtain new clip IDs and the next revision. Times
are seconds in the clip's owning timeline. Unknown IDs, locked clips/tracks,
incompatible media, invalid nesting and invalid split/trim boundaries are refused.

Read-only connections may inspect/evaluate. **Edit saved documents** is a separate
opt-in in Studio Agent access. Old rename/version grants never gain this permission.
The user's file access, app entitlement, grant expiry and revocation remain enforced
by the platform before this worker sees content. The worker only returns a proposed
new document; the platform saves it through Library/History with a revision check.
Restore an earlier revision from the existing file-history controls. This is not
an open editor's Undo stack. Open editors reload to see agent changes; stale saves
are rejected by normal conflict handling.

`normalizeDocument` is the product's single editor/automation upgrade path.
Timeline changes reuse `moveTimelineClip` / `editTimelineClip`; evaluation reuses
`sceneVisuals` / `timelineAudio`. Geometry, content and target rules are not copied
into Python or the platform. Opening older supported shows applies the same
migrations as the editor; reads do not save them, edits persist the upgraded show.

Evaluation is scene-composition data, not a pixel screenshot. It evaluates Main
independently of the saved editor tab, respects scene suppression, and reports the
show's blackout flag. It does not simulate physical output schedules/crops, fetch
media, capture cameras, run shaders on a GPU, play audio, deploy or control a device.

Limits: Main saved branch only, 4 MiB document input, 8 MiB worker response, ten-second
worker timeout, 256 MiB JavaScript heap. Runtime errors do not save partial content.
The worker holds the host's existing command lock during this bounded operation;
longer rendering jobs need a separate cancellable job contract before exposure.
