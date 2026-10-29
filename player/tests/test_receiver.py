"""Kiosk boundary: LAN setup is temporary; signalling stays on loopback."""
import importlib.util
import json
import re
import types
import sys
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import pytest

ROOT = Path(__file__).parents[1]
for name in ("aether_setup", "aether_receiver", "aether_player"):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
player = sys.modules["aether_player"]
setup = sys.modules["aether_setup"]


class Network:
    def status(self):
        return {"connected": True}


@pytest.fixture
def kiosk(tmp_path, monkeypatch):
    config = {"port": 0, "show_dir": str(tmp_path), "device_id": "test", "server_url": "http://studio.test",
              "setup_complete": True, "token": "private-token", "_path": str(tmp_path / "config.json")}
    requests = []

    def request(*args, **kwargs):
        requests.append((args, kwargs))
        return b'{"session": null}'

    monkeypatch.setattr(player, "request", request)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(player.ShowHandler, directory=str(tmp_path), config=config, network=Network()))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}", config, requests
    server.shutdown()
    server.server_close()


def test_proxy_does_not_disclose_credentials(kiosk):
    url, _, requests = kiosk
    with urlopen(url + "/cast") as response:
        assert json.load(response) == {"session": None}
    assert requests[0][0][1] == "/api/map/device/cast"
    with urlopen(url + "/") as response:
        page = response.read().decode()
    assert "private-token" not in page
    assert "RTCPeerConnection" in page


def test_foreign_origins_and_dns_rebinding_cannot_proxy(kiosk):
    url, _, requests = kiosk
    for headers in ({"Origin": "http://evil.test"}, {"Host": "evil.test"}):
        with pytest.raises(HTTPError) as error:
            urlopen(Request(url + "/cast", headers=headers))
        assert error.value.code == 403
    assert requests == []


def test_setup_cannot_reconfigure_a_paired_device(kiosk):
    url, config, _ = kiosk
    with pytest.raises(HTTPError) as error:
        urlopen(Request(url + "/setup/server", data=b'{"server_url":"evil.test"}', headers={"Content-Type": "application/json"}))
    assert error.value.code == 403
    assert config["server_url"] == "http://studio.test"


def test_hotspot_has_fixed_address_password_and_no_autoconnect():
    calls = []

    def run(command, **kw):
        from types import SimpleNamespace
        calls.append(command)
        exists = command == ["nmcli", "connection", "show", "aether-setup"]
        return SimpleNamespace(returncode=1 if exists else 0, stdout="", stderr="")

    radio = setup.NetworkManager(run=run, password="unique-secret")
    assert radio.hotspot(True)[0]
    assert any("192.168.4.1/24" in command and "unique-secret" in command for command in calls)
    assert calls[-1] == ["nmcli", "connection", "up", "aether-setup"]
    assert "password" in calls[1] and "unique-secret" in calls[1]


def test_saved_network_retries_when_wifi_returns():
    calls = []

    def run(command, **kw):
        from types import SimpleNamespace
        calls.append(command)
        return SimpleNamespace(returncode=0, stdout="uuid-123:802-11-wireless", stderr="")

    radio = setup.NetworkManager(run=run)
    assert radio.join("Wi-Fi", "secret")[0]
    assert calls[-1] == ["nmcli", "connection", "modify", "uuid", "uuid-123", "connection.autoconnect", "yes", "connection.autoconnect-retries", "0"]


def test_device_audio_policy_does_not_rewrite_saved_show(kiosk):
    url, config, _ = kiosk
    config["permissions"] = {"play_audio": False}
    layout = Path(config["show_dir"]) / "layout.json"
    layout.write_text('{"audioOutput":{"volume":0.5,"muted":false}}')
    with urlopen(url + "/layout.json") as response:
        assert json.load(response)["audioOutput"] == {"volume": 0.5, "muted": True}
    assert json.loads(layout.read_text())["audioOutput"]["muted"] is False


@pytest.mark.parametrize("origin", [
    "http://localhost:8780", "https://LOCALHOST./", "http://sub.localhost", "http://127.0.0.1",
    "http://127.1", "http://2130706433", "http://0x7f000001", "http://0.0.0.0", "http://[::]",
    "http://[::1]", "http://[::ffff:127.0.0.1]", "http://224.0.0.1", "http://[fe80::1%25en0]",
    "https://user:secret@studio.local", "https://studio.local/?next=evil", "https://studio.local/#secret",
    "https://studio.local/override", "javascript:alert(1)", "https://studio.local:99999", "https://studio.local:",
    "https://studio.local\\@evil.test", "https://studio.local\n", "https://%6cocalhost", "http://-bad.local",
])
def test_pairing_qr_rejects_unusable_or_credential_bearing_origins(origin):
    receiver = sys.modules["aether_receiver"]
    link, message = receiver.pairing_details({"server_url": origin, "_pairing": {"code": "123456"}})
    assert link == "" and "network address" in message


@pytest.mark.parametrize("origin,expected", [
    ("https://Studio.local:8780/", "https://studio.local:8780"),
    ("http://192.168.1.25:8780", "http://192.168.1.25:8780"),
    ("https://[fd00::25]:8780", "https://[fd00::25]:8780"),
    ("https://例子.test", "https://xn--fsqu00a.test"),
])
def test_pairing_link_contains_only_origin_fixed_route_and_code(origin, expected):
    receiver = sys.modules["aether_receiver"]
    link, message = receiver.pairing_details({"server_url": origin, "_pairing": {"code": "001234"},
                                           "pairing_secret": "never-expose", "device_id": "private-name"})
    assert link == expected + "/map/index.html?pair=001234" and message == ""


@pytest.mark.parametrize("code", ["", "12345", "1234567", "１２３４５６", "123456&next=evil", 123456, None])
def test_pairing_link_requires_an_unclaimed_six_digit_code(code):
    receiver = sys.modules["aether_receiver"]
    config = {"server_url": "https://studio.local", "_pairing": {"code": code}}
    assert receiver.pairing_details(config) == ("", "")
    config["_pairing"]["code"] = "123456"
    config["token"] = "private-token"
    assert receiver.pairing_details(config) == ("", "")


def test_local_qr_is_uncached_rotates_and_disappears_after_claim(kiosk):
    receiver = sys.modules["aether_receiver"]
    url, config, _ = kiosk
    config.pop("token")
    config["pairing_secret"] = "private-proof"
    config["_pairing"] = {"claimed": False, "code": "123456"}
    with urlopen(url + "/player-status") as response:
        assert response.headers["Cache-Control"] == "no-store"
        state = json.load(response)
    assert state["pairingUrl"] == "http://studio.test/map/index.html?pair=123456"
    assert "private-proof" not in json.dumps(state)
    with urlopen(url + "/pairing.svg?code=999999&url=https://evil.test") as response:
        assert response.headers["Cache-Control"] == "no-store"
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        first = response.read()
    assert first == receiver.pairing_svg(state["pairingUrl"])
    assert b"private-proof" not in first and b"http" not in first.replace(b"http://www.w3.org/2000/svg", b"")
    config["_pairing"]["code"] = "654321"
    with urlopen(url + "/pairing.svg") as response:
        assert response.read() != first
    with pytest.raises(HTTPError) as error:
        urlopen(Request(url + "/pairing.svg", headers={"Host": "evil.test"}))
    assert error.value.code == 403
    config["token"] = "private-token"
    with pytest.raises(HTTPError) as error:
        urlopen(url + "/pairing.svg")
    assert error.value.code == 404
    with urlopen(url + "/player-status") as response:
        assert json.load(response)["pairingUrl"] == ""


def test_vendored_qr_encoder_matches_licensed_upstream():
    import hashlib
    source = (ROOT / "aether_receiver.py").read_text()
    vendor = source.split("# Only change: the future-annotations import is moved to this module's header.\n", 1)[1].split("\n# END VENDORED QR ENCODER", 1)[0]
    restored = vendor.replace("import collections, itertools, re", "from __future__ import annotations\nimport collections, itertools, re", 1)
    assert hashlib.sha256(restored.encode()).hexdigest() == "b089855caf16185c61421ea4927c1b213cf9468940d71fa8ab11ef83662dcc84"
    assert "Copyright (c) Project Nayuki. (MIT License)" in vendor


CAST_HARNESS = r'''
const vm = require('node:vm'), assert = require('node:assert/strict');
const script = require('node:fs').readFileSync(0, 'utf8');
const [sdp, accepts] = JSON.parse(process.argv[1]);
const element = () => ({style:{}, dataset:{}, append() {}, setAttribute() {}, addEventListener() {},
  play: async () => {}, getTracks: () => []});
const handed = [];
const show = {src:'/index.html?output=1', dataset:{}, getAttribute() {return this.src;},
  contentWindow:{aetherCast: stream => { handed.push(stream); return accepts; }}};
const peers = [];
class Peer { constructor() { peers.push(this); this.iceGatheringState = 'complete'; this.connectionState = 'new'; }
  async setRemoteDescription() {} async createAnswer() { return {}; } async setLocalDescription() { this.localDescription = {sdp:'answer'}; }
  addEventListener() {} close() {} }
class Stream { constructor() { this.tracks = []; } addTrack(t) { this.tracks.push(t); } getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks; } }
const body = {dataset:{}, append() {}};
const context = {
  playerPermissions:{play_audio:true, keep_display_awake:false}, navigator:{}, console,
  document:{createElement: element, getElementById: id => id === 'saved-show' ? show : null, body,
    addEventListener() {}, removeEventListener() {}, visibilityState:'visible'},
  window:{addEventListener() {}, removeEventListener() {}},
  fetch: async (_url, options) => ({ok:true, json: async () => options && options.method === 'POST' ? {} :
    {session:{id:'s1', offer:{type:'offer', sdp}}}}),
  AbortSignal:{timeout: () => undefined}, AbortController, RTCPeerConnection: Peer, MediaStream: Stream,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Date,
};
vm.runInNewContext(script, context);
setTimeout(() => {
  const pc = peers[0], track = {id:'v', kind:'video', readyState:'live', addEventListener() {}};
  pc.ontrack({track});
  const video = context.__video;
  video.paused = false; video.videoWidth = 1280; video.onplaying();
  console.log(JSON.stringify({handed: handed.length, live: body.dataset.liveCast, display: video.style.display,
    show: show.src, sameStream: handed[0] === video.srcObject}));
}, 50);
'''


@pytest.mark.parametrize("sdp,accepts,expected", [
    ("v=0\r\nm=video 9 UDP\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n", True,
     {"handed": 1, "live": "cast", "display": "none", "show": "/index.html?output=1", "sameStream": True}),
    ("v=0\r\nm=video 9 UDP\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n", False,
     {"handed": 1, "live": "playing", "display": "block", "show": "about:blank", "sameStream": True}),
    ("v=0\r\nm=video 9 UDP\r\n", True,
     {"handed": 0, "live": "playing", "display": "block", "show": "about:blank", "sameStream": False}),
])
def test_cast_plays_inside_the_show_and_a_mirror_or_castless_show_goes_full_screen(sdp, accepts, expected):
    """A cast (offer with a data channel) goes to the show's Cast surfaces while the show keeps running."""
    import subprocess
    script = player.aether_receiver.SCRIPT.replace("const liveVideo = document.createElement('video');",
                                                   "const liveVideo = document.createElement('video');globalThis.__video=liveVideo;")
    result = subprocess.run(['node', '-e', CAST_HARNESS, json.dumps([sdp, accepts])], input=script, text=True,
                            capture_output=True, check=False, timeout=10)
    assert result.returncode == 0, result.stdout + result.stderr
    assert json.loads(result.stdout.strip().splitlines()[-1]) == expected


def _web_calls(monkeypatch, active=True):
    calls = []

    def run(argv, **kwargs):
        calls.append(argv)
        return types.SimpleNamespace(returncode=0 if active or argv[1:3] != ["--user", "is-active"] else 3)

    monkeypatch.setattr(player.subprocess, "run", run)
    monkeypatch.setattr(player, "WEB_WINDOW", {"wanted": None})
    return calls


WANTED = {"url": "https://www.disneyplus.com/", "x": 200, "y": 100, "width": 960, "height": 540}


def test_web_window_opens_over_its_surface_and_is_replaced_only_when_it_changes(monkeypatch):
    calls = _web_calls(monkeypatch)
    player.web_window({"permissions": {"play_audio": True}}, dict(WANTED))
    assert calls[0] == ["systemctl", "--user", "stop", "aether-web"]
    launch = calls[1]
    assert launch[:6] == ["systemd-run", "--user", "--unit=aether-web", "--collect", "--quiet", "--"]
    assert "--app=https://www.disneyplus.com/" in launch and "--window-position=200,100" in launch
    assert "--window-size=960,540" in launch and "--ozone-platform=x11" in launch and "--mute-audio" not in launch
    calls.clear()
    player.web_window({}, dict(WANTED))
    assert calls == [["systemctl", "--user", "is-active", "--quiet", "aether-web"]]
    calls.clear()
    player.web_window({"permissions": {"play_audio": False}}, {**WANTED, "x": 300})
    assert calls[0][2] == "stop" and "--window-position=300,100" in calls[1] and "--mute-audio" in calls[1]
    calls.clear()
    player.web_window({}, None)
    assert calls == [["systemctl", "--user", "stop", "aether-web"]]


def test_a_closed_web_window_reopens(monkeypatch):
    calls = _web_calls(monkeypatch, active=False)
    player.web_window({}, dict(WANTED))
    calls.clear()
    player.web_window({}, dict(WANTED))
    assert calls[0][2] == "is-active" and calls[-1][0] == "systemd-run"


@pytest.mark.parametrize("bad", [
    {**WANTED, "url": "http://example.com/"}, {**WANTED, "url": "https://example.com/ --flag"},
    {**WANTED, "url": "javascript:alert(1)"}, {**WANTED, "url": "https://" + "a" * 2050},
    {**WANTED, "width": 10}, {**WANTED, "x": -5}, {**WANTED, "y": 1.5}, {**WANTED, "height": True}, ["https://x"],
])
def test_web_window_accepts_only_https_and_sane_rectangles(monkeypatch, bad):
    calls = _web_calls(monkeypatch)
    with pytest.raises(ValueError):
        player.web_window({}, bad)
    assert calls == []


def test_only_the_kiosk_on_this_pi_can_open_a_web_window(kiosk, monkeypatch):
    url, _config, _requests = kiosk
    calls = _web_calls(monkeypatch)
    post = lambda body, **headers: urlopen(Request(url + "/web-window", data=json.dumps(body).encode(), method="POST",
                                                   headers={"Content-Type": "application/json", **headers}))
    assert json.load(post({"window": WANTED})) == {"ok": True}
    assert calls[-1][0] == "systemd-run"
    with pytest.raises(HTTPError) as refused:
        post({"window": WANTED}, Origin="https://evil.test")
    assert refused.value.code == 403
    with pytest.raises(HTTPError) as invalid:
        post({"window": {**WANTED, "url": "http://plain.test/"}})
    assert invalid.value.code == 400


def test_kiosk_forwards_the_shows_web_window_to_the_player():
    import subprocess
    script = re.search(r'<script>(.*?)</script>', player.PLAYER_START_PAGE, re.S)[1]
    harness = r'''
const vm = require('node:vm'), assert = require('node:assert/strict');
const script = require('node:fs').readFileSync(0, 'utf8');
const listeners = {}, posts = [];
const context = {
  fetch: async (url, options) => { if (options) posts.push([url, JSON.parse(options.body)]); return {json: async () => ({})}; },
  setTimeout: () => {}, encodeURIComponent, location: {origin: 'http://127.0.0.1:8777'}, devicePixelRatio: 2,
  window: {dispatchEvent() {}, addEventListener(name, fn) { listeners[name] = fn; }}, CustomEvent: class {},
  document: {getElementById: () => ({removeAttribute() {}}), querySelector: () => ({}), body: {dataset: {}}},
};
vm.runInNewContext(script, context);
const show = {url: 'https://www.disneyplus.com/', x: 100, y: 50, width: 480, height: 270};
listeners.message({origin: 'https://evil.test', data: {aetherWebWindow: show}});
listeners.message({origin: 'http://127.0.0.1:8777', data: {other: 1}});
listeners.message({origin: 'http://127.0.0.1:8777', data: {aetherWebWindow: show}});
listeners.message({origin: 'http://127.0.0.1:8777', data: {aetherWebWindow: null}});
setImmediate(() => {
  assert.deepEqual(posts, [
    ['/web-window', {window: {url: show.url, x: 200, y: 100, width: 960, height: 540}}],
    ['/web-window', {window: null}],
  ]);
});
'''
    result = subprocess.run(['node', '-e', harness], input=script, text=True, capture_output=True, check=False, timeout=10)
    assert result.returncode == 0, result.stdout + result.stderr
