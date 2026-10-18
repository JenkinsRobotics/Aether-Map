import { createContext, useContext } from 'react';
import { useModulation } from './ModulationContext';

/** Local media time for parameter curves; shared LFOs still use scene time. */
export const ParameterClock = createContext<number | null>(null);
export function useParameterClock() {
  const local = useContext(ParameterClock), shared = useModulation();
  return local ?? shared.timeS;
}
