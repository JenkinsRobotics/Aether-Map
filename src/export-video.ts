import { useSyncExternalStore } from "react";

/**
 * Recording a show to a file.
 *
 * The obvious route — `captureStream()` on the raster — does not exist: the
 * raster is a DOM tree of images, videos, SVG and WebGL canvases, not one
 * canvas. Compositing it into a canvas ourselves would mean a second renderer
 * that could disagree with the first, and it would get the shaders wrong.
 *
 * So the recorder captures the output *window* through the browser's own screen
 * share. What lands in the file is exactly what the projector is showing,
 * shaders and all, and the operator picks the window, which also means the
 * capture is consented rather than silent.
 */
/**
 * What to record at. A capture arrives at the shared window's own size; these
 * ask the track to resize to a standard delivery format, which is what makes a
 * file you can hand to someone rather than one shaped like your laptop.
 *
 * Choosing a size larger than the window does not invent detail — the browser
 * scales what it captured. For a genuine 4K master, make the output window
 * 4K first, then record at "Window".
 */
export const RECORDING_SIZES = {
  window: { label: "Window size", width: 0, height: 0 },
  "720p": { label: "720p · 1280 × 720", width: 1280, height: 720 },
  "1080p": { label: "1080p · 1920 × 1080", width: 1920, height: 1080 },
  "4k": { label: "4K · 3840 × 2160", width: 3840, height: 2160 },
} as const;
export type RecordingSize = keyof typeof RECORDING_SIZES;

interface RecordingState {
  recording: boolean;
  startedAtMs: number;
  status: string;
  /** Set when a recording finishes, so the UI can offer it again. */
  lastFile: string;
}

const IDLE: RecordingState = { recording: false, startedAtMs: 0, status: "Not recording", lastFile: "" };
let state = IDLE;
const listeners = new Set<() => void>();
const publish = (next: RecordingState) => { state = next; for (const fn of listeners) fn(); };
const subscribeRecording = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const recordingState = () => state;
export function useRecording() { return useSyncExternalStore(subscribeRecording, recordingState); }

/** Best container the browser will actually give us, most capable first. */
const TYPES = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
const supported = () => TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? "";

let recorder: MediaRecorder | null = null;
let capture: MediaStream | null = null;

export async function startRecording(name: string, size: RecordingSize = "1080p"): Promise<void> {
  if (state.recording) return;
  if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
    publish({ ...IDLE, status: "This browser cannot record a window." });
    return;
  }
  try {
    capture = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 60 },
      // The show's sound if the operator shares it; silence is not an error.
      audio: true,
    });
  } catch (problem) {
    publish({ ...IDLE, status: (problem as Error).message || "Nothing was shared." });
    return;
  }
  const chosen = RECORDING_SIZES[size];
  // Bitrate follows the frame size: 12 Mbit on a 4K master is mush, and on 720p
  // it is a needlessly large file.
  if (chosen.width) {
    try {
      // Constraints on a display track are advisory; a browser that declines
      // still records, just at the window's own size, which is why this never
      // fails the recording.
      await capture.getVideoTracks()[0]?.applyConstraints({
        width: { ideal: chosen.width }, height: { ideal: chosen.height }, frameRate: { ideal: 60 },
      });
    } catch { /* the window's own size is a fine fallback */ }
  }
  const type = supported();
  recorder = new MediaRecorder(capture, type ? { mimeType: type, videoBitsPerSecond: Math.max(8, (chosen.width || 1920) / 1920 * 12) * 1_000_000 } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    const file = `${name || "show"}.${(recorder?.mimeType ?? "").includes("mp4") ? "mp4" : "webm"}`;
    save(new Blob(chunks, { type: recorder?.mimeType || "video/webm" }), file);
    capture?.getTracks().forEach((track) => track.stop());
    capture = null; recorder = null;
    publish({ ...IDLE, status: `Saved ${file}`, lastFile: file });
  };
  // Stopping the share from the browser's own bar ends the recording too, so
  // the two controls cannot disagree about whether it is still running.
  capture.getVideoTracks()[0]?.addEventListener("ended", () => stopRecording());
  recorder.start(1000);
  const actual = capture.getVideoTracks()[0]?.getSettings?.();
  publish({ recording: true, startedAtMs: Date.now(), lastFile: "",
    status: actual?.width ? `Recording ${actual.width} × ${actual.height}` : "Recording" });
}

export function stopRecording(): void {
  if (recorder && recorder.state !== "inactive") recorder.stop();
  else {
    capture?.getTracks().forEach((track) => track.stop());
    capture = null;
    publish({ ...IDLE, status: state.status });
  }
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
