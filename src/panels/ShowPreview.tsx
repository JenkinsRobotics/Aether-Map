import { useVisualMotionInputs } from '../live/use-visual-motion-inputs';
import { useEffect, useRef, useState } from 'react';
import { sceneLayers, showForOutput, type MapShow, type ShowOutput } from '../document';
import { sceneSize } from '../scene-size';
import { outputRegion, cropTransform } from '../output-crop';
import { sceneVisuals } from '../visual-render';
import { OutputSurface } from '../output';
import { TestPattern } from '../features/TestPattern';
import { SceneBackdrop } from '../SceneBackdrop';

export function ShowPreview({ show, output, urls, timeS, playing, scenePreview = false }: {
  /** scenePreview also draws the scene's backdrop image when it is toggled on (editor only). */
  show: MapShow; scenePreview?: boolean; output?: ShowOutput; urls: Record<string,string>; timeS: number; playing: boolean;
}) {
  const motionInputs=useVisualMotionInputs();
  const host = useRef<HTMLDivElement>(null);
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
  return <div className="map-show-preview" ref={host} aria-label="Show output preview">
    <div className="map-show-raster" style={{ width: logical.width, height: logical.height, transform: cropTransform(crop, size), clipPath: `polygon(${crop.xPx}px ${crop.yPx}px, ${crop.xPx+crop.widthPx}px ${crop.yPx}px, ${crop.xPx+crop.widthPx}px ${crop.yPx+crop.heightPx}px, ${crop.xPx}px ${crop.yPx+crop.heightPx}px)` }}>
      {scenePreview && scene && <SceneBackdrop show={show} scene={scene} mediaUrls={urls} selectedID={null}/>}
      {!show.output.blackout && (show.output.testPattern ? <TestPattern kind="grid" style={{width:logical.width,height:logical.height}}/> : sceneLayers(bound).map(layer =>
        <div key={layer.scene.id} className="map-mix-layer" style={{opacity:layer.opacity}}>{sceneVisuals(bound,layer.scene,timeS,false,undefined,motionInputs).map(surface =>
          <OutputSurface key={surface.id} surface={surface} show={bound} base="" urls={fileUrls} timeS={timeS} playing={playing}/>)}</div>))}
    </div>
  </div>;
}
