import type { VisualEffect } from './visual-model';

/** One catalog for authoring, saved files, agents and source-space rendering. */
export const VISUAL_EFFECTS = [
  { value: 'slide', label: 'Slide', min: -100, max: 100, initial: 25, step: 1, amountLabel: 'Speed', help: 'Scroll horizontally, wrapping at the edges. Negative values reverse direction.' },
  { value: 'rotate', label: 'Rotate', min: -100, max: 100, initial: 25, step: 1, amountLabel: 'Speed', help: 'Rotate continuously with visual time. Negative values reverse direction.' },
  { value: 'zoom', label: 'Zoom', min: -100, max: 100, initial: 25, step: 1, amountLabel: 'Amount', help: 'Enlarge or reduce the content around its center.' },
  { value: 'kaleido', label: 'Kaleido', min: 2, max: 16, initial: 6, step: 1, amountLabel: 'Segments', help: 'Reflect the visual into radial kaleidoscope segments.' },
  { value: 'tile', label: 'Tile', min: 1, max: 8, initial: 3, step: 1, amountLabel: 'Repeats', help: 'Repeat the complete visual in a square grid.' },
  { value: 'blur', label: 'Blur', min: -100, max: 100, initial: 25, step: 1, amountLabel: 'Amount', help: 'Soften the picture before it is mapped onto your surfaces.' },
  { value: 'grayscale', label: 'Black & white', min: -100, max: 100, initial: 100, step: 1, amountLabel: 'Amount', help: 'Remove color while retaining brightness and transparency.' },
  { value: 'hue', label: 'Color cycle', min: -100, max: 100, initial: 25, step: 1, amountLabel: 'Speed', help: 'Cycle the hue over time without changing the visual source.' },
  { value: 'crt', label: 'CRT', min: 0, max: 100, initial: 50, step: 1, amountLabel: 'Strength', help: 'Add curved-screen distortion and dark scanlines.' },
  { value: 'vintage', label: 'Vintage', min: 0, max: 100, initial: 50, step: 1, amountLabel: 'Strength', help: 'Add faded warm color, film grain and a dark vignette.' },
  { value: 'fisheye', label: 'Fisheye', min: -100, max: 100, initial: 50, step: 1, amountLabel: 'Distortion', help: 'Bend the picture around its center. Negative values invert the lens.' },
] as const;
export type VisualEffectKind = typeof VISUAL_EFFECTS[number]['value'];
export const effectDefinition = (kind: VisualEffectKind) => VISUAL_EFFECTS.find(e => e.value === kind)!;
export const isEffectKind = (kind: unknown): kind is VisualEffectKind => VISUAL_EFFECTS.some(e => e.value === kind);
export function effectAmount(kind: VisualEffectKind, value: number): number {
  const spec = effectDefinition(kind);
  const bounded = Math.max(spec.min, Math.min(spec.max, Number.isFinite(value) ? value : spec.initial));
  return kind === 'tile' || kind === 'kaleido' ? Math.round(bounded) : bounded;
}
export function newVisualEffect(kind: VisualEffectKind, id: string): VisualEffect {
  return { id, kind, enabled: true, amount: effectDefinition(kind).initial };
}
