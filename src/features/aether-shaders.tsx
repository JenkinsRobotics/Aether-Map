import { GLShader, PREAMBLE } from "./GLShader";

/**
 * Effects Aether Map writes itself, because the upstream catalog has no
 * equivalent. Both are staples of projection work: a kaleidoscope turns any
 * motion into symmetry, which reads well on an irregular shape like a bush or a
 * porch rail, and a tunnel gives depth to a flat wall.
 */

const KALEIDOSCOPE = `${PREAMBLE}
uniform float uSegments;
uniform float uTwist;
uniform float uBands;
uniform float uSpeed;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  p = spin(uRotation * TAU / 360.0) * p / max(0.05, uScale);
  float t = uTime * uSpeed;
  float radius = length(p);
  float angle = atan(p.y, p.x) + uTwist * radius;
  // Fold the circle into wedges and mirror each one: that fold is the whole
  // effect, everything after it is just something to look at inside the wedge.
  float wedge = TAU / max(2.0, floor(uSegments));
  angle = abs(mod(angle, wedge) - wedge * 0.5);
  vec2 folded = vec2(cos(angle), sin(angle)) * radius;
  float pattern = sin(folded.x * uBands + t) * cos(folded.y * uBands - t * 0.7);
  float glow = smoothstep(0.9, 0.0, radius);
  vec3 tint = mix(uColor0, uColor1, 0.5 + 0.5 * pattern);
  tint = mix(tint, uColor2, smoothstep(0.2, 0.9, fract(radius * 2.0 - t * 0.35)));
  fragColor = vec4(tint * glow, 1.0);
}`;

const TUNNEL = `${PREAMBLE}
uniform float uSides;
uniform float uRings;
uniform float uSpeed;
uniform float uFalloff;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  p = spin(uRotation * TAU / 360.0) * p / max(0.05, uScale);
  float t = uTime * uSpeed;
  float radius = max(length(p), 0.001);
  // 1/r is the perspective: equal steps down the tunnel crowd together as they
  // approach the centre, which is what reads as depth on a flat wall.
  float depth = 1.0 / radius + t;
  float around = atan(p.y, p.x) / TAU + 0.5;
  float rings = abs(fract(depth * max(0.5, uRings)) - 0.5) * 2.0;
  float ribs = abs(fract(around * max(2.0, floor(uSides))) - 0.5) * 2.0;
  vec3 tint = mix(uColor0, uColor1, rings);
  tint = mix(tint, uColor2, smoothstep(0.75, 1.0, ribs));
  // Darken toward the mouth so the centre reads as far away, not as a hole.
  fragColor = vec4(tint * pow(clamp(radius * 1.6, 0.0, 1.0), max(0.0, uFalloff)), 1.0);
}`;

type Props = Record<string, unknown>;
const floats = (props: Props, names: string[]) =>
  Object.fromEntries(names.map((name) => [name, typeof props[name] === "number" ? (props[name] as number) : 0]));

export function Kaleidoscope(props: Props) {
  return <GLShader fragment={KALEIDOSCOPE}
    preserveDrawingBuffer={props.preserveDrawingBuffer as boolean}
    uniforms={floats(props, ["segments", "twist", "bands", "speed"])}
    colors={props.colors as string[]} frame={props.frame as number}
    scale={props.scale as number} rotation={props.rotation as number}
    minPixelRatio={props.minPixelRatio as number} maxPixelCount={props.maxPixelCount as number} style={props.style as React.CSSProperties} />;
}
export const kaleidoscopePresets = [
  { name: "Default", params: { segments: 8, twist: 1.2, bands: 14, speed: 0.6, scale: 1, rotation: 0,
    colors: ["#120024", "#ff4fa3", "#7be0ff"] } },
  { name: "Cathedral", params: { segments: 12, twist: 0, bands: 26, speed: 0.25, scale: 1.2, rotation: 0,
    colors: ["#04121f", "#f5c76a", "#3f7fd1"] } },
  { name: "Spun glass", params: { segments: 5, twist: 3.5, bands: 9, speed: 1.1, scale: 0.8, rotation: 0,
    colors: ["#000000", "#9dffd0", "#ff8de0"] } },
];

export function Tunnel(props: Props) {
  return <GLShader fragment={TUNNEL}
    preserveDrawingBuffer={props.preserveDrawingBuffer as boolean}
    uniforms={floats(props, ["sides", "rings", "speed", "falloff"])}
    colors={props.colors as string[]} frame={props.frame as number}
    scale={props.scale as number} rotation={props.rotation as number}
    minPixelRatio={props.minPixelRatio as number} maxPixelCount={props.maxPixelCount as number} style={props.style as React.CSSProperties} />;
}
export const tunnelPresets = [
  { name: "Default", params: { sides: 12, rings: 3, speed: 0.8, falloff: 0.8, scale: 1, rotation: 0,
    colors: ["#05010f", "#4a2fd0", "#00e5ff"] } },
  { name: "Vortex", params: { sides: 24, rings: 6, speed: 1.6, falloff: 1.4, scale: 1, rotation: 0,
    colors: ["#100000", "#ff3b1f", "#ffd166"] } },
  { name: "Deep well", params: { sides: 6, rings: 1.5, speed: 0.35, falloff: 0.4, scale: 1.4, rotation: 0,
    colors: ["#00110c", "#0f8f6a", "#d4ffe9"] } },
];
