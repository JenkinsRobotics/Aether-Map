import { useMemo } from 'react';
import { AetherIcon, HistoryPanel } from '@aether/ui';
import type { DocumentHistory } from '../history';
import type { MapShow } from '../document';
import { describeMapEdit } from '../history-description';

const identities = new WeakMap<MapShow, string>();
let serial = 0;
function identity(show: MapShow) {
  if (!identities.has(show)) identities.set(show, `edit-${++serial}`);
  return identities.get(show)!;
}

export function MapHistoryPanel({ history, writable }: { history: DocumentHistory<MapShow>; writable: boolean }) {
  const checkpoint = history.checkpoint.gesture ?? history.checkpoint;
  const entries = useMemo(() => {
    const states = [...checkpoint.past, checkpoint.present, ...checkpoint.future];
    return states.slice(1).map((state, index) => ({
      id: identity(state), ...describeMapEdit(states[index], state), icon: <AetherIcon name="layers"/>, category: 'Show edits',
      current: index + 1 === checkpoint.past.length, inactive: index + 1 > checkpoint.past.length,
      actions: [{ id: 'restore', label: 'Return to this step', icon: <AetherIcon name="history"/>, disabled: !writable || !!history.checkpoint.gesture || index + 1 === checkpoint.past.length }],
    }));
  }, [checkpoint, writable, history.checkpoint.gesture]);
  return <HistoryPanel embedded entries={entries} emptyMessage="Edits to this show will appear here during this session." onCommand={(id, command) => {
    const index = entries.findIndex(entry => entry.id === id);
    if (command === 'restore' && writable && index >= 0 && !history.checkpoint.gesture) history.goTo(index + 1);
  }}/>;
}
