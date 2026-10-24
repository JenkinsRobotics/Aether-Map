import { useEffect, useRef, useState } from "react";
import { Button, ColorField, FieldRow, NumberField, SelectField } from "@aether/ui";
import type { CameraSource, TrackerSource, TrackingFrame } from "./types";
import { cameraKey, cameraState, connectCamera, listCameras, stopCamera, subscribeCameras, useCamera } from "../live/cameras";

export function CameraFields({ source, tracker, onChange }: { source: CameraSource; tracker?: TrackerSource; onChange: (source: CameraSource | TrackerSource) => void }) {
  const state = useCamera(source), [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [recording, setRecording] = useState(false), [notice, setNotice] = useState("");
  const frames = useRef<TrackingFrame[]>([]), start = useRef(0), key = cameraKey(source);
  const patch = (update: Partial<TrackerSource>) => onChange({ ...source, ...update });
  useEffect(() => { let live = true; void listCameras().then((found) => { if (live) setDevices(found); }).catch(() => {}); return () => { live = false; }; }, [state.stream]);
  useEffect(() => {
    if (!recording) return;
    const record = () => {
      const timeS = (performance.now() - start.current) / 1000;
      if (timeS > 120 || frames.current.length >= 2400) return;
      if (frames.current.length && timeS - frames.current.at(-1)!.timeS < .045) return;
      // A take starts at zero even when React mounts the subscription a frame later.
      frames.current.push({ timeS: frames.current.length ? timeS : 0, hands: structuredClone(cameraState(key).hands) });
    };
    record(); return subscribeCameras(record);
  }, [key, recording]);
  const stopRecording = () => {
    setRecording(false);
    if (!tracker) return;
    const recorded = frames.current;
    if (!recorded.some((f) => f.hands.length)) { setNotice("No hands were detected. Try recording again with a hand in view."); return; }
    onChange({ ...tracker, recording: { durationS: Math.min(120, (performance.now() - start.current) / 1000), loop: true, frames: recorded } });
    setNotice("Recording saved in this feature. Scrub or play the timeline to preview it.");
  };
  return <>
    <FieldRow label="Camera"><SelectField aria-label="Camera device" value={source.deviceId} options={[{ value: "", label: "Default camera" }, ...devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Camera ${i + 1}` }))]}
      onChange={(e) => { setRecording(false); onChange({ ...source, deviceId: e.target.value }); }} /></FieldRow>
    <div className="map-feature-buttons">
      <Button disabled={state.tracking && Boolean(tracker)} onClick={() => void connectCamera(source, Boolean(tracker))}>{tracker ? "Start tracking" : "Connect camera"}</Button>
      <Button disabled={!state.stream} onClick={() => { if (recording) stopRecording(); stopCamera(key); }}>Disconnect</Button>
    </div>
    <div className="map-hint" role="status">{state.status}</div>
    <FieldRow label="Aspect ratio"><SelectField aria-label="Camera aspect ratio" value={source.aspect} options={["16:9", "4:3", "1:1"].map((v) => ({ value: v, label: v }))} onChange={(e) => patch({ aspect: e.target.value as CameraSource["aspect"] })} /></FieldRow>
    <div className="map-feature-buttons"><Button aria-pressed={source.mirror} onClick={() => patch({ mirror: !source.mirror })}>Mirror</Button><Button aria-pressed={source.flipY} onClick={() => patch({ flipY: !source.flipY })}>Flip vertically</Button></div>
    {tracker && <>
      {/* Changing subject swaps the model, so any recording made of the old one
          is of a different thing entirely and is dropped rather than replayed
          onto the wrong landmarks. */}
      <FieldRow label="Track" help="Hands or a face. Changing this reloads the camera's model.">
        <SelectField aria-label="Tracking subject" value={tracker.subject ?? "hands"}
          options={[{ value: "hands", label: "Hands" }, { value: "face", label: "Face" }]}
          onChange={(e) => {
            const subject = e.target.value as "hands" | "face";
            stopCamera(cameraKey(tracker));
            patch({ subject, recording: undefined });
          }} />
      </FieldRow>
      <FieldRow label={`${tracker.subject === "face" ? "Face" : "Hand"} style`}><SelectField aria-label="Hand style" value={tracker.style} options={["skin", "silhouette", "wire", "metal"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} onChange={(e) => patch({ style: e.target.value as TrackerSource["style"] })} /></FieldRow>
      <FieldRow label={`${tracker.subject === "face" ? "Face" : "Hand"} colour`}><ColorField ariaLabel="Hand colour" value={tracker.color} onChange={(color) => patch({ color })} /></FieldRow>
      {tracker.subject !== "face" && <FieldRow label="Hands"><SelectField aria-label="Tracked hand" value={tracker.hand} options={["both", "left", "right"].map((v) => ({ value: v, label: v }))} onChange={(e) => patch({ hand: e.target.value as TrackerSource["hand"] })} /></FieldRow>}
      {tracker.subject !== "face" && <FieldRow label="Maximum hands"><SelectField aria-label="Maximum hands" value={String(tracker.handCount)} options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]} onChange={(e) => patch({ handCount: Number(e.target.value) as 1 | 2 })} /></FieldRow>}
      <FieldRow label={`${tracker.subject === "face" ? "Face" : "Hand"} size`}><NumberField aria-label="Hand size" value={tracker.scale} min={.1} max={5} step={.1} onValueChange={(v) => v !== null && patch({ scale: v })} /></FieldRow>
      <Button disabled={!state.tracking && !recording} onClick={() => { if (recording) stopRecording(); else { frames.current = []; start.current = performance.now(); setRecording(true); setNotice("Recording up to two minutes. Stop to keep this take."); } }}>{recording ? "Stop recording" : "Record hands"}</Button>
      {tracker.recording && <div className="map-feature-buttons"><Button onClick={() => patch({ recording: undefined })}>Use live hands</Button><Button onClick={() => patch({ recording: { ...tracker.recording!, loop: !tracker.recording!.loop } })}>{tracker.recording.loop ? "Hold recording" : "Loop recording"}</Button></div>}
      {notice && <div className="map-hint" role="status">{notice}</div>}
    </>}
  </>;
}
