import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useVideoSync } from '../video-sync';
import { CHROMA_FRAGMENT, CHROMA_VERTEX, keyRgb, type ChromaKey } from './chroma-key';

/** GPU keying before source cropping/warping. The hidden video uses Map's show clock. */
export function ChromaKeyMedia({ url, kind, settings, style, timeS, playing, loop }: {
  url: string; kind: 'image' | 'video'; settings: ChromaKey; style: CSSProperties;
  timeS: number; playing: boolean; loop: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null), videoRef = useRef<HTMLVideoElement>(null), imageRef = useRef<HTMLImageElement>(null);
  const latest = useRef(settings), drawRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState(''), [generation, setGeneration] = useState(0);
  useVideoSync(videoRef, timeS, playing, loop, url);
  useEffect(() => { latest.current = settings; drawRef.current?.(); }, [settings, timeS]);
  useEffect(() => {
    const canvas = canvasRef.current, media = kind === 'video' ? videoRef.current : imageRef.current;
    if (!canvas || !media) return;
    let gl: WebGLRenderingContext | null = null, program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null, texture: WebGLTexture | null = null;
    const shaders: WebGLShader[] = [];
    let disposed = false, frame = 0, videoFrame = 0;
    const video = kind === 'video' ? videoRef.current : null;
    const fail = () => setError('Green-screen rendering is unavailable. Check WebGL support and that the media file can be read.');
    const lost = (event: Event) => { event.preventDefault(); fail(); };
    const restored = () => setGeneration(n => n + 1);
    const draw = () => {
      if (disposed || !gl || !program || !texture || gl.isContextLost()) return;
      if (video ? video.readyState < 2 : !(media as HTMLImageElement).naturalWidth) return;
      const width = video ? video.videoWidth : (media as HTMLImageElement).naturalWidth;
      const height = video ? video.videoHeight : (media as HTMLImageElement).naturalHeight;
      if (!width || !height) return;
      const scale = Math.min(1, Math.sqrt(1920 * 1080 / (width * height)));
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      try {
        gl.viewport(0, 0, w, h); gl.useProgram(program); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media);
        const key = latest.current;
        gl.uniform3fv(gl.getUniformLocation(program, 'uKey'), keyRgb(key.color));
        for (const [name, value] of [['uSimilarity', key.similarity], ['uSoftness', key.softness], ['uSpill', key.spill]] as const)
          gl.uniform1f(gl.getUniformLocation(program, name), value);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } catch { fail(); }
    };
    try {
      setError('');
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error('WebGL unavailable');
      const compile = (type: number, source: string) => {
        const shader = gl!.createShader(type); if (!shader) throw new Error('shader');
        shaders.push(shader); gl!.shaderSource(shader, source); gl!.compileShader(shader);
        if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error('compile');
        return shader;
      };
      program = gl.createProgram(); if (!program) throw new Error('program');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, CHROMA_VERTEX)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, CHROMA_FRAGMENT));
      gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(program); buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const at = gl.getAttribLocation(program, 'aPosition'); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      drawRef.current = draw;
      draw();
      if (video && typeof video.requestVideoFrameCallback === 'function') {
        const next = () => { if (disposed) return; draw(); videoFrame = video.requestVideoFrameCallback(next); };
        videoFrame = video.requestVideoFrameCallback(next);
      } else if (video) {
        const next = () => { if (disposed) return; if (!video.paused) draw(); frame = requestAnimationFrame(next); };
        frame = requestAnimationFrame(next);
      }
    } catch { fail(); }
    media.addEventListener('load', draw); media.addEventListener('loadeddata', draw); media.addEventListener('seeked', draw); media.addEventListener('error', fail);
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      disposed = true; drawRef.current = null; cancelAnimationFrame(frame);
      if (videoFrame) video?.cancelVideoFrameCallback(videoFrame);
      media.removeEventListener('load', draw); media.removeEventListener('loadeddata', draw); media.removeEventListener('seeked', draw); media.removeEventListener('error', fail);
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
      if (gl) { gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(s => gl!.deleteShader(s)); }
    };
  }, [url, kind, generation]);
  return <>
    {kind === 'video' ? <video ref={videoRef} src={url} crossOrigin="anonymous" muted playsInline preload="auto" style={{ display: 'none' }} />
      : <img ref={imageRef} src={url} crossOrigin="anonymous" alt="" style={{ display: 'none' }} />}
    <canvas ref={canvasRef} style={style} className="map-chroma-media" aria-label="Background removed media" />
    {error && <div style={style} role="alert">{error}</div>}
  </>;
}
