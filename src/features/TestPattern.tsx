import type { CSSProperties } from "react";
export function TestPattern({ style, kind = "grid" }: { style: CSSProperties; kind?: "grid" | "bars" }) {
  return <svg className="map-test-pattern" style={style} viewBox="0 0 1600 900" preserveAspectRatio="none">
    <rect width="1600" height="900" fill="black" />
    {kind === "bars" ? ["#fff", "#ff0", "#0ff", "#0f0", "#f0f", "#f00", "#00f", "#000"].map((fill, i) => <rect key={fill} x={i * 200} width="200" height="900" fill={fill} />) : <g stroke="white" strokeWidth="2">
      {Array.from({ length: 17 }, (_, i) => <line key={`x${i}`} x1={i * 100} y1="0" x2={i * 100} y2="900" />)}
      {Array.from({ length: 10 }, (_, i) => <line key={`y${i}`} x1="0" y1={i * 100} x2="1600" y2={i * 100} />)}
      <circle cx="800" cy="450" r="350" fill="none" /><path d="M0 0L1600 900M1600 0L0 900" />
    </g>}
    <text x="800" y="475" textAnchor="middle" fill="white" stroke="black" strokeWidth="1" fontSize="48">Aether Map</text>
  </svg>;
}
