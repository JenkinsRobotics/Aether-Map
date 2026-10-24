import type { MapShow } from './document';
import { visualSource } from './media-pool';

/** Check the exact player route before requesting an assignment. A heartbeat
 * proves reachability, not that a particular revision finished transferring. */
export function deploymentReadiness(show: MapShow, deviceID: string) {
  const outputs = show.outputs.filter(o => o.kind === 'edge' && o.deviceId === deviceID);
  const blockers: string[] = [], notes: string[] = [];
  if (outputs.length !== 1) blockers.push(outputs.length ? 'This player has multiple outputs. Assign one output per player.' : 'Assign an edge output to this player in Output properties.');
  const output = outputs[0], scene = show.scenes.find(s => s.id === output?.sceneId);
  if (output && !scene) blockers.push('Choose a scene for this output.');
  if (scene?.suppressed) blockers.push('The assigned scene is suppressed.');
  if (output?.schedule?.fromMinutes === output?.schedule?.toMinutes && output?.schedule) blockers.push('Start and end times must be different.');
  if (show.output.blackout) notes.push('Blackout is on. The deployed picture will be dark.');
  if (show.output.testPattern) notes.push('The output test grid is on. Turn it off for the finished show.');
  const visuals = (show.visuals ?? []).filter(v => v.enabled && v.targets.some(t => t.sceneID === scene?.id));
  const sources = visuals.filter(v => !v.timelineRefID).map(v => visualSource(show, v));
  if (sources.some(s => s.mediaId && !show.media.some(m => m.id === s.mediaId))) blockers.push('A clip references missing media. Relink it before deployment.');
  if (sources.some(s => s.webcam || (s.tracker && !s.tracker.recording))) notes.push('Live camera inputs need hardware and permission on the player. Use recorded media for unattended playback.');
  return { output, blockers, notes };
}
