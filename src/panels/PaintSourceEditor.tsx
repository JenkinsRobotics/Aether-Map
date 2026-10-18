import { useRef, useState } from 'react';
import type { DrawnSource } from '../features/types';

type Stroke = DrawnSource['strokes'][number];
/** Paint in source pixels so every timeline use shares the same drawing. */
export function PaintSourceEditor({ width, height, color, widthPx, onStroke }: { width:number; height:number; color:string; widthPx:number; onStroke:(stroke:Stroke) => void }) {
  const points = useRef<[number, number][]>([]), [preview, setPreview] = useState('');
  return <svg className="map-pool-paint-canvas" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Paint source canvas"
    onPointerDown={e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
      const box = e.currentTarget.getBoundingClientRect();
      points.current = [[(e.clientX-box.left)*width/box.width, (e.clientY-box.top)*height/box.height]];
      setPreview(points.current.map(p => p.join(',')).join(' '));
    }} onPointerMove={e => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const box = e.currentTarget.getBoundingClientRect();
      points.current.push([Math.max(0,Math.min(width,(e.clientX-box.left)*width/box.width)),Math.max(0,Math.min(height,(e.clientY-box.top)*height/box.height))]);
      setPreview(points.current.map(p => p.join(',')).join(' '));
    }} onPointerUp={e => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (points.current.length > 1) onStroke({ points:points.current, color, widthPx });
      points.current = []; setPreview('');
    }} onPointerCancel={() => { points.current=[]; setPreview(''); }}>
    <polyline points={preview} fill="none" stroke={color} strokeWidth={widthPx} strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
