import { ChromaKeyMedia } from './media/ChromaKeyMedia';
import { textAppearance } from './content-bounds';
import { VisualEffects } from './features/VisualEffects';
import { VectorFill } from './features/VectorFill';
import { BentContent } from './mask/BentContent';
import { useEffect, useRef } from "react";
import { useVideoSync } from "./video-sync";
import type { MediaKind, Surface, SurfaceAppearance, TextContent } from "./document";
import { ShaderMedia } from "./features/ShaderMedia";
import { CameraMedia } from "./live/CameraMedia";
import { TrackerMedia } from "./live/TrackerMedia";
import { TestPattern } from "./features/TestPattern";
import { DrawnMedia } from "./features/DrawnMedia";
import { SurfaceGrid } from "./features/SurfaceGrid";

export interface SurfaceMediaProps {
  placementProjection?: import('./source-picture').PictureProjection;
  source?: Surface["source"];
  alphaProjection?: { outer: React.CSSProperties; inner: React.CSSProperties };
  alphaMask?: Surface["alphaMask"];
  bend?: Surface["bend"];
  url?: string;
  kind?: MediaKind;
  /** Text wins over media: a surface is one or the other. */
  text?: TextContent;
  /** A solid colour — lighting a window frame blue is most of projection mapping. */
  fill?: string;
  style: React.CSSProperties;
  timeS: number;
  playing: boolean;
/**
   * Which pattern to paint when a surface has no media yet; omitted paints
   * nothing. The editor canvas and the output window read it from the same
   * document — a viewport that renders something the projector does not is not
   * a preview.
   */
  /**
   * How to paint a surface that has no media yet; omitted paints nothing. The
   * editor passes the show's device look and the projector its external one —
   * the one place those two are meant to differ, because manipulating a plane
   * and judging it against a wall are different jobs.
   */
  placeholder?: SurfaceAppearance;
  loop?: boolean;
}

/** One surface's picture. Video follows the show clock; images just sit there. */
export function SurfaceMedia(props: SurfaceMediaProps) {
  if (props.placementProjection) {
    const projection=props.placementProjection;
    let content=<SurfaceMedia {...props} placementProjection={undefined} alphaProjection={undefined} alphaMask={undefined} style={projection.content} />;
    for (const layer of [...projection.layers].reverse()) content=<div style={layer}>{content}</div>;
    return content;
  }
  if (props.alphaProjection) return <div style={props.alphaProjection.outer}><SurfaceMedia {...props} alphaProjection={undefined} alphaMask={undefined} style={props.alphaProjection.inner} /></div>;
  if (props.source?.effects?.some(e => e.enabled)) {
    const effects = props.source.effects;
    return <div style={{ ...props.style, overflow: 'hidden', ...(props.alphaMask ? { maskImage: `url("${props.alphaMask.png}")`, maskRepeat: 'no-repeat', maskPosition: `${props.source.rect[0]}px ${props.source.rect[1]}px`, maskSize: `${props.source.rect[2]}px ${props.source.rect[3]}px`, maskMode: 'alpha' as const } : {}) }}><VisualEffects effects={effects} timeS={props.timeS}>
      <SurfaceMedia {...props} alphaMask={undefined} source={{ ...props.source, effects: undefined }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </VisualEffects></div>;
  }
  if (props.bend && Math.abs(props.bend.angleDeg) > .001 && props.source) return <BentContent bend={props.bend} rect={props.source.rect} style={props.style}>
    {style => <SurfaceMediaContent {...props} style={style} />}
  </BentContent>;
  return <SurfaceMediaContent {...props} />;
}
function SurfaceMediaContent({
  source,
  url,
  kind,
  text,
  fill,
  style: inputStyle, alphaMask,
  timeS,
  playing,
  placeholder,
  loop = true,
}: SurfaceMediaProps) {
  const rect = source?.rect;
  const style = alphaMask && rect ? { ...inputStyle, maskImage: `url("${alphaMask.png}")`, maskRepeat: 'no-repeat',
    maskPosition: `${rect[0]}px ${rect[1]}px`, maskSize: `${rect[2]}px ${rect[3]}px`, maskMode: 'alpha' as const } : inputStyle;
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoSync(videoRef, timeS, playing, loop, source?.chromaKey?.enabled ? undefined : url);
  useEffect(() => {
    if (!text?.fontData || !text.fontFamily) return;
    const font = new FontFace(text.fontName ?? text.fontFamily, `url(${text.fontData})`);
    let disposed = false;
    void font.load().then((loaded) => { if (!disposed) document.fonts.add(loaded); }).catch(() => {});
    return () => { disposed = true; document.fonts.delete(font); };
  }, [text?.fontData, text?.fontFamily, text?.fontName]);

  if (source?.tracker) return <TrackerMedia source={source.tracker} style={style} timeS={timeS} placeholder={Boolean(placeholder)} />;
  if (source?.webcam) return <CameraMedia source={source.webcam} style={style} placeholder={Boolean(placeholder)} />;
  if (source?.shader) return <ShaderMedia shader={source.shader} url={url} style={style} timeS={timeS} placeholder={Boolean(placeholder)} />;
  if (source?.drawing) return <DrawnMedia timeS={timeS} drawing={source.drawing} rect={source.rect} style={style} />;
  if (source?.testPattern) return <TestPattern style={style} kind={source.testPattern} />;

  if (!text && (fill || source?.fill || source?.fillGradient)) {
    return <VectorFill rect={source?.rect} gradient={source?.fillGradient} color={fill ?? source?.fill ?? "#ffffff"} opacity={source?.fillOpacity ?? 1} style={style} />;
  }

  if (text) {
    return (
      <div
        className="map-text"
        style={{
          ...style,
          ...textAppearance(text),
        }}
      >
        <div style={{ width: "100%" }}>{text.text}</div>
      </div>
    );
  }

  if (kind === "audio") return null;
  if (url && source?.chromaKey?.enabled) return <ChromaKeyMedia url={url} kind={kind === 'video' ? 'video' : 'image'} settings={source.chromaKey}
    style={style} timeS={timeS} playing={playing} loop={loop} />;
  if (url && kind === "video") {
    return <video ref={videoRef} style={style} src={url} muted playsInline />;
  }
  if (url) return <img style={style} src={url} alt="" />;
  return placeholder && source ? <SurfaceGrid rect={source.rect} style={style} look={placeholder} /> : null;
}
