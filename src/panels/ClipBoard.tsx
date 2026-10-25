import { useEffect, useRef, useState } from 'react';
import type { MapShow } from '../document';
import type { Visual } from '../visual-model';
import type { VisualPlacement } from '../visual-placement';
import { useVisualMotionInputs } from '../live/use-visual-motion-inputs';
import { clipBoardRect, isClip } from '../compound-clips';
import { clipPictures } from '../visual-render';
import { OutputSurface } from '../output';
import { contentBounds, measureTextBounds } from '../content-bounds';
import { visualSource } from '../media-pool';
import { PlacementHandles } from './PlacementHandles';

/** The Content workspace's canvas: one compound clip on its own board, no
 * surfaces or projection, with placement handles for the selected visual. */
export function ClipBoard({ show, clipID, urls, timeS, playing, placement }: {
  show: MapShow; clipID: string; urls: Record<string, string>; timeS: number; playing: boolean;
  placement?: { visual: Visual; onChange: (placement: VisualPlacement) => void; onDone?: () => void };
}) {
  const motionInputs = useVisualMotionInputs();
  const host = useRef<HTMLDivElement>(null), board = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    const node = host.current!;
    const observer = new ResizeObserver(() => setSize({ width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  const clip = show.timelines?.find(t => t.id === clipID);
  if (!isClip(clip)) return <div className="map-show-preview" ref={host} aria-label="Clip board" />;
  const frame = clipBoardRect(clip), [, , w, h] = frame;
  const k = Math.max(1e-6, Math.min(size.width / w, size.height / h) * .92);
  const fileUrls = Object.fromEntries(show.media.map(m => [m.file, urls[m.id]]));
  const source = placement && visualSource(show, placement.visual);
  const toLocal = (x: number, y: number): [number, number] => {
    const r = board.current!.getBoundingClientRect();
    return [(x - r.left) / r.width * w, (y - r.top) / r.height * h];
  };
  return <div className="map-show-preview map-clip-board-host" ref={host} aria-label="Clip board">
    <div ref={board} className="map-show-flat map-clip-board" style={{ left: (size.width - w * k) / 2, top: (size.height - h * k) / 2, width: w, height: h, transform: `scale(${k})` }}>
      {clipPictures(show, clip.id, timeS, motionInputs).map(p =>
        <OutputSurface key={p.id} surface={p} show={show} base="" urls={fileUrls} timeS={timeS} playing={playing} />)}
      {placement && source && <PlacementHandles value={placement.visual.placement} frame={frame} bounds={contentBounds(source, frame, measureTextBounds(source))}
        unitPx={1 / k} style={{ position: 'absolute', left: 0, top: 0 }} toLocal={toLocal} onChange={placement.onChange} onDone={placement.onDone} />}
    </div>
    <span className="map-clip-board-label" style={{ left: (size.width - w * k) / 2, top: Math.max(0, (size.height - h * k) / 2 - 22) }}>{clip.name} · {w} × {h}</span>
  </div>;
}
