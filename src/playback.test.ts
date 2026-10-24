import { describe, expect, it } from "vitest";
import { evaluateShow, evaluateSurface, showTime, transportTime } from "./playback";
import {
  activeSurfaces,
  emptyShow,
  newSurface,
  type Cue,
  type MapShow,
  type Surface,
} from "./document";

function surfaceWith(cues: Cue[], base: Partial<Surface> = {}): Surface {
  return { ...newSurface({ width: 1920, height: 1080 }, 0), ...base, cues };
}

function showOf(surfaces: Surface[], durationS = 60): MapShow {
  const show = emptyShow();
  return { ...show, scenes: [{ ...show.scenes[0], durationS, surfaces }] };
}

describe("evaluateSurface", () => {
  it("leaves a surface untouched before its first cue", () => {
    const surface = surfaceWith([{ id: "c1", timeS: 5, action: "hide" }]);
    expect(evaluateSurface(surface, 4.999).enabled).toBe(true);
  });

  it("applies a cue exactly at its own time", () => {
    const surface = surfaceWith([{ id: "c1", timeS: 5, action: "hide" }]);
    expect(evaluateSurface(surface, 5).enabled).toBe(false);
  });

  it("applies cues in time order, not array order", () => {
    // Authored out of order: the later cue wins regardless of where it sits.
    const surface = surfaceWith([
      { id: "c2", timeS: 10, action: "show" },
      { id: "c1", timeS: 5, action: "hide" },
    ]);
    expect(evaluateSurface(surface, 7).enabled).toBe(false);
    expect(evaluateSurface(surface, 12).enabled).toBe(true);
  });

  it("carries an opacity cue and clamps a bad value", () => {
    const surface = surfaceWith([
      { id: "c1", timeS: 1, action: "opacity", value: 0.25 },
      { id: "c2", timeS: 2, action: "opacity", value: 9 },
    ]);
    expect(evaluateSurface(surface, 1).opacity).toBe(0.25);
    expect(evaluateSurface(surface, 2).opacity).toBe(1);
  });

  it("leaves a surface's state alone when no cue changes anything", () => {
    const surface = surfaceWith([]);
    const resolved = evaluateSurface(surface, 100);
    expect(resolved.enabled).toBe(surface.enabled);
    expect(resolved.opacity).toBe(surface.opacity);
    expect(resolved.source).toBe(surface.source);
  });
});

describe("sequenced layers", () => {
  const media = [
    { id: "a", file: "a.mp4", name: "a", kind: "video" as const, bytes: 1, width: 640, height: 360, duration: 4 },
    { id: "b", file: "b.png", name: "b", kind: "image" as const, bytes: 1, width: 800, height: 600 },
  ];
  const sequenced = (): Surface => ({
    ...surfaceWith([]),
    source: { mediaId: null, rect: [0, 0, 1920, 1080], fill: "#ff0000" },
    clips: [
      { id: "c1", mediaId: "a", startS: 0, durationS: 10, inS: 0, loop: true },
      { id: "c2", mediaId: "b", startS: 15, durationS: 5, inS: 0, loop: true },
    ],
  });

  it("shows the clip under the playhead, sized to its asset", () => {
    const at3 = evaluateSurface(sequenced(), 3, media);
    expect(at3.enabled).toBe(true);
    expect(at3.source.mediaId).toBe("a");
    expect(at3.source.rect).toEqual([0, 0, 640, 360]);
    expect(at3.source.fill).toBeUndefined();
  });

  it("wraps a looping clip's asset time", () => {
    expect(evaluateSurface(sequenced(), 9, media).mediaTimeS).toBeCloseTo(1);
  });

  it("shows nothing in a gap between clips", () => {
    expect(evaluateSurface(sequenced(), 12, media).enabled).toBe(false);
  });

  it("switches to the next clip on time", () => {
    expect(evaluateSurface(sequenced(), 16, media).source.mediaId).toBe("b");
  });

  it("leaves an unsequenced layer on its static source", () => {
    const plain = { ...sequenced(), clips: [] };
    expect(evaluateSurface(plain, 12, media).source.fill).toBe("#ff0000");
  });

  it("evaluates a sequenced show even with no cues", () => {
    const show = showOf([sequenced()]);
    expect(evaluateShow({ ...show, media }, 12)).not.toBe(show);
    expect(activeSurfaces(evaluateShow({ ...show, media }, 12))[0].enabled).toBe(false);
  });
});

describe("evaluateShow", () => {
  it("returns the same show when nothing is cued, so renders stay cheap", () => {
    const show = showOf([surfaceWith([])]);
    expect(evaluateShow(show, 42)).toBe(show);
  });

  it("evaluates every cued surface independently", () => {
    const show = showOf([
      surfaceWith([{ id: "a", timeS: 1, action: "hide" }], { id: "s1" }),
      surfaceWith([{ id: "b", timeS: 3, action: "hide" }], { id: "s2" }),
    ]);
    expect(activeSurfaces(evaluateShow(show, 2)).map((s) => s.enabled)).toEqual([
      false,
      true,
    ]);
  });
});

describe("showTime", () => {
  it("wraps in loop mode", () => {
    const show = { ...showOf([], 10), playback: { mode: "loop" as const } };
    expect(showTime(show, 0)).toBe(0);
    expect(showTime(show, 9.5)).toBeCloseTo(9.5);
    expect(showTime(show, 10)).toBeCloseTo(0);
    expect(showTime(show, 23)).toBeCloseTo(3);
  });

  it("holds at the end in once mode", () => {
    const show = { ...showOf([], 10), playback: { mode: "once" as const } };
    expect(showTime(show, 23)).toBe(10);
  });

  it("survives a zero duration rather than dividing by zero", () => {
    const show = showOf([], 0);
    expect(Number.isFinite(showTime(show, 5))).toBe(true);
  });
});

describe("transportTime", () => {
  it("holds still while paused", () => {
    const transport = { playing: false, timeS: 4, anchorMs: 1000 };
    expect(transportTime(transport, 99000)).toBe(4);
  });

  it("advances with the wall clock while playing", () => {
    const transport = { playing: true, timeS: 4, anchorMs: 1000 };
    expect(transportTime(transport, 3500)).toBeCloseTo(6.5);
  });

  it("never runs backwards if the anchor is in the future", () => {
    // Two windows' clocks are the same clock, but be defensive: a negative
    // elapsed time would make the projector jump backwards mid-show.
    const transport = { playing: true, timeS: 4, anchorMs: 9000 };
    expect(transportTime(transport, 1000)).toBe(4);
  });
});

it('mapping preview resolves clips while keeping geometry fixed and gaps editable', async () => {
  const { mappingSurfaceAt } = await import('./playback');
  const s = surfaceWith([], { animation: { xPx: [
    { id: 'a', timeS: 0, value: 0, interpolation: 'linear' }, { id: 'b', timeS: 10, value: 500, interpolation: 'linear' },
  ] }, clips: [{ id: 'picture', startS: 2, durationS: 3, inS: 1, loop: false,
    source: { mediaId: null, rect: [0, 0, 100, 100], fill: '#ff0000' } }] });
  expect(mappingSurfaceAt(s, 3, [], true).source.fill).toBe('#ff0000');
  expect(mappingSurfaceAt(s, 3, [], true).corners).toEqual(s.corners);
  expect(mappingSurfaceAt(s, 3, [], true).mediaTimeS).toBe(2);
  expect(mappingSurfaceAt(s, 8, [], true).enabled).toBe(true);
  expect(mappingSurfaceAt(s, 8, [], true).source.fill).toBeUndefined();
  expect(mappingSurfaceAt(s, 3, [], false).source).toEqual(s.source);
});
