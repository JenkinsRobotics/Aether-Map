"""Remote management: a player bolted out of reach updates, reports and obeys over the network."""
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))  # the player imports its setup module beside it
spec = importlib.util.spec_from_file_location("aether_player", ROOT / "aether_player.py")
player = importlib.util.module_from_spec(spec)
spec.loader.exec_module(player)

GOOD = {
    "aether_player.py": b"def update_player():\n    pass\n\ndef main():\n    return 0\n",
    "aether_setup.py": b"STEPS = ()\n",
    "aether_receiver.py": b"SCRIPT = ''\n",
}


@pytest.fixture
def config(tmp_path):
    return {"server_url": "https://host.test", "device_id": "pi-test", "token": "test", "name": "Porch",
            "port": 8777, "show_dir": str(tmp_path / "show"), "_path": str(tmp_path / "config.json")}


@pytest.fixture
def installed(tmp_path):
    directory = tmp_path / "opt"
    directory.mkdir()
    for name in player.PLAYER_FILES:
        (directory / name).write_bytes(b"# installed " + name.encode() + b"\ndef main():\n    pass\n")
    return directory


def serve_files(monkeypatch, files, calls=None):
    def fake(config, path, **kwargs):
        if calls is not None:
            calls.append((path, kwargs))
        return files.get(path.removeprefix("/api/map/"))
    monkeypatch.setattr(player, "request", fake)


# --- Player self-update -------------------------------------------------------

def test_a_new_player_from_the_host_is_installed_with_the_old_one_kept(config, installed, monkeypatch):
    before = {name: (installed / name).read_bytes() for name in player.PLAYER_FILES}
    calls = []
    serve_files(monkeypatch, GOOD, calls)
    assert player.update_player(config, installed) is True
    for name in player.PLAYER_FILES:
        assert (installed / name).read_bytes() == GOOD[name]
        assert (installed / ".previous" / name).read_bytes() == before[name]
    assert (installed / ".update-pending").is_file()
    # The files are public downloads: the device credential never goes with them.
    assert calls and all(kwargs.get("auth") is False for _, kwargs in calls)


@pytest.mark.parametrize("broken", [b"def main(:\n", b"", None])
def test_an_invalid_or_missing_download_changes_nothing(config, installed, monkeypatch, broken):
    before = {name: (installed / name).read_bytes() for name in player.PLAYER_FILES}
    serve_files(monkeypatch, {**GOOD, "aether_setup.py": broken})
    assert player.update_player(config, installed) is False
    assert {name: (installed / name).read_bytes() for name in player.PLAYER_FILES} == before
    assert not (installed / ".update-pending").exists()


def test_a_player_that_could_not_update_itself_again_is_refused(config, installed, monkeypatch):
    # An older host serving a player without remote updates would strand the
    # device on it for good.
    serve_files(monkeypatch, {**GOOD, "aether_player.py": b"def main():\n    return 0\n"})
    assert player.update_player(config, installed) is False
    assert not (installed / ".update-pending").exists()


def test_the_same_player_is_not_reinstalled(config, installed, monkeypatch):
    serve_files(monkeypatch, {name: (installed / name).read_bytes() for name in player.PLAYER_FILES})
    assert player.update_player(config, installed) is False
    assert not (installed / ".update-pending").exists()


def test_a_player_that_was_rolled_back_is_not_tried_again(config, installed, monkeypatch):
    (installed / ".rejected").mkdir()
    for name, raw in GOOD.items():
        (installed / ".rejected" / name).write_bytes(raw)
    serve_files(monkeypatch, GOOD)
    assert player.update_player(config, installed) is False


def test_automatic_updates_respect_the_device_permission_but_a_request_does_not(config, installed, monkeypatch):
    config["permissions"] = {"allow_updates": False}
    serve_files(monkeypatch, GOOD)
    assert player.update_player(config, installed) is False
    assert player.update_player(config, installed, force=True) is True


def guard_script():
    text = (ROOT / "install.sh").read_text()
    body = re.search(r"<<'GUARD'\n(.*?)\nGUARD\n", text, re.S).group(1)
    return body


def run_guard(directory):
    script = guard_script().replace("${INSTALL_DIR}", str(directory)).replace('"$(dirname "$0")"', str(directory))
    subprocess.run(["bash", "-c", script], check=True)


def test_an_update_that_keeps_failing_to_start_is_rolled_back_by_the_guard(config, installed, monkeypatch):
    before = {name: (installed / name).read_bytes() for name in player.PLAYER_FILES}
    serve_files(monkeypatch, GOOD)
    player.update_player(config, installed)
    for _ in range(3):  # systemd restarts the crashing player
        run_guard(installed)
        assert (installed / "aether_player.py").read_bytes() == GOOD["aether_player.py"]
    run_guard(installed)
    assert {name: (installed / name).read_bytes() for name in player.PLAYER_FILES} == before
    assert (installed / ".rejected" / "aether_player.py").read_bytes() == GOOD["aether_player.py"]
    assert not (installed / ".update-pending").exists()
    # The guard does nothing on an ordinary start.
    run_guard(installed)
    assert (installed / "aether_player.py").read_bytes() == before["aether_player.py"]


def test_an_update_is_confirmed_once_the_new_player_has_run_and_reached_the_host(config, installed, monkeypatch):
    (installed / ".update-pending").write_text("1")
    monkeypatch.setattr(player, "STARTED", player.time.monotonic())
    config["_contact"] = player.time.monotonic()
    player.confirm_update(config, installed)
    assert (installed / ".update-pending").exists()  # too early to trust it
    monkeypatch.setattr(player, "STARTED", player.time.monotonic() - 120)
    player.confirm_update(config, installed)
    assert not (installed / ".update-pending").exists()


# --- Check-in and commands ----------------------------------------------------

class Host:
    """A stand-in Studio: queues commands until the player reports them done."""

    def __init__(self, commands=None, supported=True):
        self.commands = list(commands or [])
        self.posts = []
        self.supported = supported

    def __call__(self, config, path, *, data=None, **kwargs):
        if path != "/api/map/device/status":
            return None
        if not self.supported:
            return None
        body = json.loads(data)
        self.posts.append(body)
        done = {result["id"] for result in body["results"]}
        self.commands = [command for command in self.commands if command["id"] not in done]
        return json.dumps({"commands": self.commands}).encode()


def test_a_check_in_reports_what_the_device_is_doing(config, monkeypatch):
    host = Host()
    monkeypatch.setattr(player, "request", host)
    config.update(document="show-1", revision=7)
    player.check_in(config)
    status = host.posts[0]["status"]
    assert status["show"] == {"id": "show-1", "revision": 7}
    assert re.fullmatch(r"[0-9a-f]{12}", status["player_version"])
    for key in ("uptime_s", "disk_free_mb", "hostname", "address", "last_error", "update_pending"):
        assert key in status


def test_a_host_without_remote_management_is_left_alone(config, monkeypatch):
    monkeypatch.setattr(player, "request", Host(supported=False))
    player.check_in(config)  # no error, nothing to do


def test_a_command_runs_once_and_its_result_reaches_the_host(config, monkeypatch, tmp_path):
    host = Host([{"id": "c1", "type": "identify", "args": {"seconds": 30}}])
    monkeypatch.setattr(player, "request", host)
    monkeypatch.setattr(player, "save_config", lambda config: None)
    player.check_in(config)
    assert player.player_flags(config)["identify"] is True
    assert config["done_commands"] == ["c1"]
    # Reported in the same check-in, without waiting a poll interval.
    assert host.posts[-1]["results"] == [{"id": "c1", "ok": True, "detail": "identifying for 30 s"}]
    player.check_in(config)
    assert host.posts[-1]["results"] == []


def test_a_repeated_command_is_acknowledged_but_not_run_again(config, monkeypatch):
    ran = []
    monkeypatch.setattr(player, "reboot_device", lambda: ran.append("reboot"))
    monkeypatch.setattr(player, "save_config", lambda config: None)
    config["done_commands"] = ["r1"]
    host = Host([{"id": "r1", "type": "reboot", "args": {}}])
    monkeypatch.setattr(player, "request", host)
    player.check_in(config)
    player.check_in(config)
    assert ran == []
    assert host.commands == []


def test_reboot_is_recorded_and_acknowledged_before_the_device_goes_down(config, monkeypatch):
    seen = []
    host = Host([{"id": "r2", "type": "reboot", "args": {}}])
    monkeypatch.setattr(player, "request", host)
    monkeypatch.setattr(player, "save_config", lambda config: seen.append(list(config.get("done_commands", []))))
    monkeypatch.setattr(player, "reboot_device", lambda: seen.append(("reboot", [r["id"] for r in host.posts[-1]["results"]])))
    player.check_in(config)
    assert seen[0] == ["r2"]
    assert seen[-1] == ("reboot", ["r2"])


def test_restart_and_update_restart_the_player_after_reporting(config, installed, monkeypatch):
    restarted = []
    monkeypatch.setattr(player, "restart_player", lambda: restarted.append(True))
    monkeypatch.setattr(player, "save_config", lambda config: None)
    monkeypatch.setattr(player, "INSTALL_DIR", installed)
    host = Host([{"id": "u1", "type": "update", "args": {}}])

    def fake(config, path, **kwargs):
        return GOOD.get(path.removeprefix("/api/map/")) if path != "/api/map/device/status" else host(config, path, **kwargs)
    monkeypatch.setattr(player, "request", fake)
    player.check_in(config)
    assert restarted == [True]
    assert host.posts[-1]["results"][0]["ok"] is True


def test_sync_now_redeploys_and_reload_refreshes_the_display(config, monkeypatch):
    monkeypatch.setattr(player, "request", Host([{"id": "s1", "type": "sync", "args": {}},
                                                  {"id": "s2", "type": "reload", "args": {}}]))
    monkeypatch.setattr(player, "save_config", lambda config: None)
    config["revision"] = 4
    before = player.player_flags(config)["reload"]
    player.check_in(config)
    assert "revision" not in config
    assert player.WAKE.is_set()
    assert player.player_flags(config)["reload"] != before


def test_logs_come_back_as_the_result(config, monkeypatch):
    player.log("media.png failed (timed out)")
    ok, detail, after = player.run_command(config, "logs", {"lines": 5})
    assert ok and "media.png failed" in detail and after is None


def test_a_new_server_address_is_used_only_if_it_answers(config, monkeypatch):
    monkeypatch.setattr(player, "save_config", lambda config: None)
    monkeypatch.setattr(player, "reachable", lambda url: False)
    assert player.run_command(config, "set_server", {"url": "studio.example:8780"})[0] is False
    assert config["server_url"] == "https://host.test"
    monkeypatch.setattr(player, "reachable", lambda url: url == "https://studio.example:8780")
    assert player.run_command(config, "set_server", {"url": "studio.example:8780"})[0] is True
    assert config["server_url"] == "https://studio.example:8780"
    assert player.run_command(config, "set_server", {"url": "ftp://nope"})[0] is False


def test_permissions_change_remotely(config, monkeypatch):
    monkeypatch.setattr(player, "save_config", lambda config: None)
    config["permissions"] = {"keep_display_awake": True, "play_audio": True, "allow_updates": True}
    ok, _, _ = player.run_command(config, "set_permissions", {"play_audio": False, "bogus": True, "allow_updates": "yes"})
    assert ok
    assert config["permissions"] == {"keep_display_awake": True, "play_audio": False, "allow_updates": True}


def test_wifi_is_saved_for_later_without_dropping_the_current_network(config, monkeypatch):
    commands = []
    monkeypatch.setattr(player.subprocess, "run", lambda command, **kwargs: commands.append(command) or subprocess.CompletedProcess(command, 0, "", ""))
    ok, _, _ = player.run_command(config, "add_wifi", {"ssid": "Venue", "password": "correct horse"})
    assert ok
    assert commands[0][:4] == ["nmcli", "connection", "add", "type"]
    assert "up" not in commands[0]
    assert player.run_command(config, "add_wifi", {"ssid": "", "password": "x"})[0] is False
    assert player.run_command(config, "add_wifi", {"ssid": "Venue", "password": "short"})[0] is False


def test_an_unknown_command_is_refused(config):
    assert player.run_command(config, "format_disk", {})[:2] == (False, "unknown command format_disk")


def test_the_projector_identifies_itself_and_reloads_on_request():
    """Execute the shipped start-page script against a small DOM, without a Pi."""
    script = re.search(r'<script>(.*?)</script>', player.PLAYER_START_PAGE, re.S)[1]
    harness = r'''
const vm = require('node:vm'), assert = require('node:assert/strict');
const script = require('node:fs').readFileSync(0, 'utf8');
let state = {ready:false, claimed:true, code:'', reload:0, identify:false, name:'Porch'}, reloads = 0;
const elements = {code:{},status:{},detail:{},'pairing-qr':{removeAttribute(){}},'pairing-guidance':{}};
const context = {
  fetch: async () => ({json: async () => state}), setTimeout: () => {}, location: {reload() {reloads++;}},
  window: {dispatchEvent() {}, addEventListener() {}}, CustomEvent: class {}, encodeURIComponent,
  document: { addEventListener() {},
    getElementById: id => elements[id], querySelector: () => ({}),
    createElement: () => ({style:{}, remove() {delete elements[this.id];}}),
    body: {dataset:{}, append(node) {elements[node.id]=node;}},
  },
};
vm.runInNewContext(script, context);
setImmediate(async () => {
  assert.equal(elements.identify, undefined);
  state = {...state, identify:true};
  await context.poll();
  assert.equal(elements.identify.textContent, 'Porch');
  state = {...state, identify:false};
  await context.poll();
  assert.equal(elements.identify, undefined);
  assert.equal(reloads, 0);
  state = {...state, reload:1};
  await context.poll();
  assert.equal(reloads, 1);
});
'''
    result = subprocess.run(['node', '-e', harness], input=script, text=True,
                            capture_output=True, check=False, timeout=10)
    assert result.returncode == 0, result.stdout + result.stderr


def test_player_status_carries_the_remote_flags(config):
    from functools import partial
    from http.server import ThreadingHTTPServer
    from threading import Thread
    from urllib.request import urlopen
    Path(config["show_dir"]).mkdir(parents=True)
    config["_identify_until"] = player.time.time() + 30
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(player.ShowHandler, directory=config["show_dir"], config=config))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with urlopen(f"http://127.0.0.1:{server.server_port}/player-status") as response:
            status = json.load(response)
        assert status["identify"] is True and status["name"] == "Porch" and status["reload"] == 0
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
