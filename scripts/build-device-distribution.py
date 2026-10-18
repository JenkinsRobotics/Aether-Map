"""Build an immutable Map player distribution for the native Studio host.

Build-time Python only. The native host serves verified bytes without importing
this script or the legacy Python server. Does not install or contact a device.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import stat
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_FILE = 128 * 1024 * 1024
MAX_TOTAL = 512 * 1024 * 1024


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def build(root, destination, android_apk=None):
    root, destination = root.resolve(), destination.absolute()
    if destination.exists():
        raise ValueError('Choose a new output directory; distribution bundles are immutable.')
    dist = root / 'dist'
    if dist.is_symlink() or not (dist / 'index.html').is_file():
        raise ValueError('Build the Map web application first.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    source = root / 'player'
    spec = importlib.util.spec_from_file_location('map_provisioning', root / 'service/aether_map_service/provisioning.py')
    provisioning = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(provisioning)
    with tempfile.TemporaryDirectory(prefix='.map-distribution-', dir=destination.parent) as temporary:
        stage = Path(temporary)
        names = ['install.sh', *provisioning.MODULES]
        for name in names:
            path = source / name
            if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= 1024 * 1024:
                raise ValueError('Invalid player source.')
            shutil.copyfile(path, stage / name)
        (stage / provisioning.BUNDLE_NAME).write_bytes(provisioning.bundled_installer(stage))
        names += [provisioning.BUNDLE_NAME, 'app.zip']
        total, count = 0, 0
        with zipfile.ZipFile(stage / 'app.zip', 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            members = []
            for path in dist.rglob('*'):
                if len(members) >= 100000:
                    raise ValueError('Web build exceeds member limit.')
                members.append(path)
            for path in sorted(members):
                relative = path.relative_to(dist)
                if relative.parts[0] in ('media', 'layout.json'):
                    raise ValueError('Web build uses a reserved player path.')
                if path.is_symlink() or any(not re.fullmatch(r'[A-Za-z0-9_@(). -]{1,255}', part)
                                          or part.startswith('.') for part in relative.parts):
                    raise ValueError('Unsafe web build member.')
                if path.is_dir():
                    continue
                if not path.is_file() or path.stat().st_size > MAX_FILE:
                    raise ValueError('Invalid web build member.')
                before = path.stat()
                total += before.st_size
                count += 1
                if total > MAX_TOTAL or count > 100000:
                    raise ValueError('Web build exceeds distribution limits.')
                # Fixed timestamp/permissions make identical builds reproducible.
                info = zipfile.ZipInfo(relative.as_posix(), (2020, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
                with os.fdopen(os.open(path, flags), 'rb') as incoming, archive.open(info, 'w') as outgoing:
                    opened = os.fstat(incoming.fileno())
                    if not stat.S_ISREG(opened.st_mode) or opened.st_ino != before.st_ino:
                        raise ValueError('Web build member changed; retry.')
                    copied = 0
                    while part := incoming.read(1024 * 1024):
                        copied += len(part)
                        if copied > before.st_size:
                            raise ValueError('Web build member grew; retry.')
                        outgoing.write(part)
                after = path.stat(follow_symlinks=False)
                if copied != before.st_size or (before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                    raise ValueError('Web build changed during packaging; retry.')
        if (stage / 'app.zip').stat().st_size > MAX_TOTAL:
            raise ValueError('Archive exceeds distribution limits.')
        if android_apk is not None:
            android_apk = Path(android_apk)
            flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
            with os.fdopen(os.open(android_apk, flags), 'rb') as incoming:
                before = os.fstat(incoming.fileno())
                if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= MAX_FILE:
                    raise ValueError('Invalid Android APK.')
                with (stage / 'aether-map-receiver.apk').open('wb') as outgoing:
                    copied = 0
                    while part := incoming.read(1024 * 1024):
                        copied += len(part)
                        if copied > before.st_size:
                            raise ValueError('Android APK changed during packaging.')
                        outgoing.write(part)
                after = os.fstat(incoming.fileno())
                if copied != before.st_size or (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                    raise ValueError('Android APK changed during packaging.')
            with zipfile.ZipFile(stage / 'aether-map-receiver.apk') as archive:
                if not {'AndroidManifest.xml', 'classes.dex', 'resources.arsc'} <= set(archive.namelist()):
                    raise ValueError('Not an Android application APK.')
            names.append('aether-map-receiver.apk')
        files = {name: {'size': (stage / name).stat().st_size, 'sha256': sha256(stage / name)} for name in names}
        (stage / 'map-downloads.json').write_text(json.dumps({'schema': 2 if android_apk is not None else 1, 'app': 'map', 'files': files}, indent=2) + '\n')
        for path in stage.iterdir():
            path.chmod(0o600)
        os.rename(stage, destination)
    return destination / 'map-downloads.json'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--android-apk', type=Path, help='Optional signed TV APK; requires a schema2-capable native host.')
    args = parser.parse_args()
    print(build(ROOT, args.output, args.android_apk))
