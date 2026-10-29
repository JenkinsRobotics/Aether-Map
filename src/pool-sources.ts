import { newFeature } from './features/new-feature';
import type { Surface } from './document';

export const POOL_SOURCES = [
  { id:'text', label:'Text', icon:'text', group:'Generated', description:'Titles and lettering' },
  { id:'shader', label:'Shader', icon:'palette', group:'Generated', description:'Procedural visuals' },
  { id:'paint', label:'Paint', icon:'brush', group:'Generated', description:'Draw a reusable visual' },
  { id:'colour', label:'Colour', icon:'palette', group:'Generated', description:'Solid colour or gradient' },
  { id:'test-pattern', label:'Test pattern', icon:'surface', group:'Generated', description:'Grid and colour bars' },
  { id:'webcam', label:'Webcam', icon:'camera', group:'Live inputs', description:'Live camera feed' },
  { id:'tracker', label:'Tracker', icon:'tracker', group:'Live inputs', description:'Camera-driven hand visuals' },
  { id:'cast', label:'Cast', icon:'connector', group:'Live inputs', description:'Whatever is cast to the player' },
] as const;
export type PoolSourceKind = typeof POOL_SOURCES[number]['id'];
export function poolSource(kind: PoolSourceKind, size: { width:number; height:number }): Surface['source'] {
  if (kind === 'text' || kind === 'shader' || kind === 'webcam' || kind === 'tracker' || kind === 'cast') return newFeature(kind, size, 0).source;
  return { mediaId:null, rect:[0,0,size.width,size.height],
    ...(kind === 'paint' ? { drawing:{strokes:[]} } : kind === 'colour' ? { fill:'#ffffff' } : { testPattern:'grid' as const }) };
}
