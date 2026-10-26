# Aether-Map releases

This repository owns the `map` source. Development branch: `alpha-0.1`.
Each independently staged release receives the next `alpha-0.1.N` index.
Package-manager versions and the shared UI dependency version are separate.

1. Restore exact dependencies with `python3 tools/fetch-vendor.py`.
   The default local cache is `~/Library/Caches/Aether/packages`; override it with
   `AETHER_PACKAGE_CACHE`. Unpublished dependencies must be supplied by SHA-256.
   Product source must not import another repository's source files.
2. Run `npm ci`, tests and `npm run build` from `.`.
3. Commit the qualified source locally on `alpha-0.1`. Do not include scratch
   output, secrets or another contributor's unfinished work. Staging refuses
   tracked modifications and validates repository identity and artifact paths.
4. From Studio's operator checkout run:

   ```sh
   python3 dev/rebuild/app_update.py stage --app map \
     --repo /absolute/Aether-Map --frontend /absolute/Aether-Map/dist \
     --backward-compatible
   ```

   Add `--worker /absolute/Aether-Map/service/aether_map_service/runtime/native-worker.json` for the product-packaged matching compatible worker.
   For Pi downloads, run `python3 scripts/build-device-distribution.py --output build/player` with a fresh output directory, then add `--downloads /absolute/Aether-Map/build/player/map-downloads.json`.
5. Inspect `app_update.py status`, then activate the returned release and SHA-256
   with the app's exact `--expected-current`. Staging alone never activates.
   Studio copies and verifies releases; later checkout changes cannot affect
   installed apps. Other apps and their versions remain untouched.



Current source setup is local. Installed app bytes remain unchanged.
Stable `0.1` on `master` and remote publication are later release operations.

Shared auxiliary-panel changes must use Aether UI's `SidePanelHeader`,
`PanelNotifications` and `SegmentedControl variant="panel"`. Verify Comments,
AI, Versions and Files in both appearances and while disconnected with
`e2e/panel-standard.spec.ts`; notifications must not move panel controls.
