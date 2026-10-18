"""Real saved-show worker through the host and MCP; no running editor needed."""

import base64
import json
import os
import subprocess
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest
from aether_map_service.automation import execute
from aether_map_service.service import MapService

from core.host.automation.client import Client
from core.host.products import Products
from core.host.server import StudioHost, make_handler
from core.host.state import Problem


def show_bytes():
    return (Path(__file__).parent / "fixtures/automation-show.aethermap").read_bytes()


@pytest.fixture
def host(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("test")
    host = StudioHost(
        tmp_path / "data",
        packages={"map": ("Map", "map", dist)},
        products=Products({"map": MapService}),
    )
    host.store.create_user("owner", "automation-test-password-only", "admin", False)
    token = host.store.sign_in("owner", "automation-test-password-only", "127.0.0.1")

    def call(path, data=None, credential=token):
        with host.lock:
            return host.dispatch(path, data or {}, credential, "127.0.0.1")

    file = call(
        "/api/library/create",
        {
            "app": "map",
            "name": "Agent show.aethermap",
            "data_base64": base64.b64encode(show_bytes()).decode(),
        },
    )
    key = call(
        "/api/automation/connections/create",
        {
            "label": "Fixture",
            "apps": ["map"],
            "can_write": True,
            "can_edit_content": True,
        },
    )["token"]
    yield host, call, file, key
    host.agents.close()
    host.store.db.close()


def test_worker_uses_built_product_runtime_without_working_directory_dependencies(
    monkeypatch, tmp_path
):
    monkeypatch.chdir(tmp_path)
    result = execute("map.show.inspect", show_bytes(), {})
    assert result["result"]["clips"][0]["id"] == "clip"
    assert "content" not in result


def test_saved_edits_recover_through_existing_revision_history(host):
    _, call, file, key = host

    def command(name, **arguments):
        return call(
            "/api/automation/commands/run",
            {"id": name, "arguments": {"app": "map", "id": file["id"], **arguments}},
            key,
        )["result"]

    original = command("map.show.inspect")
    assert original["saved_state_only"] and not original["changed"]
    moved = command(
        "map.clip.move", clip_id="clip", track_id="v1", start_s=7.5, expected_revision=1
    )
    assert moved["changed"] and moved["document"]["revision"] == 2
    assert moved["clips"][0]["start_s"] == 7.5
    with pytest.raises(Problem) as error:
        command("map.clip.edit", clip_id="clip", action="delete", expected_revision=1)
    assert error.value.status == 409
    history = call("/api/library/history", {"app": "map", "id": file["id"]})
    assert history["revisions"][0]["event"] == "save"
    assert history["revisions"][0]["note"] == "Agent: map.clip.move"
    call(
        "/api/library/restore",
        {"app": "map", "id": file["id"], "revision": 1, "expected_revision": 2},
    )
    restored = command("map.show.inspect")
    assert restored["clips"] == original["clips"]
    assert restored["document"]["revision"] == 3


def test_real_mcp_discovers_evaluates_edits_and_rejects_stale_show(host):
    studio, _, file, key = host
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(studio))
    server.daemon_threads = True
    address = f"http://127.0.0.1:{server.server_port}"
    studio.running_settings["public_url"] = address
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    target = {"app": "map", "id": file["id"]}

    def tool(ident, tool_name, **args):
        return {
            "jsonrpc": "2.0",
            "id": ident,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": {**target, **args}},
        }

    calls = [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "map-test", "version": "1"},
            },
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        tool(3, "map_show_evaluate", scene_id="scene", time_s=3),
        tool(
            4,
            "map_clip_move",
            clip_id="clip",
            track_id="v1",
            start_s=8,
            expected_revision=1,
        ),
        tool(5, "map_show_evaluate", scene_id="scene", time_s=3),
        tool(6, "map_clip_edit", clip_id="clip", action="delete", expected_revision=1),
        tool(7, "map_scene_create", name="Portrait", width_px=720, height_px=1280, expected_revision=2),
        tool(8, "map_surface_create", scene_id="scene", name="Wall", expected_revision=3),
        tool(9, "map_surface_create", scene_id="scene", name="Duplicate retry", expected_revision=3),
    ]
    try:
        process = subprocess.run(
            [sys.executable, "-m", "core.host.automation", "mcp"],
            input="\n".join(map(json.dumps, calls)) + "\n",
            text=True,
            capture_output=True,
            timeout=20,
            check=False,
            env={
                **os.environ,
                "AETHER_SERVER_URL": address,
                "AETHER_AUTOMATION_TOKEN": key,
            },
        )
        assert process.returncode == 0, process.stderr
        replies = [json.loads(line) for line in process.stdout.splitlines()]
        assert len(replies) == 9 and key not in process.stdout + process.stderr
        assert "map_clip_move" in {t["name"] for t in replies[1]["result"]["tools"]}
        assert len(replies[2]["result"]["structuredContent"]["result"]["layers"]) == 1
        assert (
            replies[3]["result"]["structuredContent"]["result"]["document"]["revision"]
            == 2
        )
        assert replies[4]["result"]["structuredContent"]["result"]["layers"] == []
        assert replies[5]["result"]["isError"]
        names = {t["name"] for t in replies[1]["result"]["tools"]}
        assert {"map_scene_create", "map_surface_create"} <= names
        scene_result = replies[6]["result"]["structuredContent"]["result"]
        assert scene_result["scenes"][-1]["name"] == "Portrait"
        assert scene_result["document"]["revision"] == 3
        surface_result = replies[7]["result"]["structuredContent"]["result"]
        assert surface_result["scenes"][0]["surfaces"][-1]["name"] == "Wall"
        assert surface_result["created"]["surface_id"]
        assert surface_result["document"]["revision"] == 4
        assert replies[8]["result"]["isError"]
        client = Client(address, key)
        result = client.call("run", {"id": "map.show.inspect", "arguments": target})[
            "result"
        ]
        assert result["clips"][0]["start_s"] == 8
        surface_id = surface_result["created"]["surface_id"]
        geometry_calls = [calls[0], calls[1],
            tool(10, "map_surface_bounds", scene_id="scene", surface_id=surface_id,
                 x_px=10, y_px=20, width_px=200, height_px=100, expected_revision=4),
            tool(11, "map_surface_rotate", scene_id="scene", surface_id=surface_id,
                 delta_degrees=90, expected_revision=5),
            tool(12, "map_surface_rotate", scene_id="scene", surface_id=surface_id,
                 delta_degrees=10, expected_revision=5),
            tool(13, "map_surface_rotate", scene_id="scene", surface_id=surface_id,
                 delta_degrees=360, expected_revision=6),
        ]
        geometry_process = subprocess.run(
            [sys.executable, "-m", "core.host.automation", "mcp"],
            input="\n".join(map(json.dumps, geometry_calls)) + "\n",
            text=True, capture_output=True, timeout=20, check=False,
            env={**os.environ, "AETHER_SERVER_URL": address, "AETHER_AUTOMATION_TOKEN": key},
        )
        assert geometry_process.returncode == 0, geometry_process.stderr
        geometry_replies = [json.loads(line) for line in geometry_process.stdout.splitlines()]
        bounded = geometry_replies[1]["result"]["structuredContent"]["result"]
        assert bounded["scenes"][0]["surfaces"][-1]["corners"] == [[10,20],[210,20],[210,120],[10,120]]
        assert bounded["changed_surface_ids"] == [surface_id]
        assert geometry_replies[2]["result"]["structuredContent"]["result"]["document"]["revision"] == 6
        assert geometry_replies[3]["result"]["isError"]
        assert geometry_replies[4]["result"]["isError"]
        assert client.call("run", {"id": "map.show.inspect", "arguments": target})["result"]["document"]["revision"] == 6
        assert key not in geometry_process.stdout + geometry_process.stderr

    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.parametrize(
    "content,status",
    [(b"{}", 400), (b"\xff", 400), (b"x" * (4 * 1024 * 1024 + 1), 413)],
)
def test_invalid_or_large_documents_fail_without_a_save(content, status):
    with pytest.raises(Problem) as error:
        execute("map.show.inspect", content, {})
    assert error.value.status == status


def test_worker_timeout_and_missing_runtime_are_clear(monkeypatch):
    import aether_map_service.automation as module

    monkeypatch.setattr(
        module.subprocess,
        "run",
        lambda *a, **kw: (_ for _ in ()).throw(subprocess.TimeoutExpired("node", 10)),
    )
    with pytest.raises(Problem) as error:
        execute("map.show.inspect", show_bytes(), {})
    assert error.value.status == 504
    monkeypatch.setattr(module.shutil, "which", lambda name: None)
    with pytest.raises(Problem) as error:
        execute("map.show.inspect", show_bytes(), {})
    assert error.value.status == 503


def test_native_manifest_uses_the_same_commands_and_exact_worker_bytes():
    import hashlib

    from aether_map_service import automation

    runtime = Path(automation.__file__).with_name("runtime")
    manifest = json.loads((runtime / "native-worker.json").read_text())
    assert manifest["schema"] == 1 and manifest["app"] == "map"
    assert manifest["entry"] == "runner.mjs"
    assert (
        manifest["sha256"]
        == hashlib.sha256((runtime / "runner.mjs").read_bytes()).hexdigest()
    )
    assert manifest["commands"] == [command.public() for command in automation.COMMANDS]


@pytest.mark.parametrize("write,content", [(False, False), (True, False)])
def test_creation_requires_content_edit_grant_without_saving(host, write, content):
    _, call, file, _ = host
    key = call("/api/automation/connections/create", {
        "label": "Restricted", "apps": ["map"],
        "can_write": write, "can_edit_content": content,
    })["token"]
    for command, args in [
        ("map.scene.create", {"name": "Side", "width_px": 720, "height_px": 1280}),
        ("map.surface.create", {"name": "Wall", "scene_id": "scene"}),
        ("map.surface.bounds", {"scene_id": "scene", "surface_id": "missing", "x_px": 0, "y_px": 0, "width_px": 100, "height_px": 100}),
        ("map.surface.rotate", {"scene_id": "scene", "surface_id": "missing", "delta_degrees": 90}),
        ("map.asset.place", {"asset_id": "red", "track_id": "v1", "start_s": 0}),
    ]:
        with pytest.raises(Problem) as error:
            call("/api/automation/commands/run", {"id": command, "arguments": {
                "app": "map", "id": file["id"], "expected_revision": 1, **args,
            }}, key)
        assert error.value.status == 403
    assert call("/api/library/read", {"app": "map", "id": file["id"]})["revision"] == 1


def test_creation_schema_and_worker_failures_do_not_save(host):
    _, call, file, key = host
    args = {"app": "map", "id": file["id"], "expected_revision": 1,
            "name": "Wall", "scene_id": "scene"}
    for change in [{"extra": "unknown"}, {"scene_id": "missing"}, {"name": "  "}]:
        with pytest.raises(Problem) as error:
            call("/api/automation/commands/run", {"id": "map.surface.create", "arguments": {**args, **change}}, key)
        assert error.value.status == 400
    assert call("/api/library/read", {"app": "map", "id": file["id"]})["revision"] == 1


def test_saved_asset_placement_revision_and_refusal(host):
    _, call, file, key = host
    def run(revision, **changes):
        return call("/api/automation/commands/run", {"id": "map.asset.place", "arguments": {
            "app": "map", "id": file["id"], "expected_revision": revision,
            "asset_id": "red", "track_id": "v1", "start_s": 15, **changes,
        }}, key)["result"]
    result = run(1)
    assert result["document"]["revision"] == 2
    clip = result["clips"][-1]
    assert clip["id"] == result["created"]["clip_id"]
    assert clip["asset_id"] == "red" and clip["start_s"] == 15
    for revision, changes, status in [(1, {}, 409), (2, {"track_id": "missing"}, 400),
                                       (2, {"start_s": 604800}, 400)]:
        with pytest.raises(Problem) as error:
            run(revision, **changes)
        assert error.value.status == status
    inspected = call("/api/automation/commands/run", {"id": "map.show.inspect", "arguments": {
        "app": "map", "id": file["id"]}}, key)["result"]
    assert inspected["document"]["revision"] == 2
    assert len(inspected["clips"]) == 2
