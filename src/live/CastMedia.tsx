import { useEffect, useRef, type CSSProperties } from "react";
import { useCastStream } from "./casts";

/** Muted: the kiosk plays the cast's sound once, under the player's audio setting. */
export function CastMedia({ style, placeholder }: { style: CSSProperties; placeholder?: boolean }) {
  const stream = useCastStream(), ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play()?.catch(() => {});
    return () => { video.srcObject = null; };
  }, [stream]);
  return <div className="map-camera" style={{ ...style, overflow: "hidden", background: "black" }}>
    <video ref={ref} muted playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    {!stream && placeholder && <div className="map-source-message">Waiting for a cast</div>}
  </div>;
}
