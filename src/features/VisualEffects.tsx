import { useLiveLevels } from '../live/use-live-levels';
import { useMidi } from '../live/midi';
import { useModulation } from './ModulationContext';
import { effectValueAt } from './effect-motion';
import { Fragment, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { VisualEffect } from '../visual-model';
import { effectAmount } from '../visual-effects';
import { effectWarpMap, type WarpKind } from './effect-warp';

function effectStyle(effect: VisualEffect, timeS: number): CSSProperties {
  const amount = effectAmount(effect.kind, effect.amount) / 100;
  switch (effect.kind) {
    case 'blur': return { filter: `blur(${Math.abs(amount) * 20}px)` };
    case 'grayscale': return { filter: `grayscale(${Math.abs(amount)})` };
    case 'hue': return { filter: `hue-rotate(${timeS * amount * 360}deg)` };
    case 'rotate': return { transform: `rotate(${timeS * amount * 360}deg)` };
    case 'zoom': return { transform: `scale(${Math.max(.01, 1 + amount)})` };
    default: return {};
  }
}
const svgImage = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${body}</svg>`)}`;
const scanlines = svgImage('<defs><pattern id="s" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="white"/><rect width="4" height="1" fill="#333"/></pattern></defs><rect width="512" height="512" fill="url(#s)"/>');
const vignette = svgImage('<defs><radialGradient id="v"><stop offset=".25" stop-color="white"/><stop offset="1" stop-color="#333"/></radialGradient></defs><rect width="512" height="512" fill="url(#v)"/>');
const box = { x: 0, y: 0, width: 1, height: 1 };

function SourceEffect({ effect, timeS, children }: { effect: VisualEffect; timeS: number; children: ReactNode }) {
  const id = `map-effect-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const warp = ['kaleido','fisheye','crt'].includes(effect.kind);
  const levels = useLiveLevels(), midi = useMidi(), shared = useModulation();
  const amount = effectValueAt(effect, timeS, shared.timeS, levels, midi.controls, shared.lfos), strength = Math.abs(amount) / 100;
  const frame = useRef<HTMLDivElement>(null), [aspect, setAspect] = useState(1);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!warp || !element) return;
    const measure = () => { if (element.clientWidth && element.clientHeight) setAspect(element.clientHeight / element.clientWidth); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [warp]);
  const map = useMemo(() => warp && (effect.kind === 'kaleido' || amount !== 0) ? effectWarpMap(effect.kind as WarpKind, amount, aspect) : [], [warp, effect.kind, amount, aspect]);
  const svg = warp || effect.kind === 'tile' || effect.kind === 'slide' || effect.kind === 'vintage';
  if (!svg) return <div data-visual-effect={effect.kind} data-effect-amount={amount} style={{ position: 'absolute', inset: 0, ...effectStyle({ ...effect, amount }, timeS) }}>{children}</div>;
  // At zero strength the source must be bit-for-bit unchanged, including alpha.
  const offset = ((timeS * amount / 100) % 1 + 1) % 1;
  const identity = effect.kind === 'tile' ? amount === 1 : effect.kind === 'slide' ? offset === 0 : effect.kind !== 'kaleido' && amount === 0;
  return <div ref={frame} data-visual-effect={effect.kind} data-effect-amount={amount} style={{ position: 'absolute', inset: 0 }}>
    {!identity && <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}><defs>
      <filter id={id} filterUnits="objectBoundingBox" primitiveUnits="objectBoundingBox" {...box} colorInterpolationFilters="sRGB">
        {warp && <>{map.map((tile, i) => <Fragment key={i}>
          <feImage href={tile.url} preserveAspectRatio="none" x={tile.imageX} y={tile.imageY} width={tile.imageSize} height={tile.imageSize} result={`map-${i}`} />
          <feOffset in="SourceGraphic" dx={-tile.dx} dy={-tile.dy} x={tile.x - tile.scale} y={tile.y - tile.scale / aspect} width={tile.width + tile.scale * 2} height={tile.height + tile.scale / aspect * 2} result={`shift-${i}`} />
          <feDisplacementMap in={`shift-${i}`} in2={`map-${i}`} scale={tile.scale} xChannelSelector="R" yChannelSelector="G" x={tile.x} y={tile.y} width={tile.width} height={tile.height} result={`tile-${i}`} />
        </Fragment>)}<feMerge result="picture">{map.map((_, i) => <feMergeNode key={i} in={`tile-${i}`}/>)}</feMerge></>}
        {effect.kind === 'tile' && <><feOffset in="SourceGraphic" dx="0" dy="0" x="0" y="0" width={1 / amount} height={1 / amount} result="cell"/><feTile in="cell" {...box}/></>}
        {effect.kind === 'slide' && <><feOffset in="SourceGraphic" dx={offset} result="right" />
          <feOffset in="SourceGraphic" dx={offset - 1} result="left" />
          <feMerge><feMergeNode in="right"/><feMergeNode in="left"/></feMerge></>}
        {effect.kind === 'crt' && <><feImage href={scanlines} preserveAspectRatio="none" {...box} result="lines" />
          <feBlend in="picture" in2="lines" mode="multiply" result="striped" />
          <feComposite in="striped" in2="picture" operator="in" result="clipped"/>
          <feComposite in="clipped" in2="picture" operator="arithmetic" k2={strength} k3={1 - strength}/></>}
        {effect.kind === 'vintage' && <>
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="opaque"/>
          <feColorMatrix in="opaque" type="saturate" values={String(1 - strength * .65)} result="muted" />
          <feComponentTransfer in="muted" result="faded">
            <feFuncR type="linear" slope={1 - strength * .2} intercept={strength * .16}/>
            <feFuncG type="linear" slope={1 - strength * .25} intercept={strength * .09}/>
            <feFuncB type="linear" slope={1 - strength * .4} intercept={strength * .04}/>
          </feComponentTransfer>
          <feTurbulence type="fractalNoise" baseFrequency="220" numOctaves="1" seed={Math.floor(Math.max(0, timeS) * 12) % 997} {...box} result="grain" />
          <feBlend in="faded" in2="grain" mode="soft-light" result="grained"/>
          <feComposite in="grained" in2="faded" operator="arithmetic" k2={strength * .3} k3={1 - strength * .3} result="film"/>
          <feImage href={vignette} preserveAspectRatio="none" {...box} result="edges"/>
          <feBlend in="film" in2="edges" mode="multiply" result="shaded"/>
          <feComposite in="shaded" in2="film" operator="arithmetic" k2={strength} k3={1 - strength} result="final"/>
          <feComposite in="final" in2="SourceAlpha" operator="in"/>
        </>}
      </filter>
    </defs></svg>}
    <div style={{ position: 'absolute', inset: 0, filter: identity ? undefined : `url(#${id})` }}>{effect.kind === 'tile' && !identity ? <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 / amount})`, transformOrigin: '0 0' }}>{children}</div> : children}</div>
  </div>;
}
/** Ordered effects in source coordinates, before the surface's homography. */
export function VisualEffects({ effects, timeS, children }: { effects: VisualEffect[]; timeS: number; children: ReactNode }) {
  return effects.filter(e => e.enabled).reduce<ReactNode>((content, e) => <SourceEffect key={e.id} effect={e} timeS={timeS}>{content}</SourceEffect>, children);
}
