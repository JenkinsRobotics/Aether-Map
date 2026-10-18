import { bodyLevels } from '../body/signals';
import { useBody } from '../body/runtime';
import { useAudio } from './audio';
/** Renderer and control views consume the same normalized input snapshot. */
export function useLiveLevels(){const audio=useAudio(),body=useBody();return {...audio.levels,beat:audio.beat,...bodyLevels(body.signals)};}
