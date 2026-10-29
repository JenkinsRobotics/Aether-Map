# Aether Player

The Raspberry Pi output node for [Aether Map](../aether-map/). A Pi wired to a
projector, running a show that survives a closed laptop and dead wifi.

## Install on a Pi

**The turnkey way.** In Aether Map, Show → Players → Set up a new one →
*Download projector installer*. Copy the one file to the Pi and run it:

```bash
bash aether-projector-setup.sh
sudo reboot
```

The Python player, setup wizard and live receiver are embedded. Installation
works offline if the required OS packages are already present; otherwise connect
the Pi to the internet once to install the missing packages. This is an installer
for **Raspberry Pi OS Desktop (Bookworm or newer)**, not an SD-card image.

**If the Pi is already on your network**, the older one-liner still works and
skips the wizard, taking the host address from wherever it was fetched and the
device name from the hostname. A fresh Pi does not trust Studio's local
certificate authority yet (the installer is what adds it), so fetch the authority
first, compare its fingerprint with the one Studio's network settings show, and
verify the installer against it:

```bash
curl -fsSk https://<server>:8780/api/network/ca.pem -o aether-ca.pem
openssl x509 -in aether-ca.pem -noout -fingerprint -sha256
curl -fsSL --cacert aether-ca.pem https://<server>:8780/api/map/install.sh | sudo bash
```

Either way, re-running is how a device picks up a new player version or a
changed server address — every step is idempotent.

The installer enables desktop autologin, installs labwc and XDG startup hooks,
and uses a dedicated Chromium profile. Reinstalling the downloaded bundle
preserves the existing host address and pairing.

## First boot, with no keyboard

A Pi bolted to a projector has no keyboard, so the wizard cannot be typed on
the screen it is driving. With no network of its own the player raises its own
access point instead. The projector displays the **Aether Setup** network, its unique password and
`http://192.168.4.1:8777/setup`; the operator
answers on a phone:

| Step | Asks for |
|---|---|
| Wi-Fi | The network this projector should use. Scanned live; a wrong passphrase is reported, not swallowed. |
| Host | Where Aether Studio is running. `aetherstudio.local:8780` is accepted as typed and means HTTPS. |
| Name | What this projector is called in Aether Map. |
| Device | Keep the display awake, play audio, allow player updates. |

Joining the chosen network takes the setup access point down, which drops the
phone that asked — the answer is saved first, so reconnecting to the real
network and opening the Pi’s `hostname.local:8777/setup` address shown on the
projector carries on where it left off. The wizard closes to LAN requests once
setup completes. Saved Wi-Fi profiles reconnect automatically; Ethernet works too.

Then the projector shows a six-digit pairing code. Enter it in Aether Map under
Devices to claim it.

**Setup finishing is permanent.** A configured projector that loses its network
keeps playing its last good show and waits for the router; it does not fall
back into a wizard, and it does not take its Wi-Fi down to raise an access
point nobody is looking for. A device provisioned before the wizard existed is
adopted on its next start rather than marched through setup.

The three device permissions are real settings, not a consent screen: the kiosk
reads them at launch, requesting a screen wake lock (with X11 fallback) and muting
Chromium to match. The local renderer also applies the device mute policy to
the show’s master audio, so first-run choices take effect without a reboot.
Disabling renderer updates keeps its installed bundle; the first deployment
still installs the renderer needed to play a show.

## What the installer does

1. Installs missing Python, Chromium, NetworkManager, curl and Avahi packages.
2. Puts the player and the setup wizard in `/opt/aether-player` — decoded from
   inside itself, or downloaded from the host — refusing to install either if
   it does not parse as Python.
3. Writes `/etc/aether-player/config.json` with the server URL and a device id
   derived from `/etc/machine-id`, so reinstalling does not orphan the device.
4. Registers two systemd units, enables desktop autologin, imports the graphical
   session environment on startup and authorizes the service user’s NetworkManager
   operations. Local playback starts even when the network is unavailable.

## Two units, on purpose

| Unit | Scope | Job |
|---|---|---|
| `aether-player.service` | system | Announce to the host; serve the kiosk on `127.0.0.1:8777` and the first-run wizard on the LAN. |
| `aether-kiosk.service` | user | Chromium in kiosk mode, pointed at the local show or the pairing portal. |

They are split because they have different requirements: the sync daemon needs
no display, the kiosk needs the graphical session. Letting systemd restart both
means **the player carries no supervision code of its own** — and it never
draws a pixel. Chromium renders; the daemon syncs.

```bash
journalctl -u aether-player -f        # sync daemon
journalctl --user -u aether-kiosk -f  # projector output
```

## Pairing by QR code

An unpaired player displays its six-digit code and a QR image. Scan it with a
phone on the same network. The link opens this Studio server's Map pairing page;
Studio preserves the code through sign-in. Check the code against the projector,
then select **Pair**. After success, **Open Players** opens the device controls.
Scanning alone does not claim a player or start screen sharing. If a code expires,
scan the new image or enter the replacement code in the same form.

QR generation is local and works before any show or web bundle is deployed. The
installer embeds the encoder; there is no external QR service. The image contains
only the configured server origin and the short-lived code. Device credentials
and recovery proofs remain in the daemon. Claimed players stop exposing the image,
and code rotation updates the displayed QR. See `THIRD_PARTY.md` for attribution.

The server must be reachable from the phone. A localhost, loopback or unspecified
address cannot identify another computer, so those configurations show manual-code
guidance instead of a QR link. Configure the player's server address using the
Studio installation's actual network name/origin. This does not enable a listener,
change a certificate or discover servers automatically. Android TV remains a
separate receiver deliverable; this flow currently belongs to the Pi player.

## Live mirroring

In **Show → Players**, choose **Mirror live** on a paired online device. In the
browser’s sharing picker, select the Aether Map output window/tab. Keep the
Players view open. Browser screen capture requires HTTPS or localhost; both
peers must be on the same LAN, with peer traffic allowed by the router. Audio
is included when the browser supports audio capture for the selected source.

The host relays authenticated WebRTC offers/answers, not video. The paired
player receives video/audio directly; its token never reaches browser JavaScript.
This is Aether’s receiver, not a Chromecast/AirPlay receiver. No TURN relay is
configured for internet casting across separate networks.

The saved show assignment stays intact. While live video plays, the saved
renderer unloads so its audio cannot mix with the cast. **Stop mirroring**, closing
the sender, loss of the stream, or an expired signalling lease restores the saved
renderer and its schedule. It restarts its playback clock; it does not resume the
old frame. Host connectivity failure restores local playback within about eight
seconds after the last successful receiver poll; a lost sender’s lease expires
within twenty seconds. A first-time player can mirror before a show is deployed.

The Players panel reports captured audio availability and measured video size,
frame rate, video bitrate and selected-connection network round-trip time when
the browser supplies those statistics. Network round trip is **not** end-to-end
projector latency. Bandwidth/CPU limitation hints come from the browser's reported
quality limitation. Missing statistics remain unavailable.

A short media interruption has an eight-second reconnect grace period. Sustained
signalling loss stops capture even while a request is pending. A receiver that
never starts playable video times out after 25 seconds. Stopping during the browser
picker also releases any capture that arrives late. If autoplay is blocked, the
player shows **Play live video**; it keeps the saved show running until video
actually plays. A saved-show update received during mirroring becomes the resume
target without restarting the hidden renderer. Failed offers are not replayed in
a loop; choose **Mirror live** again to establish a fresh session.

The shipped JavaScript is exercised with deterministic media/HTTP adapters in
`src/live-cast.test.ts`, `src/player-receiver.test.ts` and the actual DeviceManager
component tests. These checks do not certify browser codecs, actual Wi-Fi latency,
Android/Google TV compatibility or physical projector playback. The current
source candidate still needs that device qualification. QR pairing is implemented for the Pi player; an Android
TV companion and automatic discovery remain separate open work.

Statistics reference: [W3C WebRTC statistics](https://www.w3.org/TR/webrtc-stats/).

## The warp runs here, not on the server

The Pi holds raw media plus a `layout.json` and distorts on the fly on its own
GPU. The server never renders video. If a projector gets bumped, you reconnect a
laptop, nudge a corner and re-sync the config in seconds — no re-render, no
re-transfer of media.

## Showtime

An edge device's output can carry a schedule — a start time, an end time and
which days — and the Pi honours it from **its own clock**, with no server in
reach. It is offered for edge devices only, because a Pi is the one output you
hand a project to and walk away from. Outside
its hours the projector is dark; at the start time the show comes up. A window
whose end is before its start runs through midnight, and belongs to the day it
opened, so a Friday 22:00–02:00 show is still on at half past twelve.

The schedule travels inside the show, so it survives deployment, reboot and a
dead network like everything else. Set it in Aether Map under the output's
properties. Each opening window starts Main from zero; booting inside an open
window also starts from zero. Play once holds the last frame until the window
closes; closed hours do not consume playback.

The show's own logic runs on the Pi too: timeline cues fire as the show clock
passes them. That covers jumps and their repeat counts (loops), pause, stop and
blackout, so a show that loops a section three times and then goes dark does
exactly that with no laptop attached. GO cues need an operator and never fire on
a player. Cue conditions read MIDI controls, which a player does not have, so a
conditional cue stays off there.

Current timelines use show versions up to 12 (surface modulation and radius/bend keys, full visual presets, color/choice and numeric source motion, plus opacity/placement motion). Re-run the installer on existing
players to update their version gate; the downloaded renderer handles migration.

## One show, several projectors

Each output names the paired device it plays on. The player reads the deployed
layout, finds the output bound to its own device id, and opens the renderer on
that output. A device no output names falls back to the show's first output,
for legacy assignments. The Show workspace requires exactly one explicit output
assignment per player before deploying, avoiding ambiguous routing.

## Security note

`/api/map/install.sh`, `/api/map/aether_player.py` and the device announcement
endpoint require no Studio account: a Pi being imaged has no
account yet. Device announcements still require device-possession proof. On a plain-http host that means the one-liner pipes
unauthenticated plaintext into a shell, so run it on a network you trust, or
configure TLS on the host first (`tls_cert` in host settings) — the installer
follows whichever scheme the host is serving.

Ownership is granted by the pairing code, which expires after ten minutes and
rotates while unclaimed. Before its first request the current player persists a
random private `pairing_secret`; the host stores only its SHA-256 hash. Subsequent
announcements must prove possession with that secret or an existing paired
player’s Bearer token. A public device ID alone cannot read a code/token, reveal
an owner, rename the device or update its heartbeat. Registrations remain capped
and announcements are throttled.

Upgrade compatibility: already-paired players retain their existing tokens and
continue announcing/pulling without re-pairing. Update the player before creating
new registrations. Legacy **unpaired** rows with no private secret are refused,
not silently adopted; re-enroll the updated player with a fresh device ID. Do not
reset already-paired devices for this upgrade. This source change does not update
or re-image any installed Pi.

## Remote management

A projector is often bolted where nobody can reach it, so nothing routine
needs hands on the device.

**Player updates.** Every 10 minutes (and on an *Update* command) the player
downloads `/api/map/{aether_player,aether_setup,aether_receiver}.py` — the
same public files `install.sh` uses, over the same TLS trust — and installs
them if they differ and every file compiles. The previous files are kept in
`/opt/aether-player/.previous`. `guard.sh` runs before every start (systemd
`ExecStartPre`, never updated remotely): if the new player fails to start
three times it restores the previous one and remembers the failed version in
`.rejected` so it is not retried. A player that has run for a minute and
reached the host is confirmed. A player that could not update itself is
refused, so an older host cannot strand a device. *Update automatically* off
stops the 10-minute check; an explicit Update still works. The show, media
and Map renderer already update on every poll.

**Check-in and commands.** Each 15-second poll, a paired player posts

```json
POST /api/map/device/status   (device bearer)
{"status": {"player_version": "abc123def456", "app_release": "release-…",
            "show": {"id": "…", "revision": 4}, "uptime_s": 7200,
            "system_uptime_s": 90000, "disk_free_mb": 12000, "temperature_c": 52.4,
            "model": "Raspberry Pi 5 Model B", "os": "Debian GNU/Linux 12 (bookworm)",
            "hostname": "porch-pi", "address": "10.0.0.5", "permissions": {…},
            "last_error": "…", "update_pending": false},
 "results": [{"id": "c1", "ok": true, "detail": "identifying for 20 s"}]}
→ {"commands": [{"id": "c2", "type": "reboot", "args": {}}]}
```

The host returns commands not yet reported in `results`. Each id runs once:
it is saved as done before it runs, results are posted straight away, and
`restart`/`reboot` happen only after that report. A repeated id is
acknowledged as "already done". A host without this route is simply not
called again until the next poll; nothing else changes.

| Command | Args | Effect |
|---|---|---|
| `sync` | — | Redeploy the assigned show now, re-fetching the renderer |
| `update` | — | Install the host's player now and restart |
| `restart` | — | Restart the player service |
| `reboot` | — | Reboot the Pi (polkit rule from `install.sh`) |
| `reload` | — | Reload the projector page |
| `identify` | `seconds` 1–120 | Fill the projector with its name |
| `logs` | `lines` 1–200 | Return recent player log lines (≤ 8 KB) |
| `set_server` | `url` | Switch host, only if `url/api/map/ping` answers |
| `set_permissions` | `keep_display_awake`, `play_audio`, `allow_updates` | Save; display awake applies after reboot |
| `add_wifi` | `ssid`, `password` | Save a Wi-Fi profile without leaving the current network |

The Map Players panel expects the owner routes `POST /api/map/devices/command
{device_id, type, args} → {id}` and, on each listed device, `status` (latest
check-in or null) and `commands` (newest first: `id, type, state
pending|done, ok, detail, created`). It shows the controls only when
`status` is present.

**Finding players.** Each player advertises `_aether-player._tcp` on port
8777 with its `device_id` (`avahi-browse -rt _aether-player._tcp`).

## The sync loop

Every 15 seconds the daemon announces itself and asks what it should be
projecting. When a show is assigned it downloads, in order, the built
application, the show's media, and finally `layout.json` — the layout lands
last, so the kiosk never sees a show whose media has not arrived. Files are
written beside their target and renamed, so a half-file never reaches the
projector, and media already present is not fetched again.

The kiosk always enters the local player. Before the first deployment, that
page displays pairing/waiting state; once the app and layout exist it opens
`index.html?output=1`. The renderer polls the local layout every two seconds.
Changing the document or its revision updates the picture without restarting
Chromium. Stop removes the assignment; the next successful pull publishes a
blank layout. An unreachable host preserves the last good show instead.

Updating a device is the same pull: newer bytes in the same archive. No
re-imaging, no login on the projector.

An unchanged document revision does not trigger a new app download. Re-run the
installer to update an existing player and kiosk script to this version, or
deploy a changed saved show to fetch the current application bundle.

Pulling uses the `aether_dev_` token issued when the device was claimed.
Forgetting a device in Aether Map revokes its server credential immediately.
On the next poll, explicit 401/403/404 show-access denial clears the cached
projection and its saved assignment. Loss of Wi-Fi, server overload or a server
error keeps the last good show running offline. A disconnected player learns
about revocation when it reconnects.

## Status

Pairing, first deployment, saved updates, same-revision document replacement,
local rendering after the editor closes, and Stop are tested with the actual
Python player/HTTP handler, a temporary Studio host, and Chrome. Unit tests pin
offline retention and incomplete-download behavior. The renderer supports the
same clips and masks as the editor.

The setup wizard's step order, its nmcli command building and scan parsing, its
refusals, and the whole flow through the real player handler are tested with
the radio faked. **The nmcli conversation itself is not**: joining a network,
raising the access point, and the captive-portal redirect need a real Pi with a
real wireless card, and nothing in this repo can stand in for one.

Physical Raspberry Pi hardware, apt/systemd desktop startup, projector output,
power loss, sustained video and multi-device synchronization remain unverified.
The public-ID pairing-token leak is repaired, with regression tests for both new
pairing and existing-player compatibility. Media authorization still needs a
separate review before broader multi-user network release. See the
[release verification report](../dev/docs/reality/Map_Release_Verification_2026-09-30.md)
for remaining acceptance gates.

## Validation boundary

The setup wizard, pairing/deployment, offline reload and actual Chrome-to-Chrome
WebRTC path are exercised with the production Python handler. NetworkManager
commands are tested through a fake radio; installer scripts are syntax checked.
Physical Pi boot, Wi-Fi AP handover, HDMI audio and GPU/frame-rate capacity still
need an on-device acceptance run. Complex shaders and live decode performance
depend on Pi model and resolution.

Schedules require an accurate Pi clock. Set its time zone and let network time
synchronize before deployment; use a working RTC for accurate scheduled cold
boots during a network outage.

Platform references: [Raspberry Pi kiosk startup](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/),
[NetworkManager connection profiles](https://www.networkmanager.dev/docs/api/latest/settings-connection.html).


Native Studio migration (2026-10-12): the Rust host's pairing, owner controls,
show-authority polling and leased cast signalling pass protocol tests with this
player and the actual Map Players panel. Media and installer delivery are still
being migrated. This is not a completed native-server deployment or physical-Pi
qualification; the preserved server remains the running installation.
