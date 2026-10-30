"""Deployment lifecycle: retain last good bytes, switch identities, and stop."""
import base64
import importlib.util
import json
import re
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("aether_player", Path(__file__).parents[1] / "aether_player.py")
player = importlib.util.module_from_spec(spec)
spec.loader.exec_module(player)


@pytest.fixture
def config(tmp_path):
    return {"server_url": "http://host.test", "device_id": "pi-test", "token": "test",
            "port": 8777, "show_dir": str(tmp_path / "show"), "_path": str(tmp_path / "config.json")}


def payload(document="a", revision=1, media=None):
    layout = {"version": 2, "output": {"width": 320, "height": 180}, "media": media or [],
              "scenes": [{"id": document, "name": document, "durationS": 10, "surfaces": []}],
              "activeSceneId": document, "playback": {"mode": "loop"}}
    return json.dumps({"show": {"id": document, "name": document, "revision": revision,
        "layout_base64": base64.b64encode(json.dumps(layout).encode()).decode()}}).encode()


def test_switches_different_documents_at_the_same_revision(config, monkeypatch):
    replies = iter([payload("first"), payload("second")])
    monkeypatch.setattr(player, "request", lambda *a, **k: next(replies))
    monkeypatch.setattr(player, "fetch_app", lambda *a: True)
    player.pull_show(config)
    player.pull_show(config)
    assert json.loads((player.deployed_directory(Path(config["show_dir"])) / "layout.json").read_text())["activeSceneId"] == "second"
    assert config["document"] == "second"


def test_stop_blacks_output_but_offline_keeps_the_last_show(config, monkeypatch):
    replies = iter([payload(), None, b'{"show":null}'])
    monkeypatch.setattr(player, "request", lambda *a, **k: next(replies))
    monkeypatch.setattr(player, "fetch_app", lambda *a: True)
    player.pull_show(config)
    path = player.deployed_directory(Path(config["show_dir"])) / "layout.json"
    before = path.read_bytes()
    player.pull_show(config)
    assert path.read_bytes() == before
    player.pull_show(config)
    stopped = json.loads(path.read_text())
    assert stopped["scenes"][0]["surfaces"] == []
    assert stopped["activeSceneId"] == "stopped"
    assert "document" not in config and "revision" not in config
    assert not path.with_name("layout.json.part").exists()


def test_failed_media_download_does_not_publish_a_partial_show(config, monkeypatch):
    replies = iter([payload(), payload("replacement", media=[{"file": "missing.png"}])])
    monkeypatch.setattr(player, "request", lambda *a, **k: next(replies))
    monkeypatch.setattr(player, "fetch_app", lambda *a: True)
    monkeypatch.setattr(player, "fetch_media", lambda *a: False)
    player.pull_show(config)
    path = player.deployed_directory(Path(config["show_dir"])) / "layout.json"
    before = path.read_bytes()
    player.pull_show(config)
    assert path.read_bytes() == before
    assert config["document"] == "a"


def test_unchanged_deployment_does_not_redownload(config, monkeypatch):
    monkeypatch.setattr(player, "request", lambda *a, **k: payload())
    calls = []
    monkeypatch.setattr(player, "fetch_app", lambda *a: calls.append(True) or True)
    player.pull_show(config)
    player.pull_show(config)
    assert calls == [True]


def test_supported_versions_match_the_renderer_that_draws_them():
    """The daemon must not refuse a show the deployed renderer can read.

    These two live in different languages and cannot share a constant, so they
    are compared instead. This exact drift shipped once: the document format
    moved to 3, `SUPPORTED_LAYOUT_VERSIONS` still said (1, 2), and every current
    show failed to deploy to a Pi with "unsupported layout".
    """
    parser = (Path(__file__).parents[2] / "src/show-file.ts").read_text()
    guard = next(line for line in parser.splitlines() if "Unsupported show version" in line.strip()
                 or "raw.version !==" in line)
    accepted = {int(value) for value in re.findall(r"raw\.version !== (\d+)", guard)}
    assert accepted, f"could not read the accepted versions from show-file.ts: {guard!r}"
    assert set(player.SUPPORTED_LAYOUT_VERSIONS) == accepted, (
        f"the renderer accepts {sorted(accepted)} but the player deploys "
        f"{sorted(player.SUPPORTED_LAYOUT_VERSIONS)}"
    )


@pytest.mark.parametrize("version", [3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
def test_a_current_version_show_actually_deploys(config, monkeypatch, version):
    """The regression itself, end to end through pull_show."""
    layout = {"version": version, "output": {"width": 320, "height": 180}, "outputs": [],
              "media": [], "scenes": [{"id": "s", "name": "s", "durationS": 10, "surfaces": []}],
              "activeSceneId": "s", "playback": {"mode": "loop"}}
    reply = json.dumps({"show": {"id": "doc", "name": "Current", "revision": 7,
        "layout_base64": base64.b64encode(json.dumps(layout).encode()).decode()}}).encode()
    monkeypatch.setattr(player, "request", lambda *a, **k: reply)
    monkeypatch.setattr(player, "fetch_app", lambda *a, **k: True)
    player.pull_show(config)
    written = json.loads((player.deployed_directory(Path(config["show_dir"])) / "layout.json").read_text())
    assert written["version"] == version
    assert config["document"] == "doc" and config["revision"] == 7


def _layout(show_dir: Path, outputs):
    show_dir.mkdir(parents=True, exist_ok=True)
    (show_dir / "layout.json").write_text(json.dumps({"version": 3, "outputs": outputs}))
    return show_dir


def test_a_device_renders_the_output_it_is_bound_to(tmp_path):
    """Several projectors on one show must not all draw the first output."""
    show_dir = _layout(tmp_path, [
        {"id": "out-1", "deviceId": "pi-lobby"},
        {"id": "out-2", "deviceId": "pi-garden"},
    ])
    assert player.output_for_device(show_dir, "pi-garden") == "out-2"
    assert player.output_for_device(show_dir, "pi-lobby") == "out-1"


def test_an_unbound_device_falls_back_to_the_shows_first_output(tmp_path):
    """The single-projector case, and every show deployed before this existed."""
    show_dir = _layout(tmp_path, [{"id": "out-1"}])
    assert player.output_for_device(show_dir, "pi-lobby") == ""


def test_a_missing_or_broken_layout_never_raises(tmp_path):
    assert player.output_for_device(tmp_path / "absent", "pi") == ""
    broken = tmp_path / "broken"
    broken.mkdir()
    (broken / "layout.json").write_text("{not json")
    assert player.output_for_device(broken, "pi") == ""
    legacy = _layout(tmp_path / "legacy", "not-a-list")
    assert player.output_for_device(legacy, "pi") == ""


def test_pairing_proof_is_persisted_before_network_and_reused(config, monkeypatch):
    calls = []
    def request(current, path, *, data):
        body = json.loads(data)
        stored = json.loads(Path(config["_path"]).read_text())
        assert body["pairing_secret"] == stored["pairing_secret"]
        assert len(body["pairing_secret"]) >= 32
        calls.append(body["pairing_secret"])
        return None  # Lost response must not replace the bootstrap identity.
    monkeypatch.setattr(player, "request", request)
    player.announce(config)
    player.announce(config)
    assert calls[0] == calls[1]
    assert config["token"] == "test"  # Existing installed players retain access.


def test_frozen_renderer_keeps_installed_bundle_when_show_changes(config, monkeypatch):
    show_dir = Path(config["show_dir"])
    show_dir.mkdir()
    (show_dir / "index.html").write_text("installed renderer")
    config["permissions"] = {"allow_updates": False}
    monkeypatch.setattr(player, "request", lambda *a, **k: payload())
    monkeypatch.setattr(player, "fetch_app", lambda *a: pytest.fail("renderer is frozen"))
    player.pull_show(config)
    assert config["document"] == "a"
    assert (player.deployed_directory(show_dir) / "index.html").read_text() == "installed renderer"
    assert (show_dir / ".current").is_symlink()


def app_archive(label, extra=None):
    import io
    import zipfile
    content = io.BytesIO()
    with zipfile.ZipFile(content, 'w') as archive:
        archive.writestr('index.html', label)
        archive.writestr('assets/app.js', label)
        for name, value in (extra or {}).items():
            archive.writestr(name, value)
    return content.getvalue()


def deployment_requests(monkeypatch, show, renderer, media=None):
    replies = {'/api/map/device/show': show, '/api/map/app.zip': renderer}
    replies.update(media or {})
    monkeypatch.setattr(player, 'request', lambda config, path, **kw: replies.get(path))


def cached_bytes(config):
    active = player.deployed_directory(Path(config['show_dir']))
    return {str(p.relative_to(active)): p.read_bytes() for p in active.rglob('*') if p.is_file()}


def test_failed_media_keeps_renderer_layout_and_cached_media_together(config, monkeypatch):
    deployment_requests(monkeypatch, payload(media=[{'file': 'old.mp4'}]), app_archive('old'),
                        {'/api/map/media/old.mp4': b'old video'})
    player.pull_show(config)
    before = cached_bytes(config)
    pointer = (Path(config['show_dir']) / '.current').readlink()
    deployment_requests(monkeypatch, payload('new', 2, [{'file': 'missing.mp4'}]), app_archive('new'))
    player.pull_show(config)
    assert cached_bytes(config) == before
    assert (Path(config['show_dir']) / '.current').readlink() == pointer
    assert config['document'] == 'a' and config['revision'] == 1
    assert len(list((Path(config['show_dir']) / '.releases').iterdir())) == 1


@pytest.mark.parametrize('failure', ['archive', 'reserved-media', 'missing-index', 'disk', 'publish'])
def test_failed_install_preserves_active_release_and_can_retry(config, monkeypatch, failure):
    deployment_requests(monkeypatch, payload(media=[{'file': 'old.mp4'}]), app_archive('old'),
                        {'/api/map/media/old.mp4': b'old video'})
    player.pull_show(config)
    before = cached_bytes(config)
    next_app = app_archive('new')
    if failure == 'archive':
        next_app = b'broken zip'
    elif failure == 'reserved-media':
        next_app = app_archive('new', {'media/old.mp4': 'must not overwrite a cached hard link'})
    elif failure == 'missing-index':
        import io
        import zipfile
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('assets/app.js', 'incomplete')
        next_app = buffer.getvalue()
    with monkeypatch.context() as failed:
        deployment_requests(failed, payload('new', 2), next_app)
        if failure == 'disk':
            def no_space(*args):
                raise OSError('disk full')
            failed.setattr(player, 'write_layout', no_space)
        elif failure == 'publish':
            replace = Path.replace
            def interrupted(path, target):
                if Path(target).name == '.current':
                    raise OSError('interrupted publication')
                return replace(path, target)
            failed.setattr(Path, 'replace', interrupted)
        player.pull_show(config)
    assert cached_bytes(config) == before
    assert config['revision'] == 1
    deployment_requests(monkeypatch, payload('new', 2), app_archive('new'))
    player.pull_show(config)
    after = cached_bytes(config)
    assert after['index.html'] == b'new'
    assert json.loads(after['layout.json'])['activeSceneId'] == 'new'
    assert after['media/old.mp4'] == b'old video'
    assert config['revision'] == 2
    # A restarted daemon resolves the same completed release from disk.
    restored = player.load_config(Path(config['_path']))
    assert cached_bytes(restored) == after


def test_local_server_switches_generations_and_keeps_previous_requests_valid(config, monkeypatch):
    from functools import partial
    from http.server import ThreadingHTTPServer
    from threading import Thread
    from urllib.request import urlopen
    deployment_requests(monkeypatch, payload('first'), app_archive('first'))
    player.pull_show(config)
    root = Path(config['show_dir'])
    previous = player.deployed_directory(root)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(player.ShowHandler, directory=str(root), config=config))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_port}'
    try:
        with urlopen(url + '/index.html') as response:
            assert response.read() == b'first'
        deployment_requests(monkeypatch, payload('second'), app_archive('second'))
        player.pull_show(config)
        with urlopen(url + '/index.html') as response:
            assert response.read() == b'second'
        with urlopen(url + '/player-status') as response:
            status = json.load(response)
            assert status['ready'] and status['generation'] == player.deployed_directory(root).name
        assert (previous / 'index.html').read_bytes() == b'first'
        with urlopen(url + '/layout.json') as response:
            assert json.load(response)['activeSceneId'] == 'second'
        deployment_requests(monkeypatch, payload('third'), app_archive('third'))
        player.pull_show(config)
        assert not previous.exists()
        assert len(list((root / '.releases').glob('release-*'))) == 2
        assert "frame.getAttribute('src')!==url" in player.PLAYER_START_PAGE
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def test_kiosk_reloads_only_when_release_or_output_changes():
    """Execute the shipped start-page script against a small DOM, without a Pi."""
    import subprocess
    script = re.search(r'<script>(.*?)</script>', player.PLAYER_START_PAGE, re.S)[1]
    harness = r'''
const vm = require('node:vm'), assert = require('node:assert/strict');
const script = require('node:fs').readFileSync(0, 'utf8');
let state = {ready:true, claimed:true, generation:'first', outputID:'wall'}, frames = 0, navigations = [];
const elements = {code:{},status:{},detail:{},'pairing-qr':{removeAttribute(){}},'pairing-guidance':{}};
const context = {
  fetch: async () => ({json: async () => state}), setTimeout: () => {},
  window: {dispatchEvent() {}, addEventListener() {}}, CustomEvent: class {}, encodeURIComponent,
  document: { addEventListener() {},
    getElementById: id => elements[id], querySelector: () => ({}),
    createElement: () => ({style:{}, getAttribute() {return this.url;},
      set src(value) {this.url=value; navigations.push(value);}}),
    body: {dataset:{}, append(frame) {elements[frame.id]=frame; frames++;}},
  },
};
vm.runInNewContext(script, context);
setImmediate(async () => {
  assert.equal(frames, 1);
  assert.equal(navigations[0], '/index.html?output=1&outputID=wall&release=first');
  await context.poll();
  assert.equal(navigations.length, 1);
  state = {...state, generation:'second'};
  await context.poll();
  assert.equal(navigations.length, 2);
  assert.equal(navigations[1], '/index.html?output=1&outputID=wall&release=second');
  state = {...state, outputID:'ceiling'};
  await context.poll();
  assert.equal(navigations.length, 3);
  assert.equal(frames, 1);
  assert.equal(navigations[2], '/index.html?output=1&outputID=ceiling&release=second');
});
'''
    result = subprocess.run(['node', '-e', harness], input=script, text=True,
                            capture_output=True, check=False, timeout=10)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize("status", [401, 403, 404, 429, 500, 503])
def test_authority_refusal_stops_but_busy_or_unavailable_host_keeps_cached_show(config, monkeypatch, status):
    root = Path(config["show_dir"])
    root.mkdir()
    path = root / "layout.json"
    path.write_text('{"activeSceneId":"cached"}')
    config.update(document="saved", revision=1)

    def fail(*args, **kwargs):
        raise player.urllib.error.HTTPError("http://host.test/api/map/device/show", status, "refused", {}, None)

    monkeypatch.setattr(player.urllib.request, "urlopen", fail)
    player.pull_show(config)
    if status in (401, 403, 404):
        assert json.loads(path.read_text())["activeSceneId"] == "stopped"
        assert "document" not in config
        assert "document" not in json.loads(Path(config["_path"]).read_text())
    else:
        assert json.loads(path.read_text())["activeSceneId"] == "cached"
        assert config["document"] == "saved"
    # Asset failures must never masquerade as a successfully downloaded show.
    assert player.request(config, "/api/map/media/missing.png") is None
