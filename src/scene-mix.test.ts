import { expect, test } from "vitest";
import { emptyShow, sceneLayers, type MapShow } from "./document";
import { parseShow, serializeShow } from "./show-file";

const twoScenes = (): MapShow => {
  const show = emptyShow();
  show.scenes = [show.scenes[0], { ...show.scenes[0], id: "b", name: "Scene B", surfaces: [] }];
  return show;
};

test("without a crossfade a show is one scene at full strength", () => {
  const show = twoScenes();
  expect(sceneLayers(show)).toEqual([{ scene: show.scenes[0], opacity: 1, active: true }]);
  // A B scene that is the active scene is not a crossfade either.
  show.mix = { sceneId: show.activeSceneId, blend: 0.5 };
  expect(sceneLayers(show)).toHaveLength(1);
});

test("the fader mixes two scenes, and each end costs what one scene costs", () => {
  const show = twoScenes();
  show.mix = { sceneId: "b", blend: 0.25 };
  const layers = sceneLayers(show);
  expect(layers.map((l) => [l.scene.id, l.opacity])).toEqual([[show.scenes[0].id, 0.75], ["b", 0.25]]);
  // At either end the far scene is dropped, not drawn invisibly.
  show.mix.blend = 0;
  expect(sceneLayers(show).map((l) => l.scene.id)).toEqual([show.scenes[0].id]);
  show.mix.blend = 1;
  expect(sceneLayers(show).map((l) => l.scene.id)).toEqual(["b"]);
  expect(sceneLayers(show)[0].active).toBe(false);
  // A blend outside 0..1 cannot invert or over-drive the mix.
  show.mix.blend = 4;
  expect(sceneLayers(show).map((l) => l.opacity)).toEqual([1]);
  show.mix.blend = -2;
  expect(sceneLayers(show).map((l) => l.opacity)).toEqual([1]);
});

test("a mix saves, and a deleted B scene collapses it rather than blanking the show", () => {
  const show = twoScenes();
  show.mix = { sceneId: "b", blend: 0.4 };
  expect(parseShow(serializeShow(show)).mix).toEqual({ sceneId: "b", blend: 0.4 });
  const orphaned = JSON.parse(new TextDecoder().decode(serializeShow(show)));
  orphaned.scenes = [orphaned.scenes[0]];
  const reopened = parseShow(JSON.stringify(orphaned));
  expect(reopened.mix).toBeUndefined();
  expect(sceneLayers(reopened)).toHaveLength(1);
});
