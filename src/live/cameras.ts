import { useSyncExternalStore } from "react";
import type { CameraSource, HandSample, TrackerSource } from "../features/types";

export interface CameraState { stream?: MediaStream; hands: HandSample[]; status: string; tracking: boolean }
const EMPTY: CameraState = { hands: [], status: "Camera is off", tracking: false };
const states = new Map<string, CameraState>();
const listeners = new Set<() => void>();
const cleanups = new Map<string, () => void>();
const generations = new Map<string, number>();
export const cameraKey = (source: CameraSource) => source.deviceId || "default";
export const subscribeCameras = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const cameraState = (key: string) => states.get(key) ?? EMPTY;
export const cameraEntries = () => [...states.entries()];
export function setCameraState(key: string, patch: Partial<CameraState>) {
  states.set(key, { ...cameraState(key), ...patch });
  for (const fn of listeners) fn();
}
export function useCamera(source: CameraSource) {
  const key = cameraKey(source);
  return useSyncExternalStore(subscribeCameras, () => cameraState(key));
}
export function stopCamera(key: string) {
  generations.set(key, (generations.get(key) ?? 0) + 1);
  cleanups.get(key)?.(); cleanups.delete(key);
  cameraState(key).stream?.getTracks().forEach((track) => track.stop());
  setCameraState(key, { stream: undefined, hands: [], tracking: false, status: "Camera is off" });
}
/** Called only from the operator's Connect/Start tracking action. */
export async function connectCamera(source: CameraSource | TrackerSource, tracking = false): Promise<void> {
  const key = cameraKey(source);
  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraState(key, { status: "Camera access needs HTTPS or localhost and a browser with camera support." }); return;
  }
  let state = cameraState(key);
  if (!state.stream) {
    const generation = (generations.get(key) ?? 0) + 1; generations.set(key, generation);
    setCameraState(key, { status: "Waiting for camera permission…" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        ...(source.deviceId ? { deviceId: { exact: source.deviceId } } : {}), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
      } });
      if (generations.get(key) !== generation) { stream.getTracks().forEach((t) => t.stop()); return; }
      stream.getVideoTracks()[0].addEventListener("ended", () => stopCamera(key), { once: true });
      setCameraState(key, { stream, status: "Camera connected" });
    } catch (error) { setCameraState(key, { status: `Camera could not connect: ${(error as Error).message}` }); return; }
    state = cameraState(key);
  }
  if (tracking && !state.tracking && state.stream) {
    const subject = "subject" in source && source.subject === "face" ? "face" : "hands";
    const noun = subject === "face" ? "face" : "hand";
    setCameraState(key, { tracking: true, status: `Loading ${noun} tracking…` });
    const { startHandTracking } = await import("./hand-tracking");
    // The camera may have been stopped while the tracking module loaded.
    if (cameraState(key).stream !== state.stream) return;
    cleanups.set(key, startHandTracking(state.stream,
      (hands) => setCameraState(key, { hands, status: hands.length
        ? `Tracking ${hands.length} ${noun}${hands.length === 1 ? "" : subject === "face" ? "s" : "s"}`
        : `Show your ${noun} to the camera` }),
      (error) => setCameraState(key, { status: `Tracking unavailable: ${error}`, tracking: false }), subject));
  }
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  return (await navigator.mediaDevices?.enumerateDevices() ?? []).filter((device) => device.kind === "videoinput");
}
