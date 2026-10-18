"""A throwaway Aether Studio host for end-to-end tests.

Fresh data directory, setup completed with known credentials, Aether Map
enabled. Nothing here touches the developer's own installation.
"""

from __future__ import annotations

import os
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parents[2] / "AetherStudio"
sys.path.insert(0, str(REPO))

from core.host.server import StudioHost, make_handler  # noqa: E402

PORT = int(os.environ.get("AETHER_E2E_PORT", "8790"))
USERNAME = "e2e"
PASSWORD = "end-to-end-password-2026"


def main() -> None:
    data = Path(tempfile.mkdtemp(prefix="aether-map-e2e-"))
    host = StudioHost(data)
    host.dispatch(
        "/api/setup",
        {
            "token": host.store.setup_path.read_text(),
            "username": USERNAME,
            "password": PASSWORD,
            "full_name": "End to End",
            "email": "e2e@example.test",
            "name": "E2E Workspace",
            "apps": [app for app in ("map", "cad", "animation", "sketch", "io", "drive")
                     if app in host.packages and (host.packages[app][2] / "index.html").is_file()],
        },
        "",
        "127.0.0.1",
    )
    server = ThreadingHTTPServer(("127.0.0.1", PORT), make_handler(host))
    server.daemon_threads = True
    print(f"e2e host on http://127.0.0.1:{PORT}  data={data}", flush=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
