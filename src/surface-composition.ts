import type { VisualMotionInputs } from './visual-motion';
import { activeScene, quadCorners, type MapShow, type Quad, type Rect, type Surface } from './document';
import { evaluateSurface } from './playback';
import { project, solveHomography } from './homography';
import { sceneVisuals } from './visual-render';
import { mapMaskCurves } from './mask/curves';

/** A flat editing projection of the same evaluated picture sent to outputs. */
export function surfaceComposition(show:MapShow, surface:Surface, timeS:number, normalized=true, inputs:VisualMotionInputs={}) {
  const ratio=surface.compositionAspectRatio ?? (surface.groupShape==='cube' ? 1 : surface.source.rect[2]/surface.source.rect[3]);
  const area=surface.source.rect[2]*surface.source.rect[3];
  let frame:Rect=[0,0,Math.sqrt(area*ratio),Math.sqrt(area/ratio)];
  const evaluated=evaluateSurface(surface,timeS,show.media);
  const xs=evaluated.corners.map(p=>p[0]),ys=evaluated.corners.map(p=>p[1]),left=Math.min(...xs),top=Math.min(...ys);
  if(!normalized)frame=[0,0,Math.max(...xs)-left,Math.max(...ys)-top];
  const inverse=normalized?solveHomography(evaluated.corners,quadCorners(frame)):[1,0,-left,0,1,-top,0,0,1];
  const pictures=sceneVisuals(show,activeScene(show),timeS,false,surface.id,inputs).map(p=>({...p,
    corners:p.corners.map(point=>project(inverse,point)) as Quad,
    masks:p.masks.map(mask=>mask.map(point=>project(inverse,point))),
    ...(p.maskCurves?{maskCurves:mapMaskCurves(p.maskCurves,point=>project(inverse,point))}:{}),
    ...(p.alphaProjection?{alphaProjection:{...p.alphaProjection,corners:p.alphaProjection.corners.map(point=>project(inverse,point)) as Quad}}:{}),
  }));
  return {frame,pictures};
}
