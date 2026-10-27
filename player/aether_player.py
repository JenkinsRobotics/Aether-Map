#!/usr/bin/env python3
"""Aether Map player — the output device's sync agent.

This process never draws a pixel. Chromium renders the show; systemd keeps both
alive. The player announces the device, pulls whatever show it has been
assigned, and serves it to the browser beside it on localhost.

Standard library only: a device should need nothing but python3.
"""

from __future__ import annotations

import argparse
import base64
import collections
import hashlib
import io
import ipaddress
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import zipfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

POLL_INTERVAL_SECONDS = 15
TIMEOUT_SECONDS = 30
CONFIG_LOCK = threading.RLock()

# Remote management. A projector is often bolted somewhere nobody can reach, so
# everything a person would otherwise do at the device — update the player,
# restart, reboot, resync, change Wi-Fi or the host — arrives over the network.
PLAYER_FILES = ("aether_player.py", "aether_setup.py", "aether_receiver.py")
INSTALL_DIR = Path(__file__).resolve().parent
UPDATE_INTERVAL_SECONDS = 600
# A new player is trusted once it has run this long and reached the host;
# until then install.sh's guard rolls it back if it keeps failing to start.
CONFIRM_AFTER_SECONDS = 60
STARTED = time.monotonic()
RECENT_LOG: collections.deque = collections.deque(maxlen=200)
WAKE = threading.Event()


# Which show-file versions this player will deploy. The renderer that actually
# draws them is the deployed app bundle, and its parser (aether-map's
# show-file.ts) migrates older files forward — so this is a sanity gate, not the
# authority, and it must not be narrower than that parser accepts. It went stale
# once: the document format moved to 3 and this list still said (1, 2), which
# made every current show fail to deploy with "unsupported layout". The test
# suite now reads show-file.ts and fails if the two disagree.
SUPPORTED_LAYOUT_VERSIONS = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13)


try:
    import aether_receiver
    import aether_setup
except ImportError:  # pragma: no cover - only on an install that predates setup
    aether_setup = None


def log(message: str) -> None:
    """Diagnostics on stderr, unbuffered so `journalctl -f` is live.

    journald captures both streams, so nothing is lost by keeping stdout
    clean — and something is gained: a caller that reads this process's
    stdout for a value is not handed a log line instead.
    """
    RECENT_LOG.append(time.strftime("%Y-%m-%d %H:%M:%S ") + message)
    print(f"[aether-player] {message}", file=sys.stderr, flush=True)


def load_config(path: Path) -> dict:
    config = json.loads(path.read_text())
    # `server_url` is no longer required: a device installed from the
    # downloadable installer has never seen a host, and the setup wizard is
    # what asks for one.
    for key in ("device_id", "show_dir", "port"):
        if key not in config:
            raise SystemExit(f"{path}: missing required key {key!r}")
    config["server_url"] = str(config.get("server_url", "")).rstrip("/")
    config["_path"] = str(path)
    # A device provisioned before the wizard existed is already configured;
    # adopt it rather than marching it through setup on its next restart.
    if not config.get("setup_password"):
        config["setup_password"] = secrets.token_hex(6)
        save_config(config)
    if aether_setup and aether_setup.adopt(config):
        log("adopting an already-provisioned device; setup not required")
        save_config(config)
    return config


def save_config(config: dict) -> None:
    path = Path(config["_path"])
    stored = {k: v for k, v in config.items() if not k.startswith("_")}
    with CONFIG_LOCK:
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as staging:
            json.dump(stored, staging, indent=2)
        Path(staging.name).replace(path)


def request(config: dict, path: str, *, data: bytes | None = None, timeout: int = TIMEOUT_SECONDS,
            auth: bool = True, quiet: bool = False) -> bytes | None:
    # Until setup names a host there is nothing to call. A device out of the
    # box now boots into the wizard, so this is the normal early state, not a
    # broken install.
    if not config.get("server_url"):
        return None
    headers = {}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if auth and config.get("token"):
        headers["Authorization"] = "Bearer " + config["token"]
    call = urllib.request.Request(
        config["server_url"] + path,
        data=data,
        headers=headers,
        method="POST" if data is not None else "GET",
    )
    try:
        with urllib.request.urlopen(call, timeout=timeout) as reply:
            return reply.read()
    except urllib.error.HTTPError as error:
        # A deliberate refusal is different from an unavailable host. Never keep
        # showing a cached deployment after the host revokes its device/account.
        if path == "/api/map/device/show" and error.code in (401, 403, 404):
            log("show access revoked — stopping cached playback")
            return b'{"show":null}'
        if not quiet:
            log(f"{path} failed ({error})")
        return None
    except (urllib.error.URLError, OSError) as error:
        if not quiet:
            log(f"{path} failed ({error})")
        return None


def announce(config: dict) -> None:
    """Say hello, and collect the device token once someone has claimed us."""
    # Persist before any network request so retries/restarts prove the same
    # device, even if the host's initial response is lost.
    if not config.get("pairing_secret"):
        config["pairing_secret"] = secrets.token_urlsafe(32)
        save_config(config)
    body = json.dumps(
        {"device_id": config["device_id"], "name": config.get("name", config["device_id"]),
         "pairing_secret": config["pairing_secret"]}
    ).encode()
    raw = request(config, "/api/map/devices/announce", data=body)
    if raw is None:
        return
    try:
        reply = json.loads(raw)
    except ValueError:
        return
    config["_pairing"] = {"claimed": bool(reply.get("claimed")), "code": reply.get("code", "")}
    config["_contact"] = time.monotonic()
    if reply.get("claimed"):
        if reply.get("token") and reply["token"] != config.get("token"):
            config["token"] = reply["token"]
            save_config(config)
            log("claimed — device token stored")
    else:
        log(f"waiting to be claimed — pairing code {reply.get('code', '?')}")


def pull_show(config: dict) -> None:
    """Fetch the assigned show, its media and the app, and write them to disk.

    Everything lands locally so the device keeps running with the network gone.
    """
    if not config.get("token"):
        return
    raw = request(config, "/api/map/device/show")
    if raw is None:
        return
    try:
        payload = json.loads(raw)
    except ValueError:
        return

    root = Path(config["show_dir"])
    show_dir = deployed_directory(root)
    show = payload.get("show")
    if show is None:
        # An acknowledged Stop replaces the projection with black. A network
        # failure above deliberately keeps the last good show running offline.
        if config.get("document") or (show_dir / "layout.json").is_file():
            # Version 2 on purpose: the legacy single-output shape, which the
            # renderer's parser migrates. A blank scene is all this needs to say.
            write_layout(show_dir, {
                "version": 2, "output": {"width": 1920, "height": 1080},
                "media": [], "scenes": [{"id": "stopped", "name": "Stopped",
                    "durationS": 1, "surfaces": []}],
                "activeSceneId": "stopped", "playback": {"mode": "once"},
            })
            config.pop("document", None)
            config.pop("revision", None)
            save_config(config)
        return
    if not isinstance(show, dict):
        return
    if (show.get("id") == config.get("document")
            and show.get("revision") == config.get("revision")
            and (show_dir / "layout.json").is_file()):
        return
    try:
        layout = json.loads(base64.b64decode(show["layout_base64"]))
        if not isinstance(layout, dict) or layout.get("version") not in SUPPORTED_LAYOUT_VERSIONS:
            raise ValueError("unsupported layout")
    except (ValueError, KeyError, TypeError) as error:
        log(f"invalid layout ({error})")
        return
    log(f"deploying {show.get('name')} revision {show.get('revision')}")
    releases = root / ".releases"
    staging = None
    published = False
    pointer = root / ".current.part"
    try:
        releases.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix="release-", dir=releases))
        # Retain old hashed assets for a renderer still finishing a request.
        # Media is immutable by stored filename; hard links avoid copying video.
        def copy_cached(source, target):
            if Path(source).relative_to(show_dir).parts[0] == "media":
                try:
                    os.link(source, target)
                    return target
                except OSError:
                    pass
            return shutil.copy2(source, target)

        if show_dir.is_dir():
            shutil.copytree(show_dir, staging, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns(".releases", ".current", ".current.part"),
                            copy_function=copy_cached)
        update_renderer = config.get("permissions", {}).get("allow_updates", True)
        if (update_renderer or not (staging / "index.html").is_file()) and not fetch_app(config, staging):
            return
        for media in layout.get("media", []):
            if not fetch_media(config, staging, media.get("file", "")):
                return
        write_layout(staging, layout)
        # One same-filesystem rename publishes all bytes, after every download.
        pointer.unlink(missing_ok=True)
        pointer.symlink_to(staging.relative_to(root), target_is_directory=True)
        pointer.replace(root / ".current")
        published = True
        config["document"] = show.get("id")
        config["revision"] = show.get("revision")
        save_config(config)
        log(f"deployed {show.get('name')}")
        # Keep the previous generation for already-open HTTP requests. Only
        # directories created by this publisher are eligible for cleanup.
        for old in releases.glob("release-*"):
            if old not in (staging, show_dir) and old.is_dir() and not old.is_symlink():
                shutil.rmtree(old)
    except OSError as error:
        log(f"deployment failed ({error})")
    finally:
        if staging is not None and not published:
            try:
                pointer.unlink(missing_ok=True)
            except OSError:
                pass
            shutil.rmtree(staging, ignore_errors=True)


def deployed_directory(root: Path) -> Path:
    """Resolve a complete release; legacy installations keep their old layout."""
    pointer = root / ".current"
    if pointer.is_symlink():
        target = pointer.resolve()
        if target.parent == (root / ".releases").resolve() and target.is_dir():
            return target
    return root


def write_layout(show_dir: Path, layout: dict) -> None:
    """The renderer polls this file; it must never read a partial deployment."""
    show_dir.mkdir(parents=True, exist_ok=True)
    target = show_dir / "layout.json"
    staging = show_dir / "layout.json.part"
    staging.write_text(json.dumps(layout, indent=2))
    staging.replace(target)


def fetch_app(config: dict, show_dir: Path) -> bool:
    raw = request(config, "/api/map/app.zip")
    if raw is None:
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            if "index.html" not in archive.namelist():
                log("app bundle has no index.html")
                return False
            for name in archive.namelist():
                # These belong to deployment, not the frontend archive. In
                # particular, never overwrite a hard-linked cached media file.
                parts = Path(name).parts
                if not parts or parts[0] in ("media", "layout.json") or any(part.startswith(".") for part in parts):
                    log(f"refused reserved archive entry {name!r}")
                    return False
                # Never trust an archive path: keep every entry inside show_dir.
                target = (show_dir / name).resolve()
                if not target.is_relative_to(show_dir.resolve()):
                    log(f"refused archive entry {name!r}")
                    return False
            archive.extractall(show_dir)
    except (zipfile.BadZipFile, OSError) as error:
        log(f"app bundle failed ({error})")
        return False
    return True


def fetch_media(config: dict, show_dir: Path, name: str) -> bool:
    if not name or "/" in name or name.startswith("."):
        log(f"refused media name {name!r}")
        return False
    target = show_dir / "media" / name
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file():
        return True
    raw = request(config, "/api/map/media/" + name)
    if raw is None:
        return False
    # Write beside and rename: a half-file must never reach the projector.
    staging = target.with_name(target.name + ".part")
    staging.write_bytes(raw)
    staging.replace(target)
    return True


def sync_forever(config: dict, stop: threading.Event, network=None) -> None:
    next_update = time.monotonic() + CONFIRM_AFTER_SECONDS
    while not stop.is_set():
        offer_setup_network(config, network)
        announce(config)
        pull_show(config)
        check_in(config)
        confirm_update(config)
        if time.monotonic() >= next_update:
            next_update = time.monotonic() + UPDATE_INTERVAL_SECONDS
            if update_player(config):
                restart_player()
        WAKE.wait(POLL_INTERVAL_SECONDS)
        WAKE.clear()


# --- Player self-update ------------------------------------------------------

def _read(path: Path) -> bytes:
    try:
        return path.read_bytes()
    except OSError:
        return b""


def player_version(directory: Path | None = None) -> str:
    """A short fingerprint of the installed player, the same on every device."""
    digest = hashlib.sha256()
    for name in PLAYER_FILES:
        digest.update(name.encode() + b"\0" + _read(Path(directory or INSTALL_DIR) / name) + b"\0")
    return digest.hexdigest()[:12]


def update_player(config: dict, directory: Path | None = None, force: bool = False) -> bool:
    """Install the player the host serves, if it differs. True means restart now.

    The host's copies are the same public downloads install.sh fetches, over the
    same TLS trust. Every file must compile before any is replaced; the old ones
    are kept for install.sh's guard, which restores them if the new player keeps
    failing to start and remembers that version so it is not tried again.
    """
    directory = Path(directory or INSTALL_DIR)
    if not force and config.get("permissions", {}).get("allow_updates", True) is False:
        return False
    fresh = {}
    for name in PLAYER_FILES:
        raw = request(config, "/api/map/" + name, auth=False, quiet=True)
        if not raw or len(raw) > 1024 * 1024:
            return False
        try:
            compile(raw, name, "exec")
        except (SyntaxError, ValueError):
            log(f"refused player update: {name} is not valid Python")
            return False
        fresh[name] = raw
    if b"def main(" not in fresh["aether_player.py"]:
        log("refused player update: aether_player.py has no entry point")
        return False
    if b"def update_player(" not in fresh["aether_player.py"]:
        # An older host's player cannot update itself, so installing it would
        # leave this device unreachable for updates for good.
        log("refused player update: it cannot update itself remotely")
        return False
    current = {name: _read(directory / name) for name in PLAYER_FILES}
    if fresh == current or fresh == {name: _read(directory / ".rejected" / name) for name in PLAYER_FILES}:
        return False
    old = player_version(directory)
    try:
        previous = directory / ".previous"
        previous.mkdir(exist_ok=True)
        for name, raw in current.items():
            if raw:
                (previous / name).write_bytes(raw)
        for name, raw in fresh.items():
            (directory / (name + ".part")).write_bytes(raw)
        (directory / ".update-pending").write_text("0")
        for name in fresh:
            (directory / (name + ".part")).replace(directory / name)
    except OSError as error:
        log(f"player update failed ({error})")
        return False
    log(f"player updated {old} → {player_version(directory)}; restarting")
    return True


def confirm_update(config: dict, directory: Path | None = None) -> None:
    marker = Path(directory or INSTALL_DIR) / ".update-pending"
    if (marker.exists() and time.monotonic() - STARTED >= CONFIRM_AFTER_SECONDS
            and config.get("_contact", 0) > STARTED):
        marker.unlink(missing_ok=True)
        log(f"player {player_version(directory)} confirmed")


def restart_player() -> None:
    """systemd restarts the service whenever it exits."""
    log("restarting player")
    os._exit(0)


def reboot_device() -> None:
    log("rebooting")
    try:
        subprocess.run(["systemctl", "reboot"], check=True, timeout=30, capture_output=True)
    except (OSError, subprocess.SubprocessError) as error:
        log(f"reboot failed ({error})")


# --- Check-in and commands ---------------------------------------------------

def _text(path: str) -> str:
    try:
        return Path(path).read_text().strip("\0\n ")
    except OSError:
        return ""


def local_address(config: dict) -> str:
    """The address this device uses to reach the host (no packet is sent)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect((urlsplit(config.get("server_url", "")).hostname or "192.0.2.1", 9))
            return probe.getsockname()[0]
    except (OSError, ValueError):
        return ""


def device_status(config: dict) -> dict:
    root = Path(config["show_dir"])
    release = deployed_directory(root)
    try:
        free = shutil.disk_usage(root if root.exists() else "/").free // (1024 * 1024)
    except OSError:
        free = None
    try:
        temperature = round(int(_text("/sys/class/thermal/thermal_zone0/temp")) / 1000, 1)
    except ValueError:
        temperature = None
    try:
        system_uptime = int(float(_text("/proc/uptime").split()[0]))
    except (ValueError, IndexError):
        system_uptime = None
    os_name = next((line.split("=", 1)[1].strip('"') for line in _text("/etc/os-release").splitlines()
                    if line.startswith("PRETTY_NAME=")), "")
    problems = ("failed", "refused", "invalid")
    return {
        "player_version": player_version(),
        "app_release": release.name if release != root else "",
        "show": {"id": config.get("document"), "revision": config.get("revision")},
        "uptime_s": int(time.monotonic() - STARTED),
        "system_uptime_s": system_uptime,
        "disk_free_mb": free,
        "temperature_c": temperature,
        "model": _text("/proc/device-tree/model"),
        "os": os_name,
        "hostname": socket.gethostname(),
        "address": local_address(config),
        "permissions": config.get("permissions") or {},
        "last_error": next((line for line in reversed(RECENT_LOG) if any(word in line for word in problems)), ""),
        "update_pending": (INSTALL_DIR / ".update-pending").exists(),
    }


def player_flags(config: dict) -> dict:
    """What remote commands ask of the screen, read by the start page."""
    return {"identify": time.time() < config.get("_identify_until", 0),
            "reload": config.get("_reload", 0), "name": config.get("name", "")}


def reachable(url: str) -> bool:
    try:
        with urllib.request.urlopen(url + "/api/map/ping", timeout=10) as reply:
            return reply.status == 200
    except (urllib.error.URLError, OSError, ValueError):
        return False


def run_command(config: dict, kind: str, args: dict) -> tuple[bool, str, object]:
    """Carry out one command. Returns (ok, detail, what to do after reporting)."""
    if kind == "sync":
        config.pop("revision", None)
        WAKE.set()
        return True, "syncing now", None
    if kind == "update":
        if update_player(config, force=True):
            return True, f"updated to {player_version()}; restarting", restart_player
        return True, f"already running the host's player ({player_version()})", None
    if kind == "restart":
        return True, "restarting player", restart_player
    if kind == "reboot":
        return True, "rebooting", reboot_device
    if kind == "reload":
        config["_reload"] = config.get("_reload", 0) + 1
        return True, "reloading the display", None
    if kind == "identify":
        seconds = max(1, min(120, int(args.get("seconds", 20)) if str(args.get("seconds", 20)).isdigit() else 20))
        config["_identify_until"] = time.time() + seconds
        return True, f"identifying for {seconds} s", None
    if kind == "logs":
        lines = max(1, min(200, int(args.get("lines", 100)) if str(args.get("lines", 100)).isdigit() else 100))
        return True, "\n".join(list(RECENT_LOG)[-lines:])[-8000:], None
    if kind == "set_server":
        url = aether_setup.valid_server_url(str(args.get("url", ""))) if aether_setup else None
        if not url:
            return False, "not a valid host address", None
        if not reachable(url):
            return False, f"could not reach {url}; keeping {config.get('server_url')}", None
        config["server_url"] = url
        save_config(config)
        return True, f"now using {url}", None
    if kind == "set_permissions":
        known = aether_setup.PERMISSIONS if aether_setup else {}
        merged = {**known, **(config.get("permissions") or {})}
        merged.update({key: value for key, value in args.items() if key in known and isinstance(value, bool)})
        config["permissions"] = merged
        config["_reload"] = config.get("_reload", 0) + 1
        save_config(config)
        return True, "permissions saved; display awake applies after the next reboot", None
    if kind == "add_wifi":
        ssid, password = str(args.get("ssid", "")), str(args.get("password", ""))
        if not 0 < len(ssid.encode()) <= 32 or (password and not 8 <= len(password) <= 63):
            return False, "a network name and an 8 to 63 character password are required", None
        # Saved, not joined: switching networks remotely would cut this device off
        # if the details were wrong. It connects whenever this network is in range
        # and the current one is not.
        command = ["nmcli", "connection", "add", "type", "wifi", "con-name", "aether-" + ssid[:24],
                   "ssid", ssid, "connection.autoconnect", "yes"]
        if password:
            command += ["wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        except (OSError, subprocess.SubprocessError) as error:
            return False, f"could not save the network ({error})", None
        if result.returncode != 0:
            return False, (result.stderr or result.stdout or "nmcli failed").strip()[:500], None
        return True, f"saved {ssid}; used when it is in range", None
    return False, f"unknown command {kind}", None


def check_in(config: dict) -> None:
    """Report status, collect commands, and report their results.

    Hosts without remote management answer nothing here, which is harmless.
    A command's id is saved as done before it runs, so a reboot whose report
    was lost is acknowledged again rather than repeated.
    """
    if not config.get("token"):
        return
    raw = _post_status(config)
    if raw is None:
        return
    try:
        commands = json.loads(raw).get("commands") or []
    except (ValueError, AttributeError):
        return
    after = []
    done = config.setdefault("done_commands", [])
    for command in commands if isinstance(commands, list) else []:
        if not isinstance(command, dict) or not isinstance(command.get("id"), str):
            continue
        ident = command["id"]
        if ident in done:
            if not any(result["id"] == ident for result in config.setdefault("_results", [])):
                config["_results"].append({"id": ident, "ok": True, "detail": "already done"})
            continue
        done.append(ident)
        del done[:-50]
        save_config(config)
        args = command.get("args") if isinstance(command.get("args"), dict) else {}
        try:
            ok, detail, then = run_command(config, str(command.get("type", "")), args)
        except Exception as error:  # A bad command must never stop playback.
            ok, detail, then = False, f"failed ({error})", None
        log(f"command {command.get('type')}: {detail.splitlines()[0] if detail else ''}")
        config.setdefault("_results", []).append({"id": ident, "ok": ok, "detail": detail})
        if then:
            after.append(then)
    if after or config.get("_results"):
        _post_status(config)
    for then in after:
        then()


def _post_status(config: dict) -> bytes | None:
    results = list(config.get("_results", []))
    body = json.dumps({"status": device_status(config), "results": results}).encode()
    raw = request(config, "/api/map/device/status", data=body, timeout=10, quiet=True)
    if raw is not None:
        config["_results"] = [result for result in config.get("_results", []) if result not in results]
    return raw


def offer_setup_network(config: dict, network=None) -> bool:
    """With no network of its own, the Pi becomes one so it can be set up.

    A projector has no keyboard, so a device that cannot reach a host is
    otherwise a dead end: nothing to type on, nothing to talk to. Raising its
    own access point is what makes the box turnkey — the operator joins it
    from a phone and finishes setup there.

    Returns whether the access point is up, so the caller can say so. Does
    nothing once the device has a network, including one it just joined.
    """
    network = network or (aether_setup.NetworkManager(password=config.get("setup_password", "")) if aether_setup else None)
    if network is None:
        return False
    if config.get("setup_complete"):
        # A configured projector with no network is a projector waiting for
        # the router to come back, still playing its last good show. Taking
        # its wifi down to raise an access point nobody is looking for would
        # turn an outage into an outage plus a lost show.
        return False
    status = network.status()
    if status.get("connected"):
        return False
    if status.get("hotspot"):
        return True
    raised, detail = network.hotspot(True)
    log(f"no network; setup access point {'up' if raised else 'failed: ' + detail}")
    return raised


def output_for_device(show_dir: Path, device_id: str) -> str:
    """Which output in the deployed show this device is the projector for.

    A show can drive several projectors, and each output names the paired
    device it plays on. Without this every Pi opened the renderer with no
    output id and drew `outputs[0]` — so a second device on the same show
    projected the first one's scene and its own binding did nothing.

    Falls back to "", which the renderer reads as "the show's first output":
    that is what a single-projector show wants, and what every show deployed
    before outputs named their devices already relied on.
    """
    try:
        layout = json.loads((show_dir / "layout.json").read_text())
    except (OSError, ValueError):
        return ""
    outputs = layout.get("outputs")
    if not isinstance(outputs, list):
        return ""
    for output in outputs:
        if isinstance(output, dict) and output.get("deviceId") == device_id:
            return str(output.get("id") or "")
    return ""


# Available even before the React bundle is deployed. Only the public pairing
# code is exposed here; the device token remains inside the daemon.
PLAYER_START_PAGE = """<!doctype html><html><head><meta charset="utf-8">
<title>Aether Map — Player</title><style>
html,body{margin:0;background:#000;color:#fff;font:24px system-ui;height:100%}
body{display:grid;place-content:center;text-align:center;padding:3vh 5vw;box-sizing:border-box}
#pairing-qr{width:min(36vh,320px);height:min(36vh,320px);margin:0 auto;background:white}
#pairing-guidance{max-width:80vw;font-size:20px;overflow-wrap:anywhere}
strong{font-size:64px;letter-spacing:4px}
.detail{font:32px ui-monospace,monospace;color:#8ad;margin-top:8px}
</style></head><body><h1>Aether Map</h1><strong id="code"></strong>
<p id="status">Starting…</p><p id="detail" class="detail"></p>
<img id="pairing-qr" hidden alt="Scan to pair this player"/><p id="pairing-guidance" hidden></p><script>
// This screen has no keyboard. While setup is unfinished it says what to join
// and where to go; the operator answers on a phone.
const SAY={wifi:['Set up this projector','Join the Wi-Fi network below, then open the address in a browser.'],
server:['Continue setup on your phone','Open the address below to point this projector at your host.'],
name:['Continue setup on your phone','Open the address below to name this projector.'],
permissions:['Continue setup on your phone','Open the address below to finish setup.']};
let reloadMark;
async function poll(){try{const r=await fetch('/player-status',{cache:'no-store'});
const s=await r.json();
// Remote commands from Aether Map: reload the display, or flash this
// projector's name so the right one is obvious from across the venue.
if(reloadMark===undefined)reloadMark=s.reload;else if(s.reload!==reloadMark){location.reload();return;}
let mark=document.getElementById('identify');
if(s.identify){if(!mark){mark=document.createElement('div');mark.id='identify';
  mark.style.cssText='position:fixed;inset:0;z-index:10;display:grid;place-content:center;text-align:center;background:#1f6feb;color:#fff;font:bold 14vh system-ui;border:3vh solid #fff;box-sizing:border-box';
  document.body.append(mark);}mark.textContent=s.name||'Aether Map';}
else if(mark)mark.remove();window.dispatchEvent(new CustomEvent('player-permissions',{detail:(s.setup||{}).permissions||{}}));const step=(s.setup||{}).step||'done';
const code=document.getElementById('code');
const status=document.getElementById('status');
const detail=document.getElementById('detail');
const qr=document.getElementById('pairing-qr'), guidance=document.getElementById('pairing-guidance');
const pairable=step==='done' && !s.claimed && !!s.code;
qr.hidden=!pairable || !s.pairingUrl;guidance.hidden=!pairable;
if(!qr.hidden){
  const image='/pairing.svg?code='+encodeURIComponent(s.code);
  if(qr.getAttribute('src')!==image)qr.src=image;
  guidance.textContent='Scan with your phone on the same network, then sign in and select Pair. '+new URL(s.pairingUrl).origin;
}else{qr.removeAttribute('src');guidance.textContent=s.pairingMessage||'';}

if(step!=='done' || !s.ready || !s.claimed)document.getElementById('saved-show')?.remove();
if(step!=='done'){
  document.querySelector('h1').textContent=SAY[step][0];
  code.textContent=step==='wifi'&&s.setup.hotspot?s.setup.setup_ssid:'';
  status.textContent=SAY[step][1];
  detail.textContent=step==='wifi'&&s.setup.hotspot
    ?'Password: '+s.setup.setup_password+' · Open http://192.168.4.1:'+location.port+'/setup'
    :s.setup.setup_url;
}else if(s.ready && s.claimed){
  let frame=document.getElementById('saved-show');
  const url='/index.html?output=1'+(s.outputID?'&outputID='+encodeURIComponent(s.outputID):'')+'&release='+encodeURIComponent(s.generation||'');
  if(!frame){frame=document.createElement('iframe');frame.id='saved-show';frame.title='Assigned show';
    frame.allow='autoplay';frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;background:black';
    document.body.append(frame);}
  // Retain the latest release without restarting a saved show behind live video.
  if(document.body.dataset.liveCast==='playing'){
    frame.dataset.resume=url;
    if(frame.getAttribute('src')!=='about:blank')frame.src='about:blank';
  }else if(frame.getAttribute('src')!==url)frame.src=url;
}

else{document.querySelector('h1').textContent='Aether Map';
  code.textContent=s.claimed?'':s.code;detail.textContent='';
  status.textContent=s.claimed?'Paired. Deploy a show from Aether Map.':
  s.code?'Enter this code in Aether Map \u2192 Devices.':'Connecting to Aether Studio\u2026';}
}catch{}setTimeout(poll,2000)}poll();
</script></body></html>"""


class ShowHandler(SimpleHTTPRequestHandler):
    """Serves the deployed show to the Chromium instance on this same device."""

    def __init__(self, *args, config=None, network=None, **kwargs):
        self.config = config or {}
        # Held, not built per request: a scan shells out, and the setup page
        # polls. Tests hand in a fake and never reach nmcli.
        self.network = network or (aether_setup.NetworkManager(password=self.config.get("setup_password", "")) if aether_setup else None)
        super().__init__(*args, **kwargs)

    # Setup is answered from a phone, so these are the only endpoints on this
    # server that a second device talks to.
    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html(self, markup: str) -> None:
        body = markup.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _progress(self) -> dict:
        state = aether_setup.progress(self.config, self.network.status(), bool(self.config.get("token")))
        hostname = socket.gethostname().split(".")[0]
        state["setup_url"] = f"http://{hostname}.local:{self.server.server_port}/setup"
        return state

    def _local(self):
        try:
            hostname = urlsplit("http://" + self.headers.get("Host", "")).hostname
            return ipaddress.ip_address(self.client_address[0]).is_loopback and hostname in ("127.0.0.1", "localhost", "::1")
        except ValueError:
            return False

    def _same_origin(self):
        origin = self.headers.get("Origin")
        return not origin or urlsplit(origin).netloc == self.headers.get("Host")

    def _cast(self, write=False):
        if not self._local() or not self._same_origin():
            self.send_error(403)
            return
        if not self.config.get("token"):
            self._json({"session": None})
            return
        data = None
        if write:
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 70000 or self.headers.get_content_type() != "application/json":
                    raise ValueError()
                data = self.rfile.read(length)
                if not isinstance(json.loads(data), dict):
                    raise ValueError()
            except (ValueError, UnicodeDecodeError):
                self.send_error(400)
                return
        raw = request(self.config, "/api/map/device/cast", data=data, timeout=3)
        try:
            self._json(json.loads(raw) if raw else {"session": None})
        except ValueError:
            self._json({"session": None}, 502)

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/cast":
            self._cast(write=True)
            return
        if self.config.get("setup_complete") or not self._same_origin():
            self.send_error(403)
            return
        if not (aether_setup and path.startswith("/setup/")):
            self.send_error(404)
            return
        step = path[len("/setup/") :]
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length)) if 0 < length <= 8192 else {}
        except (ValueError, OSError):
            body = {}
        if not isinstance(body, dict):
            body = {}
        applied, error = aether_setup.apply_step(step, body, self.config, self.network)
        if applied:
            save_config(self.config)
            # Joining a network takes this Pi's own access point down, which
            # drops the phone that asked. The answer is saved first, so the
            # operator reconnects to the real network and carries on.
            if step == "wifi":
                self.network.hotspot(False)
        self._json({"ok": applied, "error": error,
                    "progress": self._progress() if applied else None})

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        base = Path(self.config.get("show_dir", self.directory))
        root = deployed_directory(base)
        self.directory = str(root)
        if path == "/cast":
            self._cast()
            return
        if not self._local() and (self.config.get("setup_complete") or not path.startswith("/setup")):
            self.send_error(403)
            return
        if path == "/layout.json" and self.config.get("permissions", {}).get("play_audio") is False:
            try:
                layout = json.loads((root / "layout.json").read_text())
                layout["audioOutput"] = {**layout.get("audioOutput", {}), "muted": True}
                self._json(layout)
            except (OSError, ValueError):
                self.send_error(404)
            return
        if aether_setup and path == "/setup":
            self._html(aether_setup.load_page())
            return
        if aether_setup and path == "/setup/state":
            self._json(self._progress())
            return
        if aether_setup and path == "/setup/networks":
            self._json({"networks": self.network.scan()})
            return
        if path == "/pairing.svg":
            link, _ = aether_receiver.pairing_details(self.config) if aether_setup else ("", "")
            if not link:
                self.send_error(404)
                return
            body = aether_receiver.pairing_svg(link)
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'none'; sandbox")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/player-status":
            pairing_url, pairing_message = aether_receiver.pairing_details(self.config) if aether_setup else ("", "")
            body = json.dumps({
                "generation": root.name if root != base else "",
                "ready": (root / "layout.json").is_file() and (root / "index.html").is_file(),
                "claimed": bool(self.config.get("token")),
                "code": self.config.get("_pairing", {}).get("code", ""),
                "pairingUrl": pairing_url, "pairingMessage": pairing_message,
                # Empty means "the show's first output", which is what a
                # single-projector show wants.
                "outputID": output_for_device(root, str(self.config.get("device_id", ""))),
                # A device still in setup must not drop into the renderer
                # behind the operator's back, even if a show is already there.
                "setup": self._progress() if aether_setup else {"step": "done"},
                **player_flags(self.config),
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/":
            script = aether_receiver.SCRIPT if aether_setup else ""
            permissions = json.dumps(self.config.get("permissions") or {"keep_display_awake": True, "play_audio": True})
            body = PLAYER_START_PAGE.replace("</body>", "<script>const playerPermissions=" + permissions + ";" + script + "</script></body>").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        pass  # One line per media range request would drown the journal.

    def end_headers(self) -> None:
        # The show is replaced in place on deploy; never let the kiosk hold a
        # stale frame from its HTTP cache.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve(config: dict) -> None:
    show_dir = Path(config["show_dir"])
    show_dir.mkdir(parents=True, exist_ok=True)
    handler = partial(ShowHandler, directory=str(show_dir), config=config)
    server = ThreadingHTTPServer(("0.0.0.0", int(config["port"])), handler)
    server.daemon_threads = True
    log(f"serving {show_dir} on http://127.0.0.1:{config['port']}")
    server.serve_forever()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Aether Map player daemon")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("/etc/aether-player/config.json"),
        help="Device configuration written by install.sh",
    )
    parser.add_argument(
        "--once", action="store_true", help="Sync once and exit, without serving."
    )
    args = parser.parse_args(argv)

    config = load_config(args.config)
    log(f"device {config['device_id']} → {config.get('server_url') or 'awaiting setup'}")

    if args.once:
        announce(config)
        pull_show(config)
        return 0

    stop = threading.Event()
    threading.Thread(target=sync_forever, args=(config, stop), daemon=True).start()
    try:
        serve(config)
    except KeyboardInterrupt:
        stop.set()
        log("stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
