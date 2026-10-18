import { expect, test } from "vitest";
import { emptyShow, findOutput, newOutput, newSurface, sceneLayers, showForOutput, type MapShow } from "./document";
import { newFeature } from "./features/new-feature";
import { parseShow, serializeShow } from "./show-file";
import { sceneCrop } from "./output-crop";
import { sceneSize } from "./scene-size";
import { outputConnection } from "./output-connection";
import type { MapDevice } from "./api";

const legacy = {
  version: 2,
  output: { width: 1920, height: 1080, crop: { xPx: 100, yPx: 50, widthPx: 800, heightPx: 600, fit: "contain" } },
  media: [], activeSceneId: "s1", playback: { mode: "continuous" },
  scenes: [{ id: "s1", name: "Scene 1", durationS: 10, surfaces: [] }],
} as unknown as MapShow;

test("a show written before outputs were a list keeps the projector it was authored for", () => {
  const show = parseShow(serializeShow(legacy));
  expect(show.outputs).toHaveLength(1);
  expect(show.outputs[0]).toMatchObject({ id: "output-1", name: "Output 1", kind: "monitor" });
  expect(show.outputs[0].crop).toMatchObject({ xPx: 100, yPx: 50, widthPx: 800, heightPx: 600 });
  // An output renders only the scene it is bound to, and this file predates
  // that rule — so it is bound to the scene it was showing when it was saved
  // rather than opening dark.
  expect(show.outputs[0].sceneId).toBe("s1");
});

test("new and legacy shows start with an output", () => {
  expect(emptyShow().outputs).toHaveLength(1);
  const bare = parseShow(serializeShow({ ...legacy, output: { width: 1920, height: 1080 } } as unknown as MapShow));
  expect(bare.outputs).toHaveLength(1);
  expect(bare.outputs[0].crop).toBeUndefined();
});

test("outputs round-trip, and each keeps its own scene and region", () => {
  const show = emptyShow();
  const second = show.scenes[0];
  show.scenes = [second, { ...second, id: "s2", name: "Lobby", surfaces: [], artboard: { widthPx: 1080, heightPx: 1920 } }];
  show.outputs = [
    { ...show.outputs[0], crop: { xPx: 0, yPx: 0, widthPx: 960, heightPx: 1080, fit: "contain" } },
    { ...newOutput("Lobby TV", "s2", "cast"), id: "out-lobby" },
  ];
  const reopened = parseShow(serializeShow(show));
  expect(reopened.outputs.map((o) => [o.name, o.kind, o.sceneId])).toEqual([
    ["Output 1", "monitor", reopened.scenes[0].id], ["Lobby TV", "cast", "s2"],
  ]);
  // Each window renders its own scene by rebinding the active one, so sizing
  // and evaluation need no notion of which output is asking.
  const lobby = findOutput(reopened, "out-lobby")!;
  expect(showForOutput(reopened, lobby).activeSceneId).toBe("s2");
  expect(sceneSize(showForOutput(reopened, lobby))).toEqual({ width: 1080, height: 1920 });
  expect(showForOutput(reopened, reopened.outputs[0]).activeSceneId).toBe(reopened.activeSceneId);
  // And its own region: the first output crops, the lobby shows its whole scene.
  expect(sceneCrop({ ...reopened.output, crop: reopened.outputs[0].crop }).widthPx).toBe(960);
  expect(sceneCrop({ ...reopened.output, crop: lobby.crop }).widthPx).toBe(1920);
});

test("an output pointed at a deleted scene is rebound to the active one rather than going dark", () => {
  const show = emptyShow();
  show.outputs = [{ ...show.outputs[0], sceneId: "scene-that-was-deleted" }];
  const reopened = parseShow(serializeShow(show));
  expect(reopened.outputs[0].sceneId).toBe(reopened.activeSceneId);
  expect(showForOutput(reopened, reopened.outputs[0]).activeSceneId).toBe(reopened.activeSceneId);
});

test("an output with no scene linked renders nothing — nothing is connected to it", () => {
  const show = emptyShow();
  const dark = { ...show.outputs[0], sceneId: undefined };
  expect(sceneLayers(showForOutput(show, dark))).toEqual([]);
  // And it survives a round trip as dark, rather than being re-bound the way a
  // pre-version-3 file's unbound output is.
  const reopened = parseShow(serializeShow({ ...show, outputs: [dark] }));
  expect(reopened.outputs[0].sceneId).toBeUndefined();
  expect(sceneLayers(showForOutput(reopened, reopened.outputs[0]))).toEqual([]);
});

test("an output bound to a suppressed scene goes dark, because the show will not play it", () => {
  const show = emptyShow();
  const suppressed = { ...show, scenes: [{ ...show.scenes[0], suppressed: true }] };
  expect(sceneLayers(showForOutput(suppressed, suppressed.outputs[0]))).toEqual([]);
  // The canvas still draws it: suppression takes a scene out of the show, not
  // off the desk of whoever is still building it.
  expect(sceneLayers(suppressed, { editor: true })).toHaveLength(1);
});

test("a hidden scene is editor-only — it still plays and still reaches its output", () => {
  const show = emptyShow();
  const hidden = { ...show, scenes: [{ ...show.scenes[0], hidden: true }] };
  expect(sceneLayers(showForOutput(hidden, hidden.outputs[0]))).toHaveLength(1);
});

test("findOutput answers for a window that names nothing, so a deployed device still plays", () => {
  const show = emptyShow();
  expect(findOutput(show, null)).toBe(show.outputs[0]);
  expect(findOutput(show, "no-such-output")).toBe(show.outputs[0]);
});

test("a row reports what an output is actually reaching, not what it is configured for", () => {
  const show = emptyShow();
  const monitor = show.outputs[0];
  const edge = { ...newOutput("Porch", show.activeSceneId, "edge"), deviceId: "pi-1" };
  const pi = { id: "pi-1", name: "Porch Pi", seen: 0, document: "show-1", mine: true } as MapDevice;
  const up = () => true, down = () => false;

  // A window output is live exactly while its window is open.
  expect(outputConnection(monitor, undefined, undefined, up, "show-1")).toMatchObject({ live: false });
  expect(outputConnection(monitor, { width: 960, height: 540, fullscreen: true }, undefined, up, "show-1"))
    .toMatchObject({ live: true, label: expect.stringContaining("960 × 540") });

  // An edge output needs its player online AND playing this show: an online
  // player running something else is not this output's picture.
  expect(outputConnection(edge, undefined, pi, up, "show-1")).toMatchObject({ live: true });
  expect(outputConnection(edge, undefined, pi, down, "show-1")).toMatchObject({ live: false, label: "Porch Pi is offline" });
  expect(outputConnection(edge, undefined, { ...pi, document: "other-show" }, up, "show-1")).toMatchObject({ live: false });
  expect(outputConnection(edge, undefined, { ...pi, document: null }, up, "show-1")).toMatchObject({ live: false });
  // No device chosen yet: nothing to report, so the row shows no link at all.
  expect(outputConnection({ ...edge, deviceId: undefined }, undefined, undefined, up, "show-1")).toBeNull();
  // An open window never makes an edge output live — it is a different path.
  expect(outputConnection(edge, { width: 960, height: 540, fullscreen: false }, undefined, up, "show-1")).toBeNull();
});

test("a new surface is square and centred whatever the scene's aspect", () => {
  // A square start means the projection grid reads as square cells, so the first
  // thing you do is warp onto the wall, not un-stretch the artboard.
  for (const scene of [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { width: 1000, height: 1000 }]) {
    const [tl, tr, br, bl] = newSurface(scene, 0).corners;
    expect(tr[0] - tl[0]).toBe(bl[1] - tl[1]);
    expect(br[0] - bl[0]).toBe(tr[0] - tl[0]);
    // Centred: the margins match on each axis.
    expect(tl[0]).toBe(scene.width - tr[0]);
    expect(tl[1]).toBe(scene.height - bl[1]);
  }
  // The source box matches the quad, so nothing is pre-distorted.
  const [, , w, h] = newSurface({ width: 1920, height: 1080 }, 0).source.rect;
  expect(w).toBe(h);
  // Cascade: a second surface is offset, not stacked exactly on the first.
  expect(newSurface({ width: 1920, height: 1080 }, 1).corners[0])
    .not.toEqual(newSurface({ width: 1920, height: 1080 }, 0).corners[0]);
});

test("a new shader surface starts on the animated mesh gradient", () => {
  const surface = newFeature("shader", { width: 1920, height: 1080 }, 0);
  expect(surface.source.shader?.preset).toBe("mesh-gradient");
  // speed drives `frame` from the show clock, so it animates as the show plays.
  expect(surface.source.shader?.parameters.speed).toBe(1);
  expect(surface.source.shader?.colors.length).toBeGreaterThan(0);
  // A recipe, not an asset: nothing lands in the media store.
  expect(surface.source.mediaId).toBeNull();
});


test("deleting every output survives save/reopen without losing scenes or surfaces", () => {
  const show = emptyShow();
  show.scenes[0].surfaces = [newFeature("surface", show.output, 0)];
  const reopened = parseShow(serializeShow({ ...show, outputs: [] }));
  expect(reopened.outputs).toEqual([]);
  expect(reopened.scenes).toEqual(show.scenes);
  expect(findOutput(reopened, null)).toBeUndefined();
});
