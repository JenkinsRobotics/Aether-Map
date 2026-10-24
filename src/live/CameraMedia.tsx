import { useEffect, useRef, type CSSProperties } from "react";
import type { CameraSource } from "../features/types";
import { useCamera } from "./cameras";
export function CameraMedia({ source, style, placeholder }: { source: CameraSource; style: CSSProperties; placeholder?: boolean }) {
  const camera = useCamera(source), ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = camera.stream ?? null;
    if (camera.stream) void video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [camera.stream]);
  return <div className="map-camera" style={{ ...style, overflow: "hidden" }}>
    <video ref={ref} muted playsInline data-camera-connected={Boolean(camera.stream)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${source.mirror ? -1 : 1}, ${source.flipY ? -1 : 1})` }} />
    {!camera.stream && placeholder && <div className="map-source-message">{camera.status}</div>}
  </div>;
}
