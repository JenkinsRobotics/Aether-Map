from importlib.resources import files
import base64, io, json, mimetypes, socket, time, zipfile
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlencode, urlsplit
from urllib.request import Request as UrlRequest, urlopen
from core.host.state import Problem
from core.host.compatibility import packaged_contract
from . import provisioning as map_provisioning
from .media import (ANNOUNCE_LIMIT, MEDIA_CHUNK, MEDIA_MAX_BYTES,
                    safe_folder_header, media_target, media_in_use)
from .cast import MapCast
from .devices import DeviceStore
from .automation import COMMANDS as AUTOMATION_COMMANDS, execute as execute_automation


class MapService:
    automation_commands = AUTOMATION_COMMANDS
    automation = staticmethod(execute_automation)
    app = "map"
    compatibility = packaged_contract("aether_map_service", app)
    def __init__(self):
        self.cast = MapCast()

    def initialize(self, host):
        self.devices = DeviceStore(host.store)

    def api(self, host, user, path, data):
        store, uid = self.devices, user["id"]
        if path.startswith("/api/map/devices/"):
            if user["role"] == "service":
                raise Problem(403, "Sign in with a user account to manage devices.")
            host.require_app("map", user)
            action = path.rsplit("/", 1)[-1]
            if action.startswith("cast-"):
                device = store.own_device(uid, data.get("device_id"))
                return self.cast.owner(device, action, data)
            return store.map_device_action(action, user, data)

        raise Problem(404, "Unknown Map endpoint.")

    def http(self, handler, host, method, path):
        request = MapRequest(handler, host, self)
        try:
            if method == "GET":
                return request.get(path)
            if method in ("PUT", "DELETE") and path.startswith("/api/map/media/"):
                getattr(request, "do_" + method)()
                return True
            if method == "POST" and path == "/api/map/device/cast":
                request.map_device_cast(write=True)
                return True
            if method == "POST" and path == "/api/map/devices/announce":
                request.map_announce()
                return True
            return False
        except Problem as error:
            handler.reply(error.status, {"error": str(error)})
            return True

class MapRequest:
    def __init__(self, handler, host, service):
        self.handler, self.host, self.service = handler, host, service

    def __getattr__(self, name):
        return getattr(self.handler, name)

    def get(self, fast_path):
        host = self.host
        if fast_path in (
            "/api/map/ping",
            "/api/map/install.sh",
            "/api/map/aether_setup.py", "/api/map/aether_receiver.py",
            "/api/map/aether_player.py",
            "/api/map/" + map_provisioning.BUNDLE_NAME,
        ):
            self.map_provisioning(fast_path)
            return True

        if fast_path == "/api/map/assets/search":
            self.map_user()
            query = parse_qs(urlsplit(self.path).query).get("q", [""])[0].strip()
            if not query:
                self.reply(200, {"results": [], "result_count": 0, "page": 1, "page_count": 0})
                return True
            try:
                page = max(1, min(50, int(parse_qs(urlsplit(self.path).query).get("page", ["1"])[0])))
            except ValueError:
                page = 1
            upstream = "https://api.openverse.org/v1/images/?" + urlencode({
                "q": query,
                "page": page,
                # 20 is the anonymous ceiling. Asking for more is answered
                # 401, not 400, which reads as an auth problem and is not.
                "page_size": 20,
                "license_type": "all-cc",
            })
            request = UrlRequest(upstream, headers={
                "Accept": "application/json",
                "User-Agent": "AetherMap/1.0 (+https://github.com/aether-studio)",
            })
            try:
                with urlopen(request, timeout=15) as response:
                    payload = json.loads(response.read().decode("utf-8"))
            except HTTPError as problem:
                # Pass the upstream's own words through: Openverse explains
                # its refusals in the body, and swallowing that turns a
                # one-line fix into a hunt.
                detail = ""
                try:
                    detail = str(json.loads(problem.read().decode("utf-8")).get("detail", ""))[:200]
                except Exception:  # noqa: BLE001 - a body we cannot read is not the error
                    detail = ""
                self.reply(502, {"error": (
                    "Openverse is rate limiting searches. Wait a moment and try again."
                    if problem.code == 429 else
                    f"Openverse refused the search ({problem.code})."
                    + (f" {detail}" if detail else "")
                )})
                return True
            except (URLError, TimeoutError, socket.timeout):
                self.reply(504, {"error": "Could not reach Openverse. Check this machine's connection."})
                return True
            except (ValueError, json.JSONDecodeError):
                self.reply(502, {"error": "Openverse returned something unreadable."})
                return True
            self.reply(200, payload)
            return True

        if fast_path.startswith("/api/map/project/"):
            self.map_project_bundle(fast_path[len("/api/map/project/") :])
            return True

        if fast_path == "/api/map/app.zip":
            self.map_app_bundle()
            return True

        if fast_path == "/api/map/device/cast":
            self.map_device_cast()
            return True

        if fast_path == "/api/map/device/show":
            self.map_device_show()
            return True

        if fast_path.startswith("/api/map/media/"):
            self.map_media_get(fast_path[len("/api/map/media/") :])
            return True

        if fast_path == "/api/map/devices":
            with host.lock:
                _, token = self.context()
                user = host.require_user(token)
                host.require_app("map", user)
                self.reply(200, {"devices": self.service.devices.map_devices(user["id"])})
            return True
        return False

    def base_url(self):
        host = self.host
        """The address this client actually reached us on.

        The Host header wins over the configured public_url on purpose: a
        Pi fetching the installer reached us at an address that is, by
        definition, routable from where that Pi sits. public_url defaults
        to a loopback address, which on a Pi would mean the Pi itself.
        The header only ever shapes the script handed back to the same
        requester, so it carries no cross-user effect.
        """
        authority = self.headers.get("Host", "")
        if authority:
            scheme = "https" if host.running_settings.get("tls_cert") else "http"
            return f"{scheme}://{authority}"
        return host.running_settings.get("public_url", "").rstrip("/")

    def map_provisioning(self, path):
        host = self.host
        if path == "/api/map/ping":
            self.reply(200, {"ok": True, "app": "map"})
            return
        # The daemon and its setup wizard are separate modules so the
        # wizard can be tested without the daemon; both are fetched by
        # install.sh and both are served the same way.
        if path in ("/api/map/aether_player.py", "/api/map/aether_setup.py", "/api/map/aether_receiver.py"):
            self.reply(
                200,
                (files("aether_map_player") / path.rsplit("/", 1)[1]).read_bytes(),
                "text/x-python",
            )
            return
        source = files("aether_map_player")
        if path == "/api/map/" + map_provisioning.BUNDLE_NAME:
            # Downloaded on a laptop and carried to a Pi that has no
            # network yet, so it embeds the modules rather than fetching
            # them, and leaves the host address for the setup wizard.
            self.reply(
                200,
                map_provisioning.bundled_installer(source),
                "text/x-shellscript",
                headers={
                    "Content-Disposition":
                        f'attachment; filename="{map_provisioning.BUNDLE_NAME}"'
                },
            )
            return
        self.reply(
            200,
            map_provisioning.installer(source, self.base_url()),
            "text/x-shellscript",
        )

    def map_device_cast(self, write=False):
        host = self.host
        token = self.headers.get("Authorization", "").removeprefix("Bearer ")
        try:
            data = None
            if write:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 70000:
                    raise Problem(413, "Invalid signalling size.")
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise Problem(400, "Expected an object.")
            with host.lock:
                device = self.service.devices.device_for_token(token)
                if device is None:
                    raise Problem(401, "Unknown device.")
                result = self.service.cast.player(device, data)
            self.reply(200, result)
        except Problem as error:
            self.reply(error.status, {"error": str(error)})
        except (ValueError, UnicodeDecodeError):
            self.reply(400, {"error": "Invalid signalling request."})

    def map_device_show(self):
        host = self.host
        """A claimed device asks what it should be projecting.

        Authenticated by the device token issued at claim time, so a
        projector never holds a person's session and can be revoked by
        forgetting the device.
        """
        token = self.headers.get("Authorization", "")
        token = token[len("Bearer ") :] if token.startswith("Bearer ") else ""
        with host.lock:
            device = self.service.devices.device_for_token(token)
            if device is None:
                self.reply(401, {"error": "Unknown device."})
                return
            host.store.db.execute(
                "UPDATE map_devices SET seen=? WHERE id=?",
                (time.time(), device["id"]),
            )
            host.store.db.commit()
            if not device["document"]:
                self.reply(200, {"device": device["id"], "show": None})
                return
            # Authorization is re-read on every pull, not trusted from
            # assignment time: if the owner's access to the show is
            # withdrawn, the next pull withholds it and the projector
            # stops rather than serving what it cached at deploy.
            row = host.store.db.execute(
                "SELECT id,name,revision,content FROM library"
                " WHERE id=? AND app='map' AND trashed=0"
                " AND (owner=? OR scope='workspace')",
                (device["document"], device["owner"]),
            ).fetchone()
            if row is None:
                self.reply(200, {"device": device["id"], "show": None})
                return
            payload = {
                "device": device["id"],
                "show": {
                    "id": row["id"],
                    "name": row["name"],
                    "revision": row["revision"],
                    "layout_base64": base64.b64encode(row["content"]).decode(),
                },
            }
        self.reply(200, payload)

    def bearer(self):
        host = self.host
        value = self.headers.get("Authorization", "")
        return value[len("Bearer ") :] if value.startswith("Bearer ") else ""

    def map_user(self, allow_device=False):
        host = self.host
        """Authenticate briefly under the lock, then stream without it —
        a multi-hundred-megabyte video must not serialize every other
        request for the duration of its transfer."""
        with host.lock:
            if allow_device:
                device = self.service.devices.device_for_token(self.bearer())
                if device is not None:
                    return {"id": device["owner"], "role": "device"}
            _, token = self.context()
            user = host.require_user(token)
            host.require_app("map", user)
            return user

    def map_project_bundle(self, name):
        host = self.host
        """Everything a show is, in one archive: document, layout, assets
        and a wireframe of the mapping. The same route serves the wireframe
        on its own, so there is one generator rather than two that drift."""
        from .project import build_bundle, wireframe_svg

        wireframe_only = name.endswith(".svg")
        try:
            user = self.map_user()
            document_id = name.removesuffix(".zip").removesuffix(".svg")
            with host.lock:
                row = host.store.db.execute(
                    "SELECT id,owner,scope,name,content FROM library"
                    " WHERE id=? AND app='map' AND kind='file' AND trashed=0",
                    (document_id,),
                ).fetchone()
                if row is None:
                    raise Problem(404, "Show not found.")
                if row["owner"] != user["id"] and row["scope"] != "workspace":
                    raise Problem(403, "That show belongs to someone else.")
                document_name, content = row["name"], row["content"]
            if wireframe_only:
                import json as _json

                try:
                    show = _json.loads(content or b"{}")
                except (ValueError, UnicodeDecodeError):
                    raise Problem(400, "This show could not be read.") from None
                if not isinstance(show, dict):
                    raise Problem(400, "This show could not be read.")
                body = wireframe_svg(
                    show, safe_folder_header(document_name)
                ).encode()
            else:
                body = build_bundle(
                    document_name,
                    content or b"{}",
                    host.store.directory / "map-media",
                )
        except Problem as error:
            self.reply(error.status, {"error": error.message})
            return

        extension = "svg" if wireframe_only else "zip"
        self.reply(
            200,
            body,
            "image/svg+xml" if wireframe_only else "application/zip",
            {
                "Content-Disposition":
                    f'attachment; filename="{safe_folder_header(document_name)}'
                    f'{"-wireframe" if wireframe_only else ""}.{extension}"'
            },
        )

    def map_app_bundle(self):
        host = self.host
        """The built editor, so a device runs the show offline.

        Pulling this is also how a device updates: the same archive, newer
        bytes, no login on the projector and no card to re-image.
        """
        try:
            self.map_user(allow_device=True)
        except Problem as error:
            self.reply(error.status, {"error": error.message})
            return
        package = host.packages.get("map")
        dist = package[2] if package else None
        if dist is None or not (dist / "index.html").is_file():
            self.reply(503, {"error": "Build Aether Map before deploying it."})
            return
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for item in sorted(dist.rglob("*")):
                if item.is_file():
                    archive.write(item, item.relative_to(dist).as_posix())
        self.reply(200, buffer.getvalue(), "application/zip")

    def map_media_get(self, name):
        host = self.host
        try:
            self.map_user(allow_device=True)
            target = media_target(host.store.directory, name)
            if not target.is_file():
                raise Problem(404, "Media not found.")
        except Problem as error:
            self.reply(error.status, {"error": error.message})
            return

        size = target.stat().st_size
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        start, end = 0, size - 1
        partial = False
        # <video> cannot seek without Range, and Safari will not play at all
        # without a 206 on its first probe.
        header = self.headers.get("Range", "")
        if header.startswith("bytes="):
            first, _, last = header[len("bytes=") :].partition("-")
            try:
                if first:
                    start = int(first)
                    end = int(last) if last else size - 1
                elif last:
                    start = max(size - int(last), 0)
                partial = True
            except ValueError:
                partial = False
            if partial and (start >= size or start > end):
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        end = min(end, size - 1)
        length = end - start + 1

        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("X-Content-Type-Options", "nosniff")
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with target.open("rb") as handle:
            handle.seek(start)
            remaining = length
            while remaining > 0:
                block = handle.read(min(MEDIA_CHUNK, remaining))
                if not block:
                    break
                self.wfile.write(block)
                remaining -= len(block)

    def do_DELETE(self):  # noqa: N802
        host = self.host
        path = unquote(urlsplit(self.path).path)
        if not path.startswith("/api/map/media/"):
            self.reply(404, {"error": "Not found."})
            return
        try:
            self.map_user()
            name = path[len("/api/map/media/") :]
            target = media_target(host.store.directory, name)
            with host.lock:
                if media_in_use(host, name):
                    raise Problem(
                        409,
                        "A saved show still uses this media. Remove it from the "
                        "show first.",
                    )
                target.unlink(missing_ok=True)
        except Problem as error:
            self.reply(error.status, {"error": error.message})
            return
        self.reply(200, {"name": name, "deleted": True})

    def do_PUT(self):  # noqa: N802
        host = self.host
        path = unquote(urlsplit(self.path).path)
        if not path.startswith("/api/map/media/"):
            self.reply(404, {"error": "Not found."})
            return
        try:
            self.map_user()
            target = media_target(
                host.store.directory, path[len("/api/map/media/") :]
            )
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise Problem(400, "Invalid content length.") from None
            if not 0 < length <= MEDIA_MAX_BYTES:
                raise Problem(
                    413,
                    f"Media must be between 1 byte and {MEDIA_MAX_BYTES // (1024 * 1024)} MB.",
                )
        except Problem as error:
            self.reply(error.status, {"error": error.message})
            return

        # Write beside the target and rename, so an interrupted upload
        # never leaves a half-file that a show would try to project.
        staging = target.with_name(target.name + ".part")
        remaining = length
        try:
            with staging.open("wb") as handle:
                while remaining > 0:
                    block = self.rfile.read(min(MEDIA_CHUNK, remaining))
                    if not block:
                        raise OSError("The upload ended early.")
                    handle.write(block)
                    remaining -= len(block)
            staging.replace(target)
        except OSError:
            staging.unlink(missing_ok=True)
            self.reply(400, {"error": "The upload did not complete."})
            return
        self.reply(200, {"name": target.name, "bytes": length})

    def map_announce(self):
        host = self.host
        """Device heartbeat: bootstrap secret or existing bearer-token proof."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise Problem(400, "Invalid content length.") from None
        if not 0 < length <= 4096:
            raise Problem(413, "A device announcement is a small JSON object.")
        try:
            data = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            raise Problem(400, "Invalid JSON.") from None
        if not isinstance(data, dict):
            raise Problem(400, "Expected a JSON object.")
        with host.lock:
            # The only unauthenticated write in the system. A real device
            # announces every 15s — 60 per window — so this leaves room for
            # several behind one address while refusing a flood.
            if not host.store.throttle_recovery(
                "map-announce:" + self.client_address[0], ANNOUNCE_LIMIT
            ):
                raise Problem(429, "Too many device announcements. Try again later.")
            authorization = self.headers.get("Authorization", "")
            token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
            self.reply(200, self.service.devices.announce_device(data, token=token))
