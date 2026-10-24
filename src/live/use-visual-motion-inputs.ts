import { useLiveLevels } from './use-live-levels';
import { useMidi } from './midi';
/** The same normalized live inputs feed source effects and picture composition. */
export function useVisualMotionInputs(){const levels=useLiveLevels(),midi=useMidi();return {levels,controls:midi.controls};}
