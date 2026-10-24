import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { AgentInteraction } from '@aether/ui/AgentServices';
import { mapAgentTools } from './automation/live-commands';
import { MapAgentEditor, type MapAgentState } from './automation/live-workspace';

export function useMapAgent(state: MapAgentState): AgentInteraction {
  const current = useRef(state);
  useLayoutEffect(() => { current.current = state; }, [state]);
  return { contextKey: state.contextKey, tools: mapAgentTools,
    execute: (call, signal) => new MapAgentEditor(() => ({ ...current.current,
      commit: next => flushSync(() => current.current.commit(next)),
      undo: () => flushSync(() => current.current.undo()),
      redo: () => flushSync(() => current.current.redo()),
    })).execute(state.contextKey, call, signal) };
}
