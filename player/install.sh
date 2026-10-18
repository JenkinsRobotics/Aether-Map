#!/usr/bin/env bash
#
# Aether Map — Raspberry Pi edge device provisioning.
#
# Served by the Aether Studio host at /api/map/install.sh with the server URL
# substituted in, so a Pi always provisions against the host it fetched from:
#
#   curl -sSL http://<server>:8000/api/map/install.sh | bash
#
# Safe to re-run: every step is idempotent, and re-running is how a device
# picks up a new player version or a changed server address.

set -euo pipefail

SERVER_URL="@@AETHER_SERVER_URL@@"
CONFIG_DIR="/etc/aether-player"
INSTALL_DIR="/opt/aether-player"
LOCAL_PORT="8777"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Preflight ---------------------------------------------------------------

[[ "$(id -u)" -eq 0 ]] && die "Run this as your normal user, not root. It will call sudo where it needs to."
command -v sudo >/dev/null || die "sudo is required."
command -v apt-get >/dev/null || die "This installer targets Raspberry Pi OS (Debian). Found no apt-get."

TARGET_USER="$(id -un)"
say "Provisioning this Pi as an Aether Map output device"
say "Host:   ${SERVER_URL:-asked for during setup}"
say "User:   ${TARGET_USER}"

if [[ "${SERVER_URL}" == @@* ]]; then
  # A self-contained installer carried to an offline Pi. The setup wizard asks
  # for the host address, so there is nothing to bake in and nothing to check.
  SERVER_URL=""
fi

if [[ -n "${SERVER_URL}" ]] && ! curl -sSf --max-time 10 "${SERVER_URL}/api/map/ping" >/dev/null 2>&1; then
  # Not fatal: the Pi may be provisioned before the host is reachable, and the
  # daemon retries anyway. But say so plainly rather than failing later in the
  # dark.
  printf '\033[1;33mWarning:\033[0m cannot reach %s right now. Continuing; the player retries on boot.\n' "${SERVER_URL}"
fi

# --- Dependencies ------------------------------------------------------------

# A downloaded bundle can install offline when Pi OS already supplies these.
MISSING=()
command -v python3 >/dev/null || MISSING+=(python3)
command -v curl >/dev/null || MISSING+=(curl)
command -v nmcli >/dev/null || MISSING+=(network-manager)
command -v avahi-daemon >/dev/null || MISSING+=(avahi-daemon)
CHROMIUM_PKG="chromium"
if ! command -v chromium >/dev/null && ! command -v chromium-browser >/dev/null; then
  apt-cache show chromium >/dev/null 2>&1 || CHROMIUM_PKG="chromium-browser"
  MISSING+=("${CHROMIUM_PKG}")
fi
if (( ${#MISSING[@]} )); then
  say "Installing missing packages (internet required): ${MISSING[*]}"
  sudo apt-get update -qq || die "Connect this Pi to the internet to install missing OS packages, then run this installer again."
  sudo apt-get install -y -qq "${MISSING[@]}"
fi
command -v raspi-config >/dev/null || die "Use Raspberry Pi OS Desktop (Bookworm or newer)."
[[ -d /usr/share/xsessions || -d /usr/share/wayland-sessions ]] || die "The Desktop edition is required for projector rendering."

CHROMIUM_BIN="$(command -v chromium || command -v chromium-browser || true)"
[[ -n "${CHROMIUM_BIN}" ]] || die "Chromium did not install. Check 'apt-get install ${CHROMIUM_PKG}'."

# --- Player -----------------------------------------------------------------

say "Installing the player into ${INSTALL_DIR}"
sudo mkdir -p "${INSTALL_DIR}" "${CONFIG_DIR}" "${INSTALL_DIR}/show"
sudo chown -R "${TARGET_USER}" "${INSTALL_DIR}"

# Two ways in, because a Pi out of the box has no network yet.
#
#   Piped from the host  — fetch the modules over http, as before.
#   Downloaded installer — the host stamped them into this file. The whole
#                          point of that build is a Pi that cannot reach
#                          anything: copy one file across on a USB stick and
#                          run it, and the wizard sorts out Wi-Fi afterwards.
install_module() {
  local name="$1" embedded="$2"
  if [[ -n "${embedded}" ]]; then
    printf '%s' "${embedded}" | base64 -d > "${INSTALL_DIR}/${name}"
  else
    curl -sSfL "${SERVER_URL}/api/map/${name}" -o "${INSTALL_DIR}/${name}"
  fi
  python3 -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "${INSTALL_DIR}/${name}" \
    || die "${name} is not valid Python. Refusing to install it."
}

install_module aether_player.py "${AETHER_PLAYER_B64:-}"
install_module aether_setup.py "${AETHER_SETUP_B64:-}"
install_module aether_receiver.py "${AETHER_RECEIVER_B64:-}"

# A stable identity that survives reinstalls, so re-running does not orphan the
# device in the host's list.
DEVICE_ID="$(sudo cat /etc/machine-id 2>/dev/null | cut -c1-16)"
[[ -n "${DEVICE_ID}" ]] || DEVICE_ID="$(hostname)-$(date +%s)"

if [[ ! -f "${CONFIG_DIR}/config.json" ]]; then
  say "Writing ${CONFIG_DIR}/config.json"
  # A piped install already knows the host and takes the hostname as the
  # device name, so there is nothing left to ask and setup is complete. The
  # downloadable installer knows neither, and leaves both for the wizard.
  if [[ -n "${SERVER_URL}" ]]; then
    SETUP_COMPLETE=true
    DEVICE_NAME="$(hostname)"
  else
    SETUP_COMPLETE=false
    DEVICE_NAME=""
  fi
  sudo tee "${CONFIG_DIR}/config.json" >/dev/null <<JSON
{
  "server_url": "${SERVER_URL}",
  "device_id": "${DEVICE_ID}",
  "name": "${DEVICE_NAME}",
  "show_dir": "${INSTALL_DIR}/show",
  "port": ${LOCAL_PORT},
  "setup_complete": ${SETUP_COMPLETE}
}
JSON
else
  say "Keeping existing config; updating server URL only"
  sudo python3 - "${CONFIG_DIR}/config.json" "${SERVER_URL}" <<'PY'
import json, sys
path, url = sys.argv[1], sys.argv[2]
config = json.load(open(path))
if url:
    config["server_url"] = url
json.dump(config, open(path, "w"), indent=2)
PY
fi
sudo chown "${TARGET_USER}" "${CONFIG_DIR}/config.json"
sudo chmod 600 "${CONFIG_DIR}/config.json"
sudo chown "${TARGET_USER}" "${CONFIG_DIR}"
sudo chmod 700 "${CONFIG_DIR}"

# --- Services ----------------------------------------------------------------
#
# Two units, because they have different requirements. The sync daemon needs no
# display; the kiosk needs the graphical session. Letting systemd restart both
# means the player itself carries no supervision code.

say "Registering the sync daemon (system service)"
sudo tee /etc/systemd/system/aether-player.service >/dev/null <<UNIT
[Unit]
Description=Aether Map player — show sync and local media server
After=NetworkManager.service
Wants=NetworkManager.service

[Service]
Type=simple
User=${TARGET_USER}
ExecStart=/usr/bin/python3 ${INSTALL_DIR}/aether_player.py --config ${CONFIG_DIR}/config.json
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

say "Registering the kiosk (user service)"
mkdir -p "${HOME}/.config/systemd/user"
cat > "${HOME}/.config/systemd/user/aether-kiosk.service" <<UNIT
[Unit]
Description=Aether Map kiosk — fullscreen projector output
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/kiosk.sh
Restart=always
RestartSec=3

[Install]
WantedBy=graphical-session.target
UNIT

cat > "${INSTALL_DIR}/kiosk.sh" <<KIOSK
#!/usr/bin/env bash
# The local player handles setup and pairing, and enters output mode once a
# show is deployed.
set -euo pipefail
URL="http://127.0.0.1:${LOCAL_PORT}/"
CONFIG="${CONFIG_DIR}/config.json"

# The device permissions chosen in the setup wizard, applied where they
# actually take effect. Read at launch, so changing them and restarting the
# kiosk is enough; there is no second place they are configured.
permission() {
  python3 - "\${CONFIG}" "\$1" <<'PY' 2>/dev/null || echo 1
import json, sys
try:
    print(1 if json.load(open(sys.argv[1])).get("permissions", {}).get(sys.argv[2], True) else 0)
except Exception:
    print(1)
PY
}

EXTRA=()
if [[ "\$(permission keep_display_awake)" == "1" ]]; then
  # A projector that blanks mid-show is a support call.
  xset s off -dpms s noblank 2>/dev/null || true
fi
if [[ "\$(permission play_audio)" != "1" ]]; then
  EXTRA+=(--mute-audio)
fi

# Starting before the daemon should not strand Chromium on an error page.
until curl -fsS "\${URL}player-status" >/dev/null; do sleep 1; done
exec "${CHROMIUM_BIN}" \\
  --kiosk "\${URL}" \\
  "\${EXTRA[@]}" \\
  --user-data-dir="${INSTALL_DIR}/chromium-profile" \\
  --no-first-run \\
  --noerrdialogs \\
  --disable-infobars \\
  --disable-session-crashed-bubble \\
  --check-for-update-interval=31536000 \\
  --autoplay-policy=no-user-gesture-required \\
  --start-fullscreen
KIOSK
chmod +x "${INSTALL_DIR}/kiosk.sh"

# NetworkManager authorizes a system-service user explicitly; no root browser.
sudo mkdir -p /etc/polkit-1/rules.d
sudo tee /etc/polkit-1/rules.d/49-aether-network.rules >/dev/null <<POLKIT
polkit.addRule(function(action, subject) {
  var allowed = ["org.freedesktop.NetworkManager.network-control",
    "org.freedesktop.NetworkManager.wifi.scan",
    "org.freedesktop.NetworkManager.settings.modify.system",
    "org.freedesktop.NetworkManager.wifi.share.protected",
    "org.freedesktop.NetworkManager.enable-disable-wifi"];
  if (subject.user == "${TARGET_USER}" && allowed.indexOf(action.id) >= 0)
    return polkit.Result.YES;
});
POLKIT

# Start from the graphical session, importing its Wayland/X11 environment.
cat > "${INSTALL_DIR}/start-kiosk.sh" <<'START'
#!/usr/bin/env bash
systemctl --user import-environment DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_RUNTIME_DIR XDG_SESSION_TYPE || true
systemctl --user start aether-kiosk.service
START
chmod +x "${INSTALL_DIR}/start-kiosk.sh"
mkdir -p "${HOME}/.config/labwc" "${HOME}/.config/autostart"
if [[ ! -f "${HOME}/.config/labwc/autostart" && -f /etc/xdg/labwc/autostart ]]; then
  cp /etc/xdg/labwc/autostart "${HOME}/.config/labwc/autostart"
fi
# Append once, preserving all existing desktop customization.
if ! grep -qF "${INSTALL_DIR}/start-kiosk.sh" "${HOME}/.config/labwc/autostart" 2>/dev/null; then
  printf '\n%s &\n' "${INSTALL_DIR}/start-kiosk.sh" >> "${HOME}/.config/labwc/autostart"
fi
cat > "${HOME}/.config/autostart/aether-kiosk.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Aether Map Player
Exec=${INSTALL_DIR}/start-kiosk.sh
X-GNOME-Autostart-enabled=true
DESKTOP
say "Enabling desktop autologin for unattended playback"
sudo raspi-config nonint do_boot_behaviour B4
sudo systemctl enable --now NetworkManager avahi-daemon

sudo systemctl daemon-reload
sudo systemctl enable --now aether-player.service
systemctl --user daemon-reload
systemctl --user enable aether-kiosk.service
# The graphical autostart hook starts Chromium after desktop autologin.
sudo loginctl enable-linger "${TARGET_USER}" || true

# --- Done --------------------------------------------------------------------

cat <<DONE

$(say "Done")

  Device id   ${DEVICE_ID}
  Config      ${CONFIG_DIR}/config.json
  Player log  journalctl -u aether-player -f
  Kiosk log   journalctl --user -u aether-kiosk -f

On the next boot the projector either shows a pairing code to enter in Aether
Map under Devices, or — if it has no network and no host yet — puts up its own
Wi-Fi network and tells you what to join to finish setup from a phone.

  sudo reboot

Desktop autologin is enabled. Wi-Fi profiles reconnect automatically.
Schedules use this Pi's local clock: set its time zone in Raspberry Pi settings.
DONE
