import { describe, expect, it } from "vitest";
import {
  IMAGE_HOLD_S,
  MIN_CLIP_S,
  clipAt,
  mediaTime,
  moveClip,
  placeClip,
  snapTime,
  trimEnd,
  trimStart,
} from "./clips";
import type { Clip, MediaRef } from "./document";

const video: MediaRef = { id: "v", file: "v.mp4", name: "v", kind: "video", bytes: 1, width: 1, height: 1, duration: 4 };
const image: MediaRef = { id: "i", file: "i.png", name: "i", kind: "image", bytes: 1, width: 1, height: 1 };
const clip = (over: Partial<Clip> = {}): Clip => ({ id: "c", mediaId: "v", startS: 10, durationS: 5, inS: 0, loop: true, ...over });

describe("placeClip", () => {
  it("gives a video its own length and an image a hold", () => {
    expect(placeClip("c", video, 0, 60).durationS).toBe(4);
    expect(placeClip("c", image, 0, 60).durationS).toBe(IMAGE_HOLD_S);
  });

  it("never runs past the end of the scene", () => {
    const placed = placeClip("c", image, 58, 60);
    expect(placed.startS + placed.durationS).toBeLessThanOrEqual(60);
    expect(placed.durationS).toBeGreaterThanOrEqual(MIN_CLIP_S);
  });
});

describe("clipAt", () => {
  it("finds the clip under the playhead and nothing in a gap", () => {
    const clips = [clip({ startS: 0, durationS: 5 }), clip({ id: "d", startS: 10, durationS: 5 })];
    expect(clipAt(clips, 2)?.id).toBe("c");
    expect(clipAt(clips, 7)).toBeNull();
    expect(clipAt(clips, 12)?.id).toBe("d");
    // The end is exclusive: the next clip owns its start.
    expect(clipAt(clips, 5)).toBeNull();
  });
});

describe("mediaTime", () => {
  it("loops a short asset across a long clip", () => {
    expect(mediaTime(clip({ startS: 10, durationS: 10 }), video, 19)).toBeCloseTo(1);
  });

  it("holds the last frame when not looping", () => {
    expect(mediaTime(clip({ startS: 10, durationS: 10, loop: false }), video, 19)).toBe(4);
  });

  it("honours the in-point", () => {
    expect(mediaTime(clip({ startS: 10, inS: 2 }), video, 11)).toBeCloseTo(3);
  });

  it("does not divide by an image's missing length", () => {
    expect(mediaTime(clip({ startS: 10 }), image, 13)).toBe(3);
  });
});

describe("moving and trimming", () => {
  it("keeps a moved clip inside the scene", () => {
    expect(moveClip(clip(), -3, 60).startS).toBe(0);
    expect(moveClip(clip(), 58, 60).startS).toBe(55);
  });

  it("will not trim a clip below the minimum or past the scene", () => {
    expect(trimEnd(clip(), 10.1, 60).durationS).toBe(MIN_CLIP_S);
    expect(trimEnd(clip(), 99, 60).durationS).toBe(50);
  });

  it("moves the in-point with the start so the picture does not jump", () => {
    const trimmed = trimStart(clip({ startS: 10, durationS: 5, inS: 1 }), 12);
    expect(trimmed.startS).toBe(12);
    expect(trimmed.durationS).toBe(3);
    expect(trimmed.inS).toBe(3);
  });

  it("never lets the start cross the end", () => {
    const trimmed = trimStart(clip({ startS: 10, durationS: 5 }), 14.9);
    expect(trimmed.durationS).toBeGreaterThanOrEqual(MIN_CLIP_S);
  });
});

describe("snapTime", () => {
  it("snaps to a neighbour's edge when close, otherwise to a tenth", () => {
    const neighbours = [clip({ startS: 0, durationS: 5 })];
    expect(snapTime(5.2, neighbours, 0.4)).toBe(5);
    expect(snapTime(7.23, neighbours, 0.4)).toBe(7.2);
  });
});

it('snaps independently to clip edges, playhead or grid, with no quantization when all are off', () => {
  const neighbours = [{id:'clip', mediaId:'source', startS:2.03, durationS:3, inS:0, loop:false}];
  expect(snapTime(2.01, neighbours, .1, { grid:false, edges:true })).toBe(2.03);
  expect(snapTime(2.01, neighbours, .1, { grid:false, edges:false })).toBe(2.01);
  expect(snapTime(2.01, neighbours, .1, { grid:false, edges:false, anchors:[2.04] })).toBe(2.04);
  expect(snapTime(2.06, [], .1)).toBe(2.1);
});
