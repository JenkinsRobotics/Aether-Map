import type { DrawnSource } from './types';

export function strokeLengths(strokes: DrawnSource['strokes']): number[] {
  return strokes.map(stroke => stroke.points.reduce((sum, point, index, points) =>
    sum + (index ? Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) : 0), 0));
}
/** Reveal in authored order at constant spatial speed, independent of sampling density. */
export function drawingProgress(lengths: readonly number[], replay: DrawnSource['replay'], timeS: number): number[] {
  if (!replay) return lengths.map(() => 1);
  const duration = Math.max(.1, replay.durationS);
  const time = Math.max(0, Number.isFinite(timeS) ? timeS : 0);
  const fraction = replay.loop ? (time % duration) / duration : Math.min(1, time / duration);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = total * fraction;
  return lengths.map(length => {
    const progress = length > 0 ? Math.max(0, Math.min(1, remaining / length)) : 0;
    remaining -= length;
    return progress;
  });
}
