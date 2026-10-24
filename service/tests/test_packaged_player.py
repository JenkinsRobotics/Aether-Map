"""Verify deployment from an installed wheel, outside the product checkout."""

import subprocess
import sys
import zipfile
from pathlib import Path


def test_installed_player_and_configured_renderer(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "wheel",
            "--no-deps",
            "--no-build-isolation",
            str(repo),
            "--wheel-dir",
            str(tmp_path),
        ],
        check=True,
        capture_output=True,
    )
    installed = tmp_path / "installed"
    with zipfile.ZipFile(next(tmp_path.glob("*.whl"))) as wheel:
        wheel.extractall(installed)
    script = r"""
import ast, base64, io, re, subprocess, sys, zipfile
from pathlib import Path
from importlib.resources import files
from types import SimpleNamespace
sys.path.insert(0, sys.argv[1])
import aether_map_service.service as service
assert service.MapService.compatibility["product"] == "map"
import aether_map_player
from aether_map_service import provisioning
from core.host.state import Problem
for module in (service, aether_map_player):
    assert Path(module.__file__).is_relative_to(sys.argv[1]), module.__file__
replies = []
handler = SimpleNamespace(reply=lambda *args, **kwargs: replies.append((args, kwargs)))
host = SimpleNamespace(packages={})
request = service.MapRequest(handler, host, None)
resources = files('aether_map_player')
request.map_provisioning('/api/map/' + provisioning.BUNDLE_NAME)
args, headers = replies.pop()
assert args[0] == 200
bundle = args[1]
assert 'attachment;' in headers['headers']['Content-Disposition']
subprocess.run(['bash', '-n'], input=bundle, check=True)
for module in provisioning.MODULES:
    encoded = re.search(r"^" + provisioning._variable(module) + r"='([^']+)'$", bundle.decode(), re.M)[1]
    code = base64.b64decode(encoded)
    ast.parse(code)
    assert code == (resources / module).read_bytes()
    request.map_provisioning('/api/map/' + module)
    assert replies.pop()[0][1] == code
    if module == 'aether_receiver.py':
        namespace = {'__name__': 'embedded_player_receiver'}
        exec(compile(code, module, 'exec'), namespace)
        link, message = namespace['pairing_details']({'server_url':'https://studio.local:8780','_pairing':{'code':'001234'}})
        assert link == 'https://studio.local:8780/map/index.html?pair=001234' and not message
        assert namespace['pairing_svg'](link).startswith(b'<svg')
        assert b'Copyright (c) Project Nayuki. (MIT License)' in code
assert 'v1.8.0' in (resources / 'THIRD_PARTY.md').read_text()

# The frontend can be deployed anywhere, independently of the service wheel.
renderer = Path.cwd() / 'published-map'
(renderer / 'assets').mkdir(parents=True)
(renderer / 'index.html').write_text('<html>installed release</html>')
(renderer / 'assets' / 'app.js').write_text('releaseRenderer = true;')
host.packages['map'] = ('Aether Map', 'map', renderer)
request.map_user = lambda **kw: {'id': 'owner'}
request.map_app_bundle()
args, _ = replies.pop()
assert args[0] == 200
with zipfile.ZipFile(io.BytesIO(args[1])) as archive:
    assert set(archive.namelist()) == {'index.html', 'assets/app.js'}
    assert archive.read('index.html') == (renderer / 'index.html').read_bytes()
host.packages.clear()
request.map_app_bundle()
assert replies.pop()[0][0] == 503

def unauthorized(**kw):
    raise Problem(401, 'Sign in first')
request.map_user = unauthorized
request.map_app_bundle()
assert replies.pop()[0][0] == 401
"""
    result = subprocess.run(
        [sys.executable, "-I", "-c", script, str(installed)],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
