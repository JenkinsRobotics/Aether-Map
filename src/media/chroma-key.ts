/** Saved with the source; pool instances inherit it until explicitly overridden. */
export interface ChromaKey {
  enabled: boolean;
  color: string;
  /** Normalized RGB distance at which pixels become transparent. */
  similarity: number;
  /** Width of the soft alpha transition beyond similarity. */
  softness: number;
  /** Suppression of the key's dominant colour on softened edges, 0–1. */
  spill: number;
}
export const DEFAULT_CHROMA_KEY: ChromaKey = {
  enabled: true, color: '#00ff00', similarity: .2, softness: .12, spill: .5,
};
export function readChromaKey(value: unknown): ChromaKey | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const unit = (key: 'similarity' | 'softness' | 'spill') => typeof raw[key] === 'number' && Number.isFinite(raw[key])
    ? Math.max(0, Math.min(1, raw[key])) : DEFAULT_CHROMA_KEY[key];
  return { enabled: raw.enabled === true,
    color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : DEFAULT_CHROMA_KEY.color,
    similarity: unit('similarity'), softness: unit('softness'), spill: unit('spill') };
}
export function keyRgb(color: string): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255) as [number, number, number];
}
export const CHROMA_VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() { gl_Position = vec4(aPosition, 0., 1.); vUv = vec2((aPosition.x + 1.) * .5, (1. - aPosition.y) * .5); }
`;
/** Straight alpha, including the input's alpha, shared by editor and output. */
export const CHROMA_FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform vec3 uKey;
uniform float uSimilarity;
uniform float uSoftness;
uniform float uSpill;
void main() {
  vec4 pixel = texture2D(uImage, vUv);
  float distanceToKey = distance(pixel.rgb, uKey) / 1.7320508;
  float alpha = smoothstep(uSimilarity, uSimilarity + max(uSoftness, .0001), distanceToKey);
  vec3 color = pixel.rgb;
  float edge = (1. - alpha) * uSpill;
  if (uKey.g > max(uKey.r, uKey.b)) color.g -= max(0., color.g - max(color.r, color.b)) * edge;
  else if (uKey.b > max(uKey.r, uKey.g)) color.b -= max(0., color.b - max(color.r, color.g)) * edge;
  else if (uKey.r > max(uKey.g, uKey.b)) color.r -= max(0., color.r - max(color.g, color.b)) * edge;
  gl_FragColor = vec4(color, pixel.a * alpha);
}
`;
