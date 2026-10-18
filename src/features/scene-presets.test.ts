import { expect, test } from "vitest";
import { OCCASIONS, SCENE_PRESETS } from "./scene-presets";
import { SHADERS } from "./shader-catalog";
import { emptyShow } from "../document";
import { parseShow, serializeShow } from "../show-file";

const output = { width: 1920, height: 1080 };

test("every ready-made scene is projectable the moment it is added", () => {
  expect(SCENE_PRESETS.length).toBeGreaterThan(0);
  for (const preset of SCENE_PRESETS) {
    const scene = preset.build(output);
    expect(scene.surfaces).toHaveLength(1);
    const surface = scene.surfaces[0];
    // Full-bleed: a starting scene covers the projector rather than sitting in
    // the middle of it waiting to be stretched.
    expect(surface.corners).toEqual([[0, 0], [1920, 0], [1920, 1080], [0, 1080]]);
    // Generative: nothing to download, nothing to go missing from a saved show.
    expect(surface.source.mediaId).toBeNull();
    const shader = surface.source.shader;
    expect(shader).toBeDefined();
    // A preset naming an effect the catalog does not have would render as the
    // fallback and quietly look wrong.
    expect(SHADERS.some((entry) => entry.id === shader!.preset)).toBe(true);
    expect(shader!.colors.length).toBeGreaterThan(0);
    expect(scene.id).toBeTruthy();
  }
  // Distinct ids, or the picker would add the same scene twice.
  expect(new Set(SCENE_PRESETS.map((p) => p.id)).size).toBe(SCENE_PRESETS.length);
});

test("a ready-made scene survives a save, its motion included", () => {
  const show = emptyShow();
  const scene = SCENE_PRESETS.find((p) => p.id === "haunted-fog")!.build(show.output);
  show.scenes = [...show.scenes, scene];
  const reopened = parseShow(serializeShow(show));
  const saved = reopened.scenes.find((entry) => entry.id === scene.id)!;
  expect(saved.surfaces[0].source.shader?.preset).toBe("smoke-ring");
  // Its audio modulation carries no period; the parser must not drop it.
  expect(saved.surfaces[0].source.shader?.modulation?.scale).toMatchObject({ source: "audio", band: "low" });
});

test("a preset sized to a portrait scene fills that scene, not a default one", () => {
  const scene = SCENE_PRESETS[0].build({ width: 1080, height: 1920 });
  expect(scene.surfaces[0].corners).toEqual([[0, 0], [1080, 0], [1080, 1920], [0, 1920]]);
  expect(scene.artboard).toEqual({ widthPx: 1080, heightPx: 1920 });
});

test("the library covers every occasion the picker offers, with no empty section", () => {
  for (const occasion of OCCASIONS) {
    expect(SCENE_PRESETS.filter((preset) => preset.occasion === occasion).length).toBeGreaterThan(0);
  }
  // Every preset belongs to a section, or the picker would silently hide it.
  for (const preset of SCENE_PRESETS) expect(OCCASIONS).toContain(preset.occasion);
});

test("a face tracker saves its subject, and a show that predates faces still means hands", async () => {
  const { emptyShow: blank } = await import("../document");
  const { newFeature: feature } = await import("./new-feature");
  const show = blank();
  const surface = feature("tracker", show.output, 0);
  surface.source.tracker = { ...surface.source.tracker!, subject: "face" };
  show.scenes[0].surfaces = [surface];
  expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].source.tracker?.subject).toBe("face");

  const legacy = JSON.parse(new TextDecoder().decode(serializeShow(show)));
  delete legacy.scenes[0].surfaces[0].source.tracker.subject;
  expect(parseShow(JSON.stringify(legacy)).scenes[0].surfaces[0].source.tracker?.subject).toBeUndefined();
  // And a nonsense subject is not handed to a model loader.
  legacy.scenes[0].surfaces[0].source.tracker.subject = "elbows";
  expect(parseShow(JSON.stringify(legacy)).scenes[0].surfaces[0].source.tracker?.subject).toBeUndefined();
});
