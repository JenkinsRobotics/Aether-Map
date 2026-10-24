import type { CSSProperties } from "react";
import { quadCorners, type MediaRef, type Surface, type Rect } from "./document";
import { cssMatrix3d, solveHomography, project } from "./homography";
import { placementCorners } from './visual-placement';
import type { ResolvedSurface } from './playback';

export interface PictureProjection { layers:CSSProperties[]; content:CSSProperties }
/** Fixed surface clipping/warp surrounds independently placed clip content. */
export function placementProjectionStyle(surface:Surface, media?:MediaRef): PictureProjection | undefined {
  const resolved=surface as ResolvedSurface;
  if (!resolved.visualPlacement) return undefined;
  const frame=resolved.contentFrame ?? surface.source.rect;
  const shell={...surface,source:{mediaId:null,rect:frame}};
  const alpha=alphaProjectionStyle(shell,undefined);
  const outer=sourcePictureStyle(shell);
  if (surface.alphaMask && !alpha) Object.assign(outer,{maskImage:`url("${surface.alphaMask.png}")`,maskRepeat:'no-repeat',maskPosition:`${frame[0]}px ${frame[1]}px`,maskSize:`${frame[2]}px ${frame[3]}px`,maskMode:'alpha'});
  return { layers:alpha?[alpha.outer,alpha.inner]:[outer], content:sourcePictureStyle({...surface,corners:placementCorners(resolved.visualPlacement,frame),shape:undefined,radiusPx:undefined},media) };
}

export function usesMediaPixels(source: Surface["source"]): boolean {
  return Boolean(source.mediaId && !source.shader && !source.text && !source.fill && !source.fillGradient && !source.webcam && !source.tracker && !source.testPattern);
}

/** Crop in input pixels first, then warp that exact region onto the output quad. */
export function fittedSourceRect(surface: Surface): Rect {
  const [x, y, w, h] = surface.source.rect, fit = surface.source.fit;
  if (!fit || fit === 'stretch') return surface.source.rect;
  const q = surface.corners;
  const length = (a: number, b: number) => Math.hypot(q[a][0] - q[b][0], q[a][1] - q[b][1]);
  // A skewed plane has no unique physical aspect ratio. Use mean opposite edges.
  const ratio = (length(0, 1) + length(2, 3)) / (length(1, 2) + length(3, 0));
  if (!Number.isFinite(ratio) || ratio <= 0) return surface.source.rect;
  const expandWidth = fit === 'contain' ? w / h < ratio : w / h > ratio;
  const width = expandWidth ? h * ratio : w, height = expandWidth ? h : w / ratio;
  return [x + (w - width) / 2, y + (h - height) / 2, width, height];
}
export function sourcePictureStyle(surface: Surface, media?: MediaRef, mapping = false): CSSProperties {
  const [x, y, w, h] = surface.source.rect;
  const fitted = mapping ? surface.source.rect : fittedSourceRect(surface);
  const [fx, fy, fw, fh] = fitted;
  // Contain adds transparent margins, never reveals pixels outside an authored crop.
  const left = Math.max(x, fx), top = Math.max(y, fy);
  const right = Math.min(x + w, fx + fw), bottom = Math.min(y + h, fy + fh);
  const width = usesMediaPixels(surface.source) && media ? media.width : x + w;
  const height = usesMediaPixels(surface.source) && media ? media.height : y + h;
  const radius = Math.min(surface.radiusPx ?? 0, w / 2, h / 2);
  return {
    transformOrigin: "0 0",
    transform: cssMatrix3d(solveHomography(quadCorners(fitted), surface.corners), true),
    width, height,
    clipPath: surface.shape === "ellipse"
      ? `ellipse(${w / 2}px ${h / 2}px at ${x + w / 2}px ${y + h / 2}px)`
      : `inset(${top}px ${width - right}px ${height - bottom}px ${left}px round ${radius}px)`,
    overflow: "hidden",
  };
}

/** Keep a target's bitmap mask in its own warped coordinates while a Span source
 * uses scene coordinates. Parent T and child T^-1*F compose to the same F as the
 * other faces; the GPU masks between them without rasterizing per frame. */
export function alphaProjectionStyle(surface: Surface & { alphaProjection?: { corners: Surface['corners']; rect: Rect } }, media?: MediaRef): { outer: CSSProperties; inner: CSSProperties } | undefined {
  const target = surface.alphaProjection;
  if (!target || !surface.alphaMask) return undefined;
  try {
  const [x, y, w, h] = target.rect;
  const inverse = solveHomography(target.corners, quadCorners(target.rect));
  const local = { ...surface, corners: surface.corners.map(point => project(inverse, point)) as Surface['corners'] };
  return { outer: { position: 'absolute', left: 0, top: 0, width: x + w, height: y + h, transformOrigin: '0 0',
    transform: cssMatrix3d(solveHomography(quadCorners(target.rect), target.corners), true),
    maskImage: `url("${surface.alphaMask.png}")`, maskRepeat: 'no-repeat', maskPosition: `${x}px ${y}px`, maskSize: `${w}px ${h}px`, maskMode: 'alpha' },
    inner: sourcePictureStyle(local, media) };
  } catch { return undefined; }
}
