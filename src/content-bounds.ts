import type { CSSProperties } from 'react';
import { quadCorners, type Rect, type Surface, type TextContent } from './document';
import { fittedSourceRect } from './source-picture';
import { project, solveHomography } from './homography';

export function textAppearance(text:TextContent):CSSProperties {
  return {color:text.color,background:text.background,fontSize:text.sizePx,fontFamily:text.fontFamily??'sans-serif',fontWeight:text.fontWeight??400,
    fontStyle:text.italic?'italic':'normal',lineHeight:text.lineHeight??1.2,letterSpacing:text.letterSpacingPx??0,whiteSpace:'pre-wrap',textAlign:text.align,
    justifyContent:text.align==='left'?'flex-start':text.align==='right'?'flex-end':'center'};
}
const measurements=new Map<string,Rect>();
export function clearTextMeasurements(){measurements.clear();}
/** Measure the browser's actual wrapped text, including imported fonts and spacing.
 * This is editor geometry only; it neither crops nor moves the rendered text. */
export function measureTextBounds(source:Surface['source']):Rect {
  const text=source.text,rect=source.rect;
  if(!text||text.background&&text.background!=='transparent'||typeof document==='undefined')return rect;
  const key=JSON.stringify([text,rect]);const cached=measurements.get(key);if(cached)return cached;
  const host=document.createElement('div'),inner=document.createElement('div');host.className='map-text';
  Object.assign(host.style,textAppearance(text));
  Object.assign(host.style,{fontSize:`${text.sizePx}px`,letterSpacing:`${text.letterSpacingPx??0}px`,position:'fixed',left:'-100000px',top:'0',width:`${rect[0]+rect[2]}px`,height:`${rect[1]+rect[3]}px`,visibility:'hidden',pointerEvents:'none'});
  inner.style.width='100%';inner.textContent=text.text;host.append(inner);document.body.append(host);
  const range=document.createRange();range.selectNodeContents(inner);
  if(typeof range.getBoundingClientRect!=='function'){host.remove();return rect;}
  const box=range.getBoundingClientRect(),outer=host.getBoundingClientRect();
  const left=Math.max(rect[0],box.left-outer.left),top=Math.max(rect[1],box.top-outer.top);
  const right=Math.min(rect[0]+rect[2],box.right-outer.left),bottom=Math.min(rect[1]+rect[3],box.bottom-outer.top);
  host.remove();const result:Rect=right>left&&bottom>top?[left,top,right-left,bottom-top]:rect;
  if(measurements.size>128)measurements.clear();measurements.set(key,result);return result;
}
/** Visible input region mapped to the unplaced target. Contain margins are excluded. */
export function contentBounds(source:Surface['source'],frame:Rect,ink:Rect=source.rect,fitCorners=quadCorners(frame)):Rect {
  const fitted=fittedSourceRect({source,corners:fitCorners} as Surface);
  const x=Math.max(ink[0],source.rect[0],fitted[0]),y=Math.max(ink[1],source.rect[1],fitted[1]);
  const right=Math.min(ink[0]+ink[2],source.rect[0]+source.rect[2],fitted[0]+fitted[2]);
  const bottom=Math.min(ink[1]+ink[3],source.rect[1]+source.rect[3],fitted[1]+fitted[3]);
  if(right<=x||bottom<=y)return frame;
  const m=solveHomography(quadCorners(fitted),quadCorners(frame)),a=project(m,[x,y]),b=project(m,[right,bottom]);
  return [a[0],a[1],b[0]-a[0],b[1]-a[1]];
}
