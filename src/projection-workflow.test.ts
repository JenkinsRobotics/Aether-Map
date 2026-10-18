import { describe, expect, it } from "vitest";
import { emptyShow, newSurface } from "./document";
import { parseShow, serializeShow } from "./show-file";
import { mediaUsage, removeUnusedMedia } from "./media-usage";
import { evaluateSurface } from "./playback";

describe("scene reference and timeline integrity", () => {
  it("round-trips a scene's setup photo and keeps older scenes background-free", () => {
    const show = emptyShow();
    expect(parseShow(serializeShow(show)).scenes[0].setupBackground).toBeUndefined();
    show.scenes[0].setupBackground = { mediaId: "photo", visible: false, opacity: 0.35 };
    expect(parseShow(serializeShow(show))).toEqual(show);
  });
  it("counts clip and background references before permitting media removal", () => {
    const show = emptyShow();
    const surface = newSurface(show.output, 0);
    surface.clips = [{ id: "clip", mediaId: "photo", startS: 1, durationS: 3, inS: 0, loop: true }];
    show.scenes[0].surfaces = [surface];
    show.scenes[0].setupBackground = { mediaId: "photo", visible: false, opacity: 0.5 };
    show.media = [{ id: "photo", file: "photo.png", kind: "image", name: "Photo", width: 10, height: 10, bytes: 10 }];
    expect(mediaUsage(show, "photo")).toBe(2);
    expect(removeUnusedMedia(show, "photo")).toBe(show);
    const unused = { ...show, scenes: emptyShow().scenes };
    expect(removeUnusedMedia(unused, "photo").media).toEqual([]);
  });
  it("never resurrects the static source in a timeline gap after a show cue", () => {
    const surface = newSurface(emptyShow().output, 0);
    surface.source.fill = "#ffffff";
    surface.clips = [{ id: "clip", mediaId: "photo", startS: 1, durationS: 3, inS: 0, loop: true }];
    surface.cues = [{ id: "cue", action: "show", timeS: 2 }];
    expect(evaluateSurface(surface, 2).enabled).toBe(true);
    expect(evaluateSurface(surface, 5).enabled).toBe(false);
  });
});
