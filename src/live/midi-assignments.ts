import { sourceParameters } from '../source-motion';
import { useEffect, useMemo } from 'react';
import { allSurfaces, type MapShow, type Surface } from '../document';
import { visualSource } from '../media-pool';
import type { ShaderModulation } from '../features/types';
import { setMidiAssignments, stopMidi } from './midi';

/** A projection of saved assignments, never a second mapping or device model. */
export function midiAssignments(show: MapShow, selectedID: string | null) {
  const assigned = new Set<number>(), focused = new Set<number>();
  const add = (m: ShaderModulation | undefined, selected: boolean) => {
    if (m?.source !== 'midi') return;
    const cc = m.control ?? 1;
    if (!Number.isInteger(cc) || cc < 0 || cc > 127) return;
    assigned.add(cc); if (selected) focused.add(cc);
  };
  const source = (s: Surface['source'], selected: boolean) => {
    sourceParameters(s,show.media.find(m=>m.id===s.mediaId)).forEach(p=>add(s.motion?.modulation?.[p.key],selected));
    Object.values(s.shader?.modulation ?? {}).forEach(m => add(m, selected));
    s.effects?.forEach(e => add(e.modulation, selected));
  };
  for (const surface of allSurfaces(show)) {
    source(surface.source, surface.id === selectedID);
    Object.values(surface.modulation ?? {}).forEach(m => add(m, surface.id === selectedID));
    surface.clips.forEach(c => { if (c.source) source(c.source, c.id === selectedID || surface.id === selectedID); });
  }
  for (const visual of show.visuals ?? []) {
    const selected = visual.id === selectedID || visual.assetID === selectedID;
    source(visualSource(show, visual), selected);
    visual.effects?.forEach(e => add(e.modulation, selected));
    Object.values(visual.motion?.modulation ?? {}).forEach(m => add(m, selected));
  }
  return { assigned: [...assigned].sort((a, b) => a - b), focused: [...focused].sort((a, b) => a - b) };
}
export function useMidiAssignments(show: MapShow, selectedID: string | null) {
  const signature = useMemo(() => JSON.stringify(midiAssignments(show, selectedID)), [show, selectedID]);
  useEffect(() => { const value = JSON.parse(signature); setMidiAssignments(value.assigned, value.focused); }, [signature]);
  useEffect(() => () => { setMidiAssignments([], []); stopMidi(); }, []);
}
