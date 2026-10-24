"""Optional Android downloads remain explicit, bounded product artifacts."""
import importlib.util
import json
import shutil
import zipfile
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('device_distribution', ROOT / 'scripts/build-device-distribution.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def source(tmp_path):
    root = tmp_path / 'source'
    (root / 'dist').mkdir(parents=True)
    (root / 'dist/index.html').write_text('<html>real test build</html>')
    (root / 'player').mkdir()
    for name in ['install.sh', 'aether_player.py', 'aether_setup.py', 'aether_receiver.py']:
        shutil.copyfile(ROOT / 'player' / name, root / 'player' / name)
    (root / 'service/aether_map_service').mkdir(parents=True)
    shutil.copyfile(ROOT / 'service/aether_map_service/provisioning.py', root / 'service/aether_map_service/provisioning.py')
    return root


def apk(tmp_path, valid=True):
    path = tmp_path / 'receiver.apk'
    with zipfile.ZipFile(path, 'w') as archive:
        for name in ['AndroidManifest.xml', 'classes.dex', 'resources.arsc'] if valid else ['picture.png']:
            archive.writestr(name, b'test package member')
    return path


def test_default_keeps_six_file_legacy_distribution(tmp_path):
    result = builder.build(source(tmp_path), tmp_path / 'bundle')
    manifest = json.loads(result.read_text())
    assert manifest['schema'] == 1 and len(manifest['files']) == 6
    assert 'aether-map-receiver.apk' not in manifest['files']


def test_android_artifact_is_explicit_and_matches_hash(tmp_path):
    package = apk(tmp_path)
    result = builder.build(source(tmp_path), tmp_path / 'bundle', package)
    manifest = json.loads(result.read_text())
    assert manifest['schema'] == 2 and len(manifest['files']) == 7
    entry = manifest['files']['aether-map-receiver.apk']
    assert entry == {'size': package.stat().st_size, 'sha256': builder.sha256(package)}
    assert (result.parent / 'aether-map-receiver.apk').read_bytes() == package.read_bytes()
    with pytest.raises(ValueError, match='immutable'):
        builder.build(ROOT, result.parent, package)


def test_invalid_or_linked_apk_never_publishes_partial_distribution(tmp_path):
    root = source(tmp_path)
    with pytest.raises(ValueError, match='Android application'):
        builder.build(root, tmp_path / 'invalid', apk(tmp_path, False))
    assert not (tmp_path / 'invalid').exists()
    link = tmp_path / 'linked.apk'
    link.symlink_to(apk(tmp_path))
    with pytest.raises(OSError):
        builder.build(root, tmp_path / 'linked-bundle', link)
    assert not (tmp_path / 'linked-bundle').exists()
