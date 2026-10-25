import { useVisualMotionInputs } from '../live/use-visual-motion-inputs';
import { useEffect, useRef, useState } from 'react';
import { quadCorners, sceneLayers, showForOutput, type MapShow, type Quad, type Rect, type ShowOutput, type Surface } from '../document';
import type { Visual } from '../visual-model';
import { sceneSize } from '../scene-size';
import { outputRegion, cropTransform } from '../output-crop';
import { boardBounds, sceneVisuals } from '../visual-render';
import { OutputSurface } from '../output';
import { TestPattern } from '../features/TestPattern';
import { SceneBackdrop } from '../SceneBackdrop';
import { cssMatrix3d, project, solveHomography } from '../homography';
import { contentBounds, measureTextBounds } from '../content-bounds';
import { visualSource } from '../media-pool';
import type { VisualPlacement } from '../visual-placement';
import { PlacementHandles } from './PlacementHandles';

export function ShowPreview({ show, output, urls, timeS, playing, scenePreview = false, focus, placement }: {
  /** scenePreview also draws the scene's backdrop image when it is toggled on (editor only). */
  show: MapShow; scenePreview?: boolean; output?: ShowOutput; urls: Record<string,string>; timeS: number; playing: boolean;
  /** Render this surface straight-on (its content frame, un-warped) instead of the whole scene. */
  focus?: Surface;
  /** On-canvas placement handles for this visual, on the focused surface or its first target. */
  placement?: { visual: Visual; onChange: (placement: VisualPlacement) => void; onDone?: () => void };
}) {
  const motionInputs=useVisualMotionInputs();
  const host = useRef<HTMLDivElement>(null), raster = useRef<HTMLDivElement>(null), flat = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    const node = host.current!;
    const observer = new ResizeObserver(() => setSize({ width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  const bound = scenePreview ? show : showForOutput(show, output), logical = sceneSize(bound);
  const crop = scenePreview ? { xPx: 0, yPx: 0, widthPx: logical.width, heightPx: logical.height, fit: 'contain' as const } : outputRegion(bound, output, logical);
  const scene = show.scenes.find(s => s.id === show.activeSceneId);
  const fileUrls = Object.fromEntries(show.media.map(m => [m.file, urls[m.id]]));
  const content = <>
    {scenePreview && scene && <SceneBackdrop show={show} scene={scene} mediaUrls={urls} selectedID={null}/>}
    {!show.output.blackout && (show.output.testPattern ? <TestPattern kind="grid" style={{width:logical.width,height:logical.height}}/> : sceneLayers(bound).map(layer =>
      <div key={layer.scene.id} className="map-mix-layer" style={{opacity:layer.opacity}}>{sceneVisuals(bound,layer.scene,timeS,false,undefined,motionInputs).map(surface =>
        <OutputSurface key={surface.id} surface={surface} show={bound} base="" urls={fileUrls} timeS={timeS} playing={playing}/>)}</div>))}
  </>;

  // The frame the handles edit: the focused surface, else the visual's first
  // target on this canvas (or the canvas itself for a scene-wide visual).
  const target = focus ?? (placement && scene?.surfaces.find(s => placement.visual.targets.some(t => t.sceneID === scene.id && t.surfaceID === s.id)));
  const frame: Rect = target ? target.source.rect : [0, 0, logical.width, logical.height];
  const corners: Quad = target ? target.corners : quadCorners(frame);
  const source = placement && visualSource(show, placement.visual);
  // A clip use's picture is its board, fitted to the frame.
  const useBoard = placement?.visual.timelineRefID ? show.timelines?.find(t => t.id === placement.visual.timelineRefID)?.board : undefined;
  const handles = (style: React.CSSProperties, toLocal: (x: number, y: number) => [number, number], unitPx: number) => placement && source &&
    <PlacementHandles value={placement.visual.placement} frame={frame} bounds={useBoard ? boardBounds(useBoard, frame, placement.visual.clipFit ?? 'stretch') : contentBounds(source, frame, measureTextBounds(source))}
      unitPx={unitPx} style={style} toLocal={toLocal} onChange={placement.onChange} onDone={placement.onDone} />;

  if (focus) {
    // Straight-on: un-warp the scene so this surface's frame faces the viewer.
    const [fx, fy, fw, fh] = frame, s = Math.min(size.width / fw, size.height / fh);
    const toLocal = (x: number, y: number): [number, number] => { const r = flat.current!.getBoundingClientRect(); return [fx + (x - r.left) / r.width * fw, fy + (y - r.top) / r.height * fh]; };
    return <div className="map-show-preview" ref={host} aria-label="Surface preview">
      <div ref={flat} className="map-show-flat" style={{ left: (size.width - fw * s) / 2, top: (size.height - fh * s) / 2, width: fw, height: fh, transform: `scale(${s})` }}>
        <div className="map-show-raster" style={{ width: logical.width, height: logical.height, transform: cssMatrix3d(solveHomography(focus.corners, quadCorners([0, 0, fw, fh]))) }}>{content}</div>
        {handles({ position: 'absolute', left: 0, top: 0 }, toLocal, 1 / s)}
      </div>
    </div>;
  }
  const toLocal = (x: number, y: number): [number, number] => {
    const r = raster.current!.getBoundingClientRect(), k = r.width / logical.width;
    return project(solveHomography(corners, quadCorners(frame)), [(x - r.left) / k, (y - r.top) / k]) as [number, number];
  };
  const k = Math.min(size.width / logical.width, size.height / logical.height);
  return <div className="map-show-preview" ref={host} aria-label="Show output preview">
    <div ref={raster} className="map-show-raster" style={{ width: logical.width, height: logical.height, transform: cropTransform(crop, size), clipPath: `polygon(${crop.xPx}px ${crop.yPx}px, ${crop.xPx+crop.widthPx}px ${crop.yPx}px, ${crop.xPx+crop.widthPx}px ${crop.yPx+crop.heightPx}px, ${crop.xPx}px ${crop.yPx+crop.heightPx}px)` }}>
      {content}
      {handles({ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: cssMatrix3d(solveHomography(quadCorners([0, 0, frame[2], frame[3]]), corners)) }, toLocal, 1 / Math.max(k, 1e-6))}
    </div>
  </div>;
}
