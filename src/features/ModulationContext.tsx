import { createContext, useContext } from 'react';
import { DEFAULT_LFOS, type Lfo } from './types';

export const ModulationContext = createContext<{ lfos: readonly Lfo[]; timeS: number; onLfos?: (lfos: Lfo[]) => void }>({ lfos: DEFAULT_LFOS, timeS: 0 });
export const useModulation = () => useContext(ModulationContext);
