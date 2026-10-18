import { useEffect, useRef, type CSSProperties } from "react";
import type { TrackerSource } from "../features/types";
import { useCamera } from "./cameras";
import { trackingHands } from "./tracking-frames";

const FINGERS = [[0, 1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const PALM = [0, 1, 5, 9, 13, 17];
export function TrackerMedia({ source, style, timeS, placeholder }: { source: TrackerSource; style: CSSProperties; timeS: number; placeholder?: boolean }) {
  const camera = useCamera(source), ref = useRef<HTMLCanvasElement>(null);
  const hands = trackingHands(source, timeS, camera.hands);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d"); if (!ctx || !canvas) return;
    const width = canvas.width, height = canvas.height; ctx.clearRect(0, 0, width, height);
    for (const hand of hands) {
      const raw = hand.points;
      const cx = raw[0][0], cy = raw[0][1];
      const points = raw.map(([x, y, z]) => {
        const px = cx + (x - cx) * source.scale, py = cy + (y - cy) * source.scale;
        return [(source.mirror ? 1 - px : px) * width, (source.flipY ? 1 - py : py) * height, z];
      });
      const palmWidth = Math.hypot(points[5][0] - points[17][0], points[5][1] - points[17][1]);
      const colour = source.color;
      let fill: string | CanvasGradient = colour;
      if (source.style === "skin" || source.style === "metal") {
        const gradient = ctx.createLinearGradient(points[5][0], points[5][1], points[17][0], points[17][1] + palmWidth);
        if (source.style === "metal") { gradient.addColorStop(0, "#161b25"); gradient.addColorStop(.35, "#f4faff"); gradient.addColorStop(.5, colour); gradient.addColorStop(.7, "#647087"); gradient.addColorStop(1, "#ffffff"); }
        else {
          // Original stylised skin shading, independent of camera image content.
          gradient.addColorStop(0, shade(colour, 1.12)); gradient.addColorStop(.45, colour); gradient.addColorStop(1, shade(colour, .72));
        }
        fill = gradient;
      }
      ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); PALM.forEach((i, n) => n ? ctx.lineTo(points[i][0], points[i][1]) : ctx.moveTo(points[i][0], points[i][1])); ctx.closePath();
      if (source.style === "wire") { ctx.lineWidth = 2; ctx.stroke(); } else ctx.fill();
      for (const finger of FINGERS) {
        for (let i = 1; i < finger.length; i++) {
          const a = points[finger[i - 1]], b = points[finger[i]];
          ctx.lineWidth = source.style === "wire" ? 2 : Math.max(2, palmWidth * (.23 - i * .035));
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
      }
      if (source.style === "wire") for (const p of points) { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill(); }
    }
  }, [hands, source]);
  const width = 1280, height = source.aspect === "4:3" ? 960 : source.aspect === "1:1" ? 1280 : 720;
  return <div className="map-tracker" style={style} data-hands={hands.length}>
    <canvas ref={ref} width={width} height={height} style={{ width: "100%", height: "100%" }} />
    {!hands.length && placeholder && <div className="map-source-message">{source.recording ? "No hands at this time" : camera.status}</div>}
  </div>;
}

function shade(colour: string, factor: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(colour); if (!match) return colour;
  const rgb = [0, 2, 4].map((i) => Math.min(255, Math.round(parseInt(match[1].slice(i, i + 2), 16) * factor)));
  return `rgb(${rgb.join(",")})`;
}
