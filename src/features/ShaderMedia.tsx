import { PreviewQuality } from './PreviewQuality';
import { useModulation } from "./ModulationContext";
import { Component, Suspense, useContext, type CSSProperties, type ReactNode } from "react";
import { SHADERS } from "./shader-catalog";
import { shaderAt, shaderTimeS } from "./shader-motion";
import { useLiveLevels } from "../live/use-live-levels";
import { useMidi } from "../live/midi";
import type { ShaderSource } from "./types";
import { NATIVE_SHADER_IDS } from './gallery-shaders';

// Locally generated calibration artwork for image effects before an asset is assigned.
const DEFAULT_IMAGE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="black"/><circle cx="320" cy="180" r="120" fill="white"/><path d="M100 280L320 30L540 280Z" fill="#5588ff"/></svg>')}`;
class ShaderBoundary extends Component<{ children: ReactNode; placeholder: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? (this.props.placeholder ? <span>Shader unavailable on this device.</span> : null) : this.props.children; }
}
export function ShaderMedia({ shader, url, style, timeS, placeholder = false, snapshot = false }: {
  shader: ShaderSource; url?: string; style: CSSProperties; timeS: number; placeholder?: boolean; snapshot?: boolean;
}) {
  const preset = SHADERS.find((entry) => entry.id === shader.preset) ?? SHADERS[0];
  const Effect = preset.component;
  const quality = useContext(PreviewQuality);
  const levels = useLiveLevels();
  const midi = useMidi();
  const shared = useModulation();
  // The effect's own clock stays off (`speed={0}`) and show time drives `frame`,
  // so every viewer computes the same picture from the same instant instead of
  // free-running at its own rate. The shaping happens before that: the surface's
  // offset, loop and direction, then any parameter cycles at that same instant.
  const seconds = shaderTimeS(shader.time, timeS);
  const moving = shaderAt(shader, seconds, levels, midi.controls, shared.lfos, shared.timeS);
  const speed = typeof moving.parameters.speed === "number" ? moving.parameters.speed : 1;
  return <div className="map-shader" data-shader={preset.id} style={style}>
    <ShaderBoundary key={preset.id} placeholder={placeholder}><Suspense fallback={null}>
      <Effect {...moving.parameters} colors={moving.colors} image={preset.image ? (url ?? DEFAULT_IMAGE) : undefined}
        {...(NATIVE_SHADER_IDS.has(preset.id) ? { preserveDrawingBuffer: snapshot } : { webGlContextAttributes: { preserveDrawingBuffer: snapshot } })}
        speed={shaderRenderSpeed(preset.id)} frame={seconds * 1000 * speed} minPixelRatio={Math.max(1,quality.scale*(globalThis.devicePixelRatio||1))} maxPixelCount={quality.maxPixelCount}
        style={{ width: "100%", height: "100%" }} />
    </Suspense></ShaderBoundary>
  </div>;
}
/** Native effects use speed as a uniform, not an independent animation clock.
 * Their frame is already speed-scaled above, so multiply it by one, never zero. */
export function shaderRenderSpeed(preset: string) {
  return NATIVE_SHADER_IDS.has(preset) ? 1 : 0;
}
