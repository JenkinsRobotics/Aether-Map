import { useEffect, useRef, type CSSProperties } from "react";

/**
 * A fragment shader on a canvas, with the same contract the catalog's other
 * effects have: `frame` in milliseconds drives it, `colors` tint it, and every
 * other numeric prop becomes a uniform of the same name.
 *
 * This exists because two effects Aether Map wants — a kaleidoscope and a
 * tunnel — are not in the upstream library, and wrapping a whole second shader
 * framework to get them would cost more than the forty lines of GLSL each one
 * actually is.
 */
const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

/** Shared preamble: every effect gets the same inputs by the same names. */
export const PREAMBLE = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uScale;
uniform float uRotation;
const float TAU = 6.283185307179586;
mat2 spin(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
`;

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value.padEnd(6, "0");
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255) as [number, number, number];
}

export interface GLShaderProps {
  fragment: string;
  /** Extra float uniforms, by their exact GLSL name without the `u` prefix. */
  uniforms?: Record<string, number>;
  colors?: string[];
  frame?: number;
  scale?: number;
  rotation?: number;
  maxPixelCount?: number;
  minPixelRatio?: number;
  preserveDrawingBuffer?: boolean;
  style?: CSSProperties;
}

export function GLShader({ fragment, uniforms = {}, colors = [], frame = 0, scale = 1, rotation = 0, maxPixelCount = 1920 * 1080, minPixelRatio = 1, preserveDrawingBuffer = false, style }: GLShaderProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const program = useRef<{ gl: WebGL2RenderingContext; program: WebGLProgram } | null>(null);

  // Compiled once per shader source: recompiling per frame would stall the GPU
  // and, on a projector, show as a stutter every frame rather than once.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer });
    if (!gl) throw new Error('WebGL 2 is unavailable');
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
      return shader;
    };
    // A compile or link failure throws out of the effect and into the surface's
    // ShaderBoundary, which is where every other shader failure already lands:
    // the operator is told the effect is unavailable on this device instead of
    // watching a black rectangle and guessing.
    const built = gl.createProgram()!;
    gl.attachShader(built, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(built, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(built);
    if (!gl.getProgramParameter(built, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(built) ?? "link");
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // One triangle covering the clip space: cheaper than a quad and has no seam.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(built, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    program.current = { gl, program: built };
    return () => {
      gl.deleteProgram(built);
      gl.deleteBuffer(buffer);
      program.current = null;
      // Release the context rather than waiting for GC: browsers cap how many
      // live at once, and a show can hold a lot of shader surfaces.
      // StrictMode replays setup immediately on the same canvas. Defer the
      // release so that replay can reuse a live context; an actual unmount
      // still releases it before the next task.
      queueMicrotask(() => {
        if (!program.current) gl.getExtension("WEBGL_lose_context")?.loseContext();
      });
    };
  }, [fragment, preserveDrawingBuffer]);

  useEffect(() => {
    const current = program.current, canvas = ref.current;
    if (!current || !canvas) return;
    const { gl, program: built } = current;
    const ratio = Math.max(minPixelRatio, Math.min(devicePixelRatio || 1, 2));
    const wide = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const high = Math.max(1, Math.round(canvas.clientHeight * ratio));
    // Honour the pixel budget the caller set, keeping the aspect.
    const shrink = Math.min(1, Math.sqrt(maxPixelCount / Math.max(1, wide * high)));
    canvas.width = Math.max(1, Math.round(wide * shrink));
    canvas.height = Math.max(1, Math.round(high * shrink));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(built);
    const set = (name: string, value: number) => gl.uniform1f(gl.getUniformLocation(built, name), value);
    gl.uniform2f(gl.getUniformLocation(built, "uResolution"), canvas.width, canvas.height);
    set("uTime", frame / 1000);
    set("uScale", scale || 1);
    set("uRotation", rotation);
    const palette = colors.length ? colors : ["#000000", "#ffffff", "#8888ff"];
    for (let index = 0; index < 3; index += 1) {
      const [r, g, b] = rgb(palette[index % palette.length]);
      gl.uniform3f(gl.getUniformLocation(built, `uColor${index}`), r, g, b);
    }
    for (const [name, value] of Object.entries(uniforms)) set(`u${name[0].toUpperCase()}${name.slice(1)}`, value);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });

  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block", ...style }} />;
}
