import { PreviewQuality } from '../features/PreviewQuality';
import { Button, ColorField, NumberField } from '@aether/ui';
import { PaintSourceEditor } from './PaintSourceEditor';
import type { DrawnSource } from '../features/types';
import { useEffect, useRef, useState } from "react";
import { DEFAULT_SURFACE_LOOK, type MapShow, type MediaRef, type Surface } from "../document";
import type { ResolvedSurface } from "../playback";
import { SurfaceMedia } from "../SurfaceMedia";
import { usesMediaPixels } from "../source-picture";
export function InputPreview({ surface, reference, show, urls, timeS, playing, loop, paint }: { paint?: { color:string; widthPx:number; onColor:(color:string) => void; onWidth:(width:number) => void; onStroke:(stroke:DrawnSource['strokes'][number]) => void; onDone:() => void }; surface: Surface | null; reference?: MediaRef; show: MapShow; urls: Record<string, string>; timeS: number; playing: boolean; loop?: boolean }) {
  const host = useRef<HTMLDivElement>(null), [size, setSize] = useState({ width: 1, height: 1 });
  useEffect(() => { const el = host.current!; const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight })); observer.observe(el); return () => observer.disconnect(); }, []);
  const media = show.media.find((m) => m.id === surface?.source.mediaId);
  const cropped = surface && media && usesMediaPixels(surface.source);
  const width = Math.max(1, reference?.width ?? (cropped ? media.width : surface?.source.rect[2] ?? 1280)), height = Math.max(1, reference?.height ?? (cropped ? media.height : surface?.source.rect[3] ?? 720));
  const scale = Math.max(.001, Math.min((size.width - 32) / width, (size.height - 32) / height));
  return <section className="map-input-preview" aria-label="Input preview">
    <div className="map-preview-heading"><strong>Input</strong><span>{reference?.name ?? surface?.name ?? "Select a feature"}</span></div>
    {paint && <div className="map-pool-paint-tools" aria-label="Paint source tools"><ColorField ariaLabel="Paint colour" value={paint.color} onChange={paint.onColor} /><NumberField aria-label="Paint width" value={paint.widthPx} min={1} max={200} unit="px" onValueChange={v => v !== null && paint.onWidth(v)} /><Button onClick={paint.onDone}>Done painting</Button></div>}
    <div ref={host} className="map-input-image">
      {reference ? <img className="map-input-source" alt="Backdrop input image" src={urls[reference.id]} style={{ width, height, zoom:scale, transform:'translate(-50%, -50%)' }} />
      : surface ? <div className="map-input-source" style={{ width, height, zoom:scale, transform:'translate(-50%, -50%)' }}>
        <PreviewQuality.Provider value={{scale,maxPixelCount:4096*2160}}><SurfaceMedia source={surface.source} text={surface.source.text} fill={surface.source.fill} url={media ? urls[media.id] : undefined} kind={media?.kind}
          style={{ width, height }} timeS={(surface as ResolvedSurface).mediaTimeS ?? timeS} playing={playing} loop={loop ?? surface.clips.length === 0} placeholder={(show.surfaceLook ?? DEFAULT_SURFACE_LOOK).device} /></PreviewQuality.Provider>
        {paint && <PaintSourceEditor width={width} height={height} {...paint} />}
        {cropped && <svg className="map-input-crop" width={width} height={height} aria-label="Selected input region">
          <rect x={surface.source.rect[0]} y={surface.source.rect[1]} width={surface.source.rect[2]} height={surface.source.rect[3]} fill="none" stroke="var(--aether-color-accent)" strokeWidth={2 / scale} />
        </svg>}
      </div> : <div className="map-source-message">Select a layer to preview its input before mapping.</div>}
    </div>
  </section>;
}
