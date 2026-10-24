"""Fixed local Map worker. The host owns file authorization and persistence."""

import json
import shutil
import subprocess
from pathlib import Path

from core.host.automation.commands import Command
from core.host.state import Problem

# One product-owned catalog, consumed by legacy service and native worker package.
COMMANDS = tuple(
    Command(
        item["id"],
        item["title"],
        item["description"],
        item["action"],
        item["inputSchema"],
        item["writes"],
        "map",
    )
    for item in json.loads(
        Path(__file__).with_name("automation-commands.json").read_text()
    )
)


def execute(command, content, arguments):
    runner = Path(__file__).with_name("runtime") / "runner.mjs"
    node = shutil.which("node")
    if not node or not runner.is_file():
        raise Problem(
            503,
            "Map automation requires Node.js and its built runtime. Build Aether Map first.",
        )
    if len(content) > 4 * 1024 * 1024:
        raise Problem(413, "This show exceeds the 4 MiB automation document limit.")
    try:
        request = json.dumps(
            {
                "command": command,
                "content": content.decode("utf-8"),
                "arguments": arguments,
            },
            allow_nan=False,
        )
        completed = subprocess.run(
            [node, "--max-old-space-size=256", str(runner)],
            input=request,
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
        if completed.returncode or len(completed.stdout.encode()) > 8 * 1024 * 1024:
            raise Problem(503, "Map automation could not complete this operation.")
        response = json.loads(completed.stdout)
    except subprocess.TimeoutExpired:
        raise Problem(504, "Map automation timed out. No changes were saved.") from None
    except OSError:
        raise Problem(503, "Map automation runtime is unavailable.") from None
    except (UnicodeError, ValueError):
        raise Problem(400, "This Map document could not be read.") from None
    if "error" in response:
        raise Problem(400, response["error"])
    if "content" in response:
        response["content"] = response["content"].encode("utf-8")
    return response
