import type { MapShow } from './document';

/** Describe document changes, not pointer events or synthetic activity. */
export function describeMapEdit(before: MapShow, after: MapShow) {
  const changes: string[] = [];
  const compare = (previous: readonly { id: string; name?: string }[], next: readonly { id: string; name?: string }[], noun: string) => {
    const old = new Map(previous.map(item => [item.id, item]));
    const current = new Set(next.map(item => item.id));
    for (const item of next) {
      const prior = old.get(item.id), name = item.name || noun;
      if (!prior) changes.push(`Add ${name}`);
      else if (prior.name !== item.name) changes.push(`Rename ${prior.name || noun} to ${name}`);
      else if (JSON.stringify(prior) !== JSON.stringify(item)) changes.push(`Edit ${name}`);
    }
    for (const item of previous) if (!current.has(item.id)) changes.push(`Remove ${item.name || noun}`);
  };
  compare(before.scenes.flatMap(scene => scene.surfaces).concat(before.unassignedSurfaces), after.scenes.flatMap(scene => scene.surfaces).concat(after.unassignedSurfaces), 'surface');
  compare(before.scenes.map(({ surfaces: _, ...scene }) => scene), after.scenes.map(({ surfaces: _, ...scene }) => scene), 'scene');
  compare(before.outputs, after.outputs, 'output');
  compare(before.visuals ?? [], after.visuals ?? [], 'visual');
  compare(before.pool ?? [], after.pool ?? [], 'media');
  compare(before.shows ?? [], after.shows ?? [], 'show');
  compare(before.timelines ?? [], after.timelines ?? [], 'timeline');
  if (!changes.length) changes.push(before.activeSceneId !== after.activeSceneId ? 'Change active scene' : 'Edit show settings');
  return { label: changes.length === 1 ? changes[0] : `${changes[0]} +${changes.length - 1}`, description: changes.join('\n') };
}
