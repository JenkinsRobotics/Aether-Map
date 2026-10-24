# Aether Map — Alpha 0.1

Release tag: `v0.1.0-alpha.1`. This is a developer preview.

## Shared interface

The approved Model Studio design is the default: a transparent document header,
compact app/settings/account controls, floating resizable side cards, matched
216px default side widths, a separate auxiliary tray and contextual tool trays.
Saved layout and theme preferences remain respected. The shared presentation is
implemented in Aether UI rather than copied into each product. Existing product
commands, document formats and engine ownership are retained.

All eight frontends consume Aether UI `0.2.0-alpha.145` and artwork
`0.2.0-alpha.27`. Product-specific session packages retain their existing runtime
code with compatible peer metadata. Model Studio rendering and environment
presets, shared feature-tree controls, icons and branding remain in Aether UI
and Aether Assets.

## Get the versioned packages

The large dependency archives are attached to the GitHub release. After checking
out this tag, run:

```sh
python3 tools/fetch-vendor.py
```

The script verifies every archive against `vendor-manifest.json` before installing
it in the expected local vendor path. It can be rerun without downloading verified
files. Then follow the normal repository setup instructions.

For the web frontend, run `npm ci` and `npm run build` from `the repository root`.
Use the product README for backend requirements and development commands.

The web build archive is a frontend bundle, not a desktop installer or a bundled
server. Product APIs must be provided for connected operations.

## Current limits

Surface authoring, media/timelines, effects and player integration remain product-owned. Offline video/audio export has timing and audio foundations but is not a completed compositor/encoder workflow. Physical receiver, projector and power-loss qualification is still required; no new hardware qualification is claimed by the UI rollout.

Third-party components and artwork retain their individual licenses and
attributions. This release does not change those terms.
