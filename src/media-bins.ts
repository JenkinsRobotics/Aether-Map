import { nextId, type MapShow } from './document';

/** A Media pool entry: an imported or generated source, or a compound clip. */
export interface PoolRef { kind: 'asset' | 'clip'; id: string }

/** The pool's bins (Resolve): saved empty bins plus every folder in use, one each. */
export function poolBins(show: MapShow): string[] {
  return [...new Set([...(show.poolBins ?? []), ...(show.pool ?? []).flatMap(a => a.folder ? [a.folder] : []),
    ...(show.timelines ?? []).flatMap(t => t.board && t.folder ? [t.folder] : [])])].sort((a, b) => a.localeCompare(b));
}
export function addBin(show: MapShow, name: string): MapShow {
  return poolBins(show).includes(name) ? show : { ...show, poolBins: [...(show.poolBins ?? []), name] };
}
/** Files entries into a bin; undefined is the Master bin. */
export function moveToBin(show: MapShow, refs: readonly PoolRef[], bin: string | undefined): MapShow {
  const has = (kind: PoolRef['kind'], id: string) => refs.some(r => r.kind === kind && r.id === id);
  const file = <T extends { id: string; folder?: string }>(item: T, kind: PoolRef['kind']): T => {
    if (!has(kind, item.id)) return item;
    const { folder: _folder, ...rest } = item;
    return (bin ? { ...rest, folder: bin } : rest) as T;
  };
  return { ...(bin ? addBin(show, bin) : show), pool: show.pool?.map(a => file(a, 'asset')), timelines: show.timelines?.map(t => file(t, 'clip')) };
}
export function renameBin(show: MapShow, from: string, to: string): MapShow {
  const name = (folder?: string) => folder === from ? to : folder;
  return { ...show, poolBins: [...new Set((show.poolBins ?? []).map(b => name(b)!))],
    pool: show.pool?.map(a => a.folder === from ? { ...a, folder: to } : a),
    timelines: show.timelines?.map(t => t.board && t.folder === from ? { ...t, folder: to } : t) };
}
/** Deleting a bin never deletes media: its entries return to Master. */
export function removeBin(show: MapShow, bin: string): MapShow {
  const refs: PoolRef[] = [...(show.pool ?? []).filter(a => a.folder === bin).map(a => ({ kind: 'asset' as const, id: a.id })),
    ...(show.timelines ?? []).filter(t => t.board && t.folder === bin).map(t => ({ kind: 'clip' as const, id: t.id }))];
  const next = moveToBin(show, refs, undefined);
  return { ...next, poolBins: next.poolBins?.filter(b => b !== bin) };
}
export function duplicatePoolAsset(show: MapShow, id: string): MapShow {
  const asset = show.pool?.find(a => a.id === id);
  if (!asset) return show;
  return { ...show, pool: [...show.pool!, { ...structuredClone(asset), id: nextId('pool'), name: `${asset.name} copy` }] };
}
