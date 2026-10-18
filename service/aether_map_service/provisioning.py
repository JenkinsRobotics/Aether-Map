"""Builds the Raspberry Pi installer the host hands out.

Two shapes of the same script:

*Piped* — `curl <host>/api/map/install.sh | bash`, with the host's address
stamped in. Needs the Pi already on a network that can reach this host.

*Self-contained* — a file downloaded on a laptop, carried to the Pi on a USB
stick, and run there. Python modules are embedded; missing OS packages still
need internet. The on-device wizard asks for Wi-Fi and the host address afterwards. This is the turnkey path: a Pi out of the box has no network, so
an installer that needs one cannot be the first step.
"""

from __future__ import annotations

import base64
from pathlib import Path

#: The daemon and the setup wizard, in the order install.sh expects them.
MODULES = ("aether_player.py", "aether_setup.py", "aether_receiver.py")

PLACEHOLDER = "@@AETHER_SERVER_URL@@"


def installer(source: Path, server_url: str) -> bytes:
    """The piped installer, pointed at the host that served it."""
    return (source / "install.sh").read_text().replace(PLACEHOLDER, server_url).encode()


def bundled_installer(source: Path, server_url: str = "") -> bytes:
    """The downloadable installer, with the player modules inside it.

    The modules are base64 so that no quoting, heredoc marker or stray
    backslash in Python source can terminate the shell script early — a
    truncated installer that still runs is a far worse failure than one that
    does not parse.

    `server_url` is optional on purpose. Left empty the wizard asks for the
    host, which is what an installer carried to an offline Pi needs; passing
    one only saves the operator a step when the network is already known.
    """
    lines = [
        "#!/usr/bin/env bash",
        "# Aether Map — self-contained Raspberry Pi installer.",
        "#",
        "# Copy this single file to a Raspberry Pi and run it:  bash " + BUNDLE_NAME,
        "# Runtime is bundled; missing OS packages require internet. The projector asks for your host",
        "# address on first boot.",
        "",
    ]
    for name in MODULES:
        encoded = base64.b64encode((source / name).read_bytes()).decode()
        lines.append(f"{_variable(name)}='{encoded}'")
    lines.append("")
    body = (source / "install.sh").read_text()
    # A bundled installer carries no host; the placeholder is left standing and
    # install.sh reads it as "ask during setup".
    lines.append(body.replace(PLACEHOLDER, server_url) if server_url else body)
    return "\n".join(lines).encode()


def _variable(module: str) -> str:
    """`aether_player.py` → `AETHER_PLAYER_B64`, the name install.sh reads."""
    return module.removesuffix(".py").upper() + "_B64"


BUNDLE_NAME = "aether-projector-setup.sh"
