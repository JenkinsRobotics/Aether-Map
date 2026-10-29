import { STAGE_GENERATORS } from './stage-shaders';
import { describe, expect, it } from "vitest";
import { emptyShow, newSurface, quadCorners } from "../document";
import { evaluateShow, evaluateSurface } from "../playback";
import { parseShow, serializeShow } from "../show-file";
import { cropTransform } from "../output-crop";
import { animateSurface, geometryHandleDelta, keyframeValue, putKeyframe } from "./animation";
import { DEFAULT_TRACKER, type FeatureKeyframe, type HandSample } from "./types";
import { newFeature } from "./new-feature";
import { newShader, SHADERS, shaderOptions } from "./shader-catalog";
import { trackingHands } from "../live/tracking-frames";
import { sourcePictureStyle } from "../source-picture";

const key = (id: string, timeS: number, value: number, interpolation: FeatureKeyframe["interpolation"] = "linear"): FeatureKeyframe => ({ id, timeS, value, interpolation });
describe("projection feature animation", () => {
  it("evaluates sorted linear, eased and stepped segments with held endpoints", () => {
    const keys = [key("b", 10, 1), key("a", 0, 0)];
    expect(keyframeValue(keys, 2, 8)).toBe(.2);
    expect(keyframeValue(keys, -1, 8)).toBe(0);
    expect(keyframeValue(keys, 20, 8)).toBe(1);
    expect(keyframeValue([key("a", 0, 0, "smooth"), keys[0]], 2, 8)).toBeCloseTo(.104);
    expect(keyframeValue([key("a", 0, 0, "hold"), keys[0]], 9.99, 8)).toBe(0);
    expect(keyframeValue([key("a", 0, 0, "hold"), keys[0]], 10, 8)).toBe(1);
  });
  it("replaces a key at an occupied time and moves by stable identity", () => {
    expect(putKeyframe([key("a", 0, 0), key("b", 2, 1)], key("b", 0, .3))).toEqual([key("b", 0, .3)]);
  });
  it("transforms the entire warp and its outline, identically in whole-show evaluation", () => {
    const show = emptyShow(), surface = newSurface(show.output, 0);
    surface.corners = quadCorners([0, 0, 100, 100]); surface.masks = [[[0, 0], [100, 0], [0, 100]]];
    surface.animation = { xPx: [key("a", 0, 0), key("b", 10, 200)], opacity: [key("o", 0, 1), key("p", 10, 0)] };
    show.scenes[0].surfaces = [surface];
    const rendered = evaluateShow(show, 5).scenes[0].surfaces[0];
    expect(rendered.corners[0]).toEqual([100, 0]); expect(rendered.masks[0][0]).toEqual([100, 0]); expect(rendered.opacity).toBe(.5);
    expect(surface.corners[0]).toEqual([0, 0]);
  });
  it("animation does not resurrect a clip gap or disabled layer", () => {
    const s = newFeature("shader", emptyShow().output, 0);
    s.clips = [{ id: "k", mediaId: "m", startS: 0, durationS: 1, inS: 0, loop: true }];
    s.animation = { opacity: [key("a", 0, 1)] };
    expect(evaluateSurface(s, 2).enabled).toBe(false);
    expect(animateSurface({ ...s, enabled: false }, 0).enabled).toBe(false);
  });
  it("moves a rotated and scaled corner in the direction the operator drags", () => {
    const surface = newFeature("text", emptyShow().output, 0);
    surface.transform = { xPx: 200, yPx: 100, scaleX: 2, scaleY: .5, rotationDeg: 75 };
    const before = animateSurface(surface, 0).corners[0];
    const delta = geometryHandleDelta(surface, 0, [10, 20], true);
    surface.corners[0] = [surface.corners[0][0] + delta[0], surface.corners[0][1] + delta[1]];
    const after = animateSurface(surface, 0).corners[0];
    expect(after[0] - before[0]).toBeCloseTo(10); expect(after[1] - before[1]).toBeCloseTo(20);
  });
});
describe("saved feature contracts", () => {
  it("round trips all six feature kinds, generated parameters, typography, keyframes, locks and crop", () => {
    const show = emptyShow();
    show.scenes[0].surfaces = (["surface", "mask", "text", "shader", "webcam", "tracker"] as const).map((kind, i) => newFeature(kind, show.output, i));
    const text = show.scenes[0].surfaces[2];
    text.source.text = { ...text.source.text!, fontFamily: "serif", fontWeight: 700, italic: true, lineHeight: 1.5, letterSpacingPx: 3 };
    text.shape = "ellipse"; text.radiusPx = 10; text.locked = true; text.animation = { rotationDeg: [key("r", 0, 45)] };
    show.output.crop = { xPx: 300, yPx: 90, widthPx: 800, heightPx: 600, fit: "contain" };
    expect(parseShow(serializeShow(show))).toEqual(show);
  });
  it("round trips a cast surface", () => {
    const show = emptyShow();
    show.scenes[0].surfaces = [newFeature("cast", show.output, 0)];
    expect(show.scenes[0].surfaces[0].source.cast).toBe(true);
    expect(parseShow(serializeShow(show))).toEqual(show);
  });
  it("ships the 27 observed upstream shaders plus Aether's own, with valid defaults and mode options", () => {
    // The upstream catalog is pinned: losing one silently would break every show
    // that used it. Ours are additions and are named, so the count alone can no
    // longer drift without somebody saying which effect changed.
    const OURS = [...STAGE_GENERATORS.map(g=>g.id), "kaleidoscope", "tunnel", "neon-beams", "synthwave", "pixel-mosaic", "contour-lines", "starfield", "aurora", "snowfall", "heart-confetti", "watchful-eye", "jack-lantern", "moonlit-window"];
    const ids = SHADERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !OURS.includes(id))).toHaveLength(27);
    for (const id of OURS) expect(ids).toContain(id);
    for (const shader of SHADERS) {
      const source = newShader(shader.id); expect(source.preset).toBe(shader.id);
      for (const [key, value] of Object.entries(source.parameters)) {
        if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
        const options = shaderOptions(shader.id, key);
        if (options) expect(options).toContain(String(value));
      }
    }
  });
  it("ignores unsafe shader component props when reading a file", () => {
    const show = emptyShow(), s = newFeature("shader", show.output, 0); show.scenes[0].surfaces = [s];
    s.source.shader!.parameters = { children: "bad", ref: "bad", distortion: .4 };
    expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].source.shader?.parameters).toEqual({ distortion: .4 });
  });
});
describe("output regions and recorded tracking", () => {
  it("crops original media pixels before the warp instead of resizing the whole image into the crop", () => {
    const surface = newSurface({ width: 200, height: 200 }, 0);
    surface.corners = quadCorners([0, 0, 200, 200]);
    surface.source = { mediaId: "image", rect: [160, 0, 160, 180] };
    const media = { id: "image", file: "image.png", name: "Image", bytes: 100, kind: "image" as const, width: 320, height: 180 };
    const style = sourcePictureStyle(surface, media);
    expect(style.width).toBe(320); expect(style.height).toBe(180);
    expect(style.clipPath).toBe("inset(0px 0px 0px 160px round 0px)");
    surface.clips = [{ id: "clip", mediaId: media.id, startS: 0, durationS: 10, inS: 0, loop: true }];
    expect(evaluateSurface(surface, 5, [media]).source.rect).toEqual([160, 0, 160, 180]);
    surface.shape = "ellipse";
    expect(sourcePictureStyle(surface, media).clipPath).toBe("ellipse(80px 90px at 240px 90px)");
  });
  it("maps the chosen crop origin to the output origin without changing scene geometry", () => {
    expect(cropTransform({ xPx: 300, yPx: 200, widthPx: 400, heightPx: 300, fit: "contain" }, { width: 800, height: 600 })).toBe("translate(-600px, -400px) scale(2, 2)");
    expect(cropTransform({ xPx: 0, yPx: 0, widthPx: 400, heightPx: 300, fit: "contain" }, { width: 1000, height: 600 })).toBe("translate(100px, 0px) scale(2, 2)");
  });
  it("replays hand presence/absence by scene time, loops or holds, and filters side/count", () => {
    const hand: HandSample = { side: "Left", points: Array.from({ length: 21 }, () => [.5, .5, 0]) };
    const source = { ...DEFAULT_TRACKER, recording: { durationS: 2, loop: true, frames: [{ timeS: 0, hands: [hand] }, { timeS: 1, hands: [] }] } };
    expect(trackingHands(source, .5, [])).toEqual([hand]); expect(trackingHands(source, 1.5, [hand])).toEqual([]);
    expect(trackingHands(source, 2.5, [])).toEqual([hand]);
    expect(trackingHands({ ...source, hand: "right" }, .5, [])).toEqual([]);
    expect(trackingHands({ ...source, recording: { ...source.recording, loop: false } }, 3, [hand])).toEqual([]);
  });
});
