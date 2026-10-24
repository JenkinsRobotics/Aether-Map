// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVideoSync } from "./video-sync";

function fakeVideo(overrides: Partial<HTMLVideoElement> = {}) {
  const video = {
    duration: 10,
    currentTime: 0,
    paused: true,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...overrides,
  };
  return { ref: { current: video as unknown as HTMLVideoElement }, video };
}

describe("useVideoSync", () => {
  it("seeks a clip that has drifted from the show clock", () => {
    const { ref, video } = fakeVideo({ currentTime: 0 });
    renderHook(() => useVideoSync(ref, 4, true));
    expect(video.currentTime).toBe(4);
  });

  it("leaves a clip alone when it is already close enough", () => {
    // Seeking every frame would stutter; only correct real drift.
    const { ref, video } = fakeVideo({ currentTime: 4.1 });
    renderHook(() => useVideoSync(ref, 4, true));
    expect(video.currentTime).toBe(4.1);
  });

  it("wraps the show clock around the clip's own length", () => {
    const { ref, video } = fakeVideo({ duration: 10, currentTime: 0 });
    renderHook(() => useVideoSync(ref, 23, true));
    expect(video.currentTime).toBe(3);
  });

  it("starts a paused clip when the show is playing", () => {
    const { ref, video } = fakeVideo({ paused: true });
    renderHook(() => useVideoSync(ref, 0, true));
    expect(video.play).toHaveBeenCalled();
  });

  it("pauses a running clip when the show is paused", () => {
    const { ref, video } = fakeVideo({ paused: false });
    renderHook(() => useVideoSync(ref, 0, false));
    expect(video.pause).toHaveBeenCalled();
  });

  it("survives metadata that has not loaded yet", () => {
    const { ref, video } = fakeVideo({ duration: NaN, currentTime: 0 });
    renderHook(() => useVideoSync(ref, 5, true));
    expect(Number.isNaN(video.currentTime)).toBe(false);
    expect(video.currentTime).toBe(0);
  });

  it("holds a non-looping clip at its last frame instead of wrapping to zero", () => {
    const { ref, video } = fakeVideo({ duration: 10, currentTime: 4, paused: false });
    renderHook(() => useVideoSync(ref, 10, true, false));
    expect(video.currentTime).toBeCloseTo(9.999);
    expect(video.pause).toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
  });

  it("honours a small seek while paused", () => {
    const { ref, video } = fakeVideo({ currentTime: 4 });
    renderHook(() => useVideoSync(ref, 4.1, false));
    expect(video.currentTime).toBe(4.1);
  });

  it("does nothing without an element", () => {
    const ref = { current: null };
    expect(() => renderHook(() => useVideoSync(ref, 5, true))).not.toThrow();
  });
});
