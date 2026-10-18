# Aether Map Receiver for Android / Google TV

This product runtime receives a live Map output over WebRTC. It is a native TV
app, with a TV launcher entry and remote control navigation; it does not require
an installed WebView. A standalone Pi remains the receiver for downloaded shows,
offline playback and schedules. Both use Studio's existing pairing and cast APIs.

## Build

Install JDK 17, Android SDK platform 36 and build tools 35.0.0. Set `JAVA_HOME`
and `ANDROID_HOME` to those installations. From the Map checkout, run `npm ci`
to obtain its pinned shared artwork. Then:

```sh
cd player/android
./gradlew --no-daemon :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

The installable local test APK is `app/build/outputs/apk/debug/app-debug.apk`.
Its minimum Android version is 8 (API 26). Gradle 8.13 and Android plugin 8.13.2
are pinned; the wrapper distribution has a verified SHA256. Runtime/test
versions are locked and repository artifacts have Gradle SHA256 verification.
A clean build needs internet for the pinned Maven/Google dependencies.
The APK is signed by the local Android debug key, not a Play Store release key.
Do not publish it as a qualified release.

## Connect

1. In Map’s **Players → Set up a new one**, download the TV receiver when the
   host has the APK installed. Alternatively use the build artifact below.
   Install the APK on the TV using Android's normal APK installation flow, or
   `adb install -r app/build/outputs/apk/debug/app-debug.apk` on an explicitly
   selected development device. Launch **Aether Map Receiver** from its TV launcher.
2. Enter the Studio server's HTTPS network origin and a name for the TV. The TV
   and sending computer must reach each other on the network. Localhost points
   to the TV itself. Use a publicly trusted certificate or explicitly install
   the Studio CA in the TV's trusted certificate store; certificate checks are
   never disabled. The currently installed loopback-only Studio configuration
   cannot be used remotely until its separately qualified HTTPS LAN configuration
   is activated.
3. Scan the QR on the TV or enter its six-digit code in Map's **Players** panel.
   The shared Map pairing page handles sign-in and requires an explicit Pair action.
4. Open the intended Map output window. In **Players**, choose this TV's
   **Mirror live**, then choose that output in the browser's sharing picker.
   Keep the editor/Players view and receiver app open. Include audio in the
   sharing picker if the sending browser supports it.
5. Sound starts muted. Turn **Sound on** with the TV remote to enable received
   audio; the TV's media volume and audio focus also apply. Center reveals
   controls during playback. Back hides them; **Exit** leaves the receiver.
   **Pause receiver** releases networking/decoding; **Start receiver** resumes.
   A failed/paused session may require stopping and restarting Mirror live.

TV receiver enrollment requires Studio access schema 23 and the corresponding
server code. An older host rejects the explicit `live_receiver` kind; the app
also checks the returned kind before accepting credentials. Existing Pi records
migrate to `player`, and old Pi announcements need no change. Live receivers
cannot be assigned a saved show by either the UI, API or database constraint.
Migration is an explicit host operation, not something this APK performs.

To prepare the optional in-app installer (after building and verifying the APK):

```sh
python3 scripts/build-device-distribution.py --output build/map-tv-downloads \
  --android-apk player/android/app/build/outputs/apk/debug/app-debug.apk
```

Run that command from the Map repository root. It writes distribution schema2,
which retains the six Pi files and adds the exact APK with its size/SHA256.
The matching native host snapshots/verifies it before exposing the download;
`/api/map/ping` reports whether the artifact is available. Older schema1 bundles
remain supported and show only Pi setup. Older native hosts reject schema2.
Packaging does not install, migrate, launch or enable network access.

## Lifecycle and boundaries

The app receives video/audio only and requests only INTERNET and
ACCESS_NETWORK_STATE. No camera, microphone, external storage, background
service or wake-lock permission. The foreground Activity keeps its display on;
leaving it tears down peers, video sinks, audio focus, requests and polling.
Credentials are in private application preferences, excluded from cloud backup
and device transfer. Changing server creates a new device identity; forget the
old entry from the previous server's Players panel if no longer needed.

HTTP requests have a six-second overall deadline and refuse redirects. Signalling
loss/disconnect closes a stream after eight seconds; failure to receive a frame
closes after 25 seconds. A failed offer is not retried forever. New offers reject
stale callbacks. WebRTC uses direct network ICE candidates with no external
STUN/TURN service; networks that isolate clients or block peer traffic may prevent
connection. These are runtime policies, not measured Wi-Fi latency guarantees.

Shared Map artwork is copied at build time from the versioned `@aether/assets`
package; the product does not maintain its own copy. WebRTC, SDK wrapper and ZXing
notices ship in the APK and are available through **Licenses**. See
[THIRD_PARTY.md](THIRD_PARTY.md).

## Qualification status

Source/build candidate, 2026-10-14. JVM lifecycle/validation tests, Android lint,
APK permissions/signature/package inspection and real isolated Studio PostgreSQL
protocol tests are recorded in `../../.verification/android-tv-2026-10-14/RESULTS.md`.
No emulator/physical TV, remote focus, phone QR scan, real decoded playback/audio,
Wi-Fi reconnect, sustained frame rate or device power-cycle acceptance has been
performed. The Mac was locked during this unit. No APK was installed on a device,
no production database migration occurred, and the installed Studio host was not
restarted. This build does not establish full Lazy Lighting parity.
