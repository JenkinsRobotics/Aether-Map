"""Run with `python3 scripts/agent-pipeline-check.py` after `npm run build:automation`.
Drive every Map agent command through the built product worker (runner.mjs),
the same process Studio's command gateway runs. Builds a demo show, then
exercises the remaining commands on a scratch copy."""
import json, subprocess, sys
from pathlib import Path

MAP = Path(__file__).resolve().parents[1]
RUNNER = MAP / "service/aether_map_service/runtime/runner.mjs"
seen, log = set(), []

def run(cmd, content, **args):
    seen.add(cmd)
    out = subprocess.run(["node", "--max-old-space-size=256", str(RUNNER)], capture_output=True, text=True, timeout=10,
                         input=json.dumps({"command": cmd, "content": content, "arguments": args}))
    reply = json.loads(out.stdout)
    if "error" in reply:
        raise SystemExit(f"FAIL {cmd} {args}: {reply['error']}")
    log.append(f"ok  {cmd}")
    return reply.get("content") or content, reply["result"]

def created(result): return result.get("created", result)

empty = (MAP / "service/tests/fixtures/automation-show.aethermap").read_text()
docs = run("map.agent.docs", empty)[1]
assert docs["total"] == 19, docs["total"]
src = {s["kind"] for s in run("map.agent.docs", empty, topic="sources")[1]["sources"]}
assert {"cast", "web"} <= src, src
gallery = run("map.agent.docs", empty, topic="gallery", query="neon")[1]["items"][0]["id"]

# --- Demo show: one backdrop across a wall, a cast screen, and a Disney+ scene.
show = empty
# The show opens on its active scene, so the backdrop goes there; its test clip goes.
backdrop = json.loads(show)["activeSceneId"]
show, _ = run("map.clip.edit", show, clip_id="clip", action="delete")
show, _ = run("map.scene.hotkey", show, scene_id=backdrop, hotkey="F1")
show, r = run("map.scene.create", show, name="Movie", width_px=1920, height_px=1080); movie = created(r)["scene_id"]
show, _ = run("map.scene.hotkey", show, scene_id=movie, hotkey="F2")
ids = {}
for scene, label in ((backdrop, "b"), (movie, "m")):
    show, r = run("map.surface.create", show, scene_id=scene, name="Wall"); ids[label + "wall"] = created(r)["surface_id"]
    show, _ = run("map.surface.bounds", show, scene_id=scene, surface_id=ids[label + "wall"], x_px=0, y_px=0, width_px=1920, height_px=1080)
    show, r = run("map.surface.create", show, scene_id=scene, name="Screen"); ids[label + "screen"] = created(r)["surface_id"]
    show, _ = run("map.surface.bounds", show, scene_id=scene, surface_id=ids[label + "screen"], x_px=560, y_px=300, width_px=800, height_px=450)

def visual(show, scene, name, source, surfaces):
    show, r = run("map.visual.create", show, scene_id=scene, name=name, source_json=json.dumps(source))
    clip = created(r)["clip_id"]
    show, _ = run("map.visual.edit", show, clip_id=clip, changes_json=json.dumps({"targets": [{"scene_id": scene, "surface_id": s} for s in surfaces]}))
    return show, clip

show, wash_b = visual(show, backdrop, "Backdrop", {"kind": "gallery", "id": gallery}, [ids["bwall"]])
show, wash_m = visual(show, movie, "Backdrop", {"kind": "gallery", "id": gallery}, [ids["mwall"]])
show, _ = visual(show, backdrop, "Phone cast", {"kind": "cast"}, [ids["bscreen"]])
show, _ = visual(show, movie, "Disney+", {"kind": "web", "url": "https://www.disneyplus.com"}, [ids["mscreen"]])
show, _ = run("map.surface.animate", show, scene_id=backdrop, surface_id=ids["bscreen"], changes_json=json.dumps({"bases": {"opacity": 1}}))

for scene in (backdrop, movie):
    for t in (0, 30):
        _, v = run("map.show.verify", show, scene_id=scene, time_s=t)
        assert v["valid"] and v["layer_count"] >= 2, v
    _, e = run("map.show.evaluate", show, scene_id=scene, time_s=5)
_, inspected = run("map.show.inspect", show)
scenes = {s["name"]: s for s in inspected["scenes"]}
assert scenes["Main scene"].get("hotkey") == "F1" and scenes["Movie"].get("hotkey") == "F2", "hotkey missing from inspect"
Path(sys.argv[1] if len(sys.argv) > 1 else MAP / "demos/projector-cast-and-movie.aethermap").write_text(show)

# --- Scratch copy: every remaining command.
s = show
s, r = run("map.surface.create", s, scene_id=backdrop, name="Cube", shape="cube")
s, _ = run("map.cube.pose", s, scene_id=backdrop, surface_id=created(r)["surface_id"], mode="rotate", y_degrees=20)
s, _ = run("map.surface.rotate", s, scene_id=backdrop, surface_id=ids["bscreen"], delta_degrees=5)
asset = next(c for c in run("map.show.inspect", s)[1]["clips"] if c["id"] == wash_b)
s, _ = run("map.visual.edit", s, clip_id=wash_b, changes_json=json.dumps({"continuous": False, "duration_s": 60}))
s, _ = run("map.clip.edit", s, clip_id=wash_b, action="split", time_s=30)
s, _ = run("map.clip.edit", s, clip_id=wash_m, action="duplicate")
clips = run("map.show.inspect", s)[1]["clips"]
moved = next(c for c in clips if c["id"] != wash_b and c.get("name") == "Backdrop")
s, _ = run("map.clip.move", s, clip_id=moved["id"], track_id=moved["track_id"], start_s=moved["start_s"] + 1)
s, _ = run("map.asset.place", s, asset_id=asset["asset_id"], track_id=asset["track_id"], start_s=200)
canvas = run("map.show.inspect", s)[1]["show"]["tracks"][1]["canvas_id"]
s, _ = run("map.show.clip.add", s, canvas_id=canvas, scene_id="main", start_s=60, duration_s=60, loop="yes")
s, _ = run("map.show.cue.add", s, name="Go to movie", trigger="go", cue_action="play")
recipe = run("map.agent.docs", empty, topic="recipes")[1]["recipe"]
s, _ = run("map.show.runprogram", s, program_json=json.dumps(recipe))

missing = ({i["id"] for i in docs["items"]} | set(json.loads(json.dumps([c["id"] for c in json.load(open(MAP / "service/aether_map_service/automation-commands.json"))])))) - seen
print("\n".join(log[-6:]))
print(f"{len(seen)}/19 commands ran; missing: {sorted(missing) or 'none'}; {len(log)} calls")

# --- Second demo: a three-face cube with a different generator on each face, over a backdrop.
cube = empty
scene = json.loads(cube)["activeSceneId"]
cube, _ = run("map.clip.edit", cube, clip_id="clip", action="delete")
cube, r = run("map.surface.create", cube, scene_id=scene, name="Backdrop wall"); wall = created(r)["surface_id"]
cube, _ = run("map.surface.bounds", cube, scene_id=scene, surface_id=wall, x_px=0, y_px=0, width_px=1920, height_px=1080)
cube, r = run("map.surface.create", cube, scene_id=scene, name="Cube", shape="cube"); faces = created(r)["surface_ids"]
cube, _ = run("map.cube.pose", cube, scene_id=scene, surface_id=faces[0], mode="rotate", x_degrees=-15, y_degrees=25)
cube, _ = visual(cube, scene, "Backdrop", {"kind": "gallery", "id": "mesh-gradient:0"}, [wall])
for face, generator in zip(faces, ("metaballs:0", "voronoi:1", "swirl:2")):
    cube, _ = visual(cube, scene, generator.split(":")[0].title(), {"kind": "gallery", "id": generator}, [face])
_, v = run("map.show.verify", cube, scene_id=scene, time_s=5)
assert v["valid"] and v["layer_count"] == 4, v
Path(MAP / "demos/cube-generators.aethermap").write_text(cube)
print("cube demo: 1 backdrop + 3 cube faces, each its own generator")

# --- Third demo: the same cube in static gradients, for players without usable WebGL (a Pi 2).
flat = empty
scene = json.loads(flat)["activeSceneId"]
flat, _ = run("map.clip.edit", flat, clip_id="clip", action="delete")
flat, r = run("map.surface.create", flat, scene_id=scene, name="Backdrop wall"); wall = created(r)["surface_id"]
flat, _ = run("map.surface.bounds", flat, scene_id=scene, surface_id=wall, x_px=0, y_px=0, width_px=1920, height_px=1080)
flat, r = run("map.surface.create", flat, scene_id=scene, name="Cube", shape="cube"); faces = created(r)["surface_ids"]
flat, _ = run("map.cube.pose", flat, scene_id=scene, surface_id=faces[0], mode="rotate", x_degrees=-15, y_degrees=25)
flat, _ = visual(flat, scene, "Backdrop", {"kind": "gradient", "colors": ["#241d9a", "#9f50d3", "#f75092"], "angle_degrees": 135}, [wall])
for face, colors in zip(faces, (["#ffc105", "#ff5500"], ["#00ffff", "#1f6feb"], ["#fefff0", "#ff8b61"])):
    flat, _ = visual(flat, scene, "Face", {"kind": "gradient", "colors": colors}, [face])
_, v = run("map.show.verify", flat, scene_id=scene, time_s=5)
assert v["valid"] and v["layer_count"] == 4, v
d = json.loads(flat); d["playback"] = {"mode": "loop"}  # ponytail: no agent command sets playback yet
Path(MAP / "demos/cube-static.aethermap").write_text(json.dumps(d, indent=2) + "\n")
print("static cube demo: gradients only, no WebGL")
