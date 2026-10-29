import { describe, expect, it } from "vitest";
import { emptyShow, newScene } from "./document";
import { parseShow, serializeShow } from "./show-file";
import { HOTKEYS, outputForHotkey, sceneForHotkey } from "./scene-hotkeys";

describe("scene hotkeys", () => {
  const show = emptyShow();
  const movie = { ...newScene("Movie"), hotkey: "F2" as const };
  show.scenes = [{ ...show.scenes[0], hotkey: "F1" }, movie];
  it("saves a scene's function key and drops anything else", () => {
    expect(parseShow(serializeShow(show)).scenes.map(s => s.hotkey)).toEqual(["F1", "F2"]);
    const bad = { ...show, scenes: [{ ...movie, hotkey: "a" as never }] };
    expect(parseShow(serializeShow(bad)).scenes[0].hotkey).toBeUndefined();
    expect(HOTKEYS).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"]);
  });
  it("finds the scene for a key and points the output at it", () => {
    expect(sceneForHotkey(show, "F2")).toBe(movie.id);
    expect(sceneForHotkey(show, "F9")).toBeNull();
    const output = show.outputs[0];
    expect(outputForHotkey(output, movie.id)?.sceneId).toBe(movie.id);
    expect(outputForHotkey(output, null)).toBe(output);
  });
});
