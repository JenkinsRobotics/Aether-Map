import json
import subprocess
import time
from pathlib import Path

RUNNER = Path(__file__).parents[1] / "aether_map_service/runtime/runner.mjs"
SHOW = (Path(__file__).parent / "fixtures/automation-show.aethermap").read_text()


def test_worker_waits_for_input_that_arrives_late_and_in_pieces():
    # Studio writes the request after spawning the worker; a large show arrives
    # in several pipe-sized pieces. Reading must wait instead of failing EAGAIN.
    request = json.dumps({"command": "map.show.inspect", "content": SHOW, "arguments": {}, "pad": "x" * 200_000}).encode()
    process = subprocess.Popen(["node", str(RUNNER)], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    time.sleep(0.3)
    for start in range(0, len(request), 65_536):
        process.stdin.write(request[start:start + 65_536]); process.stdin.flush(); time.sleep(0.05)
    process.stdin.close()
    reply = json.loads(process.stdout.read())
    process.wait(10)
    assert "error" not in reply and reply["result"]["scenes"]
