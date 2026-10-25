import type { Clip, Surface } from './document';

export interface VisualTarget {
  sceneID: string;
  /** Omitted means the entire scene. */
  surfaceID?: string;
}
export type VisualMapping = 'repeat' | 'span';
export interface VisualEffect {
  id: string;
  kind: import('./visual-effects').VisualEffectKind;
  enabled: boolean;
  amount: number;
  modulation?: import('./features/types').ShaderModulation;
  animation?: import('./features/types').FeatureKeyframe[];
}
export type VisualLookSlot = 'A' | 'B' | 'C';
/** Complete appearance snapshot; identity, timing and targets belong to the clip. */
export interface VisualLook {
  /** Preserved older A/B/C entries change only the shader while it is active. */
  shaderOnly?:true;
  source:Surface['source']; opacity:number; mapping:VisualMapping;
  placement?:import('./visual-placement').VisualPlacement;
  motion?:import('./visual-motion').VisualMotion;
  effects?:VisualEffect[];
}
/** Scheduled use of a reusable source. Targets of this one clip share playback. */
export interface Visual extends Clip {
  looks?:Partial<Record<VisualLookSlot,VisualLook>>;
  motion?: import('./visual-motion').VisualMotion;
  placement?: import('./visual-placement').VisualPlacement;
  name: string;
  /** Explicit per-clip override; omitted means inherit the reusable source. */
  source?: Surface['source'];
  assetID?: string;
  /** Scheduled reusable timeline; child clips retain their own surface targets. */
  timelineRefID?: string;
  /** A clip use: how the clip's board fits where it lands (absent: stretch, as before clips). */
  clipFit?: import('./timelines').ClipFit;
  /** A clip use: seconds it takes to fade in from its start (absent: a cut). */
  transitionS?: number;
  trackID?: string;
  targets: VisualTarget[];
  mapping: VisualMapping;
  continuous?: boolean;
  color: string;
  opacity: number;
  effects?: VisualEffect[];
  /** Old overlapping clips selected the first active clip within their track. */
  legacyTrack?: string;
  /** Masks preserve their original compositing position without appearing as visual assets. */
  mask?: boolean;
  /** Visual layers list group. A list-view grouping only; paint order is the array order. */
  folder?: string;
}
