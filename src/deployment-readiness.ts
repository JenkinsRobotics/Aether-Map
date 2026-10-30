import type { MapShow } from './document';
import { visualSource } from './media-pool';
import { lowPowerPlayer } from './render-health';
import type { DeviceStatus } from './api';

/** Check the exact player route before requesting an assignment. A heartbeat
 * proves reachability, not that a particular revision finished transferring. */
export function deploymentReadiness(show: MapShow, deviceID: string, status?: DeviceStatus | null) {
  const outputs = show.outputs.filter(o => o.kind === 'edge' && o.deviceId === deviceID);
  const blockers: string[] = [], notes: string[] = [];
  if (outputs.length !== 1) blockers.push(outputs.length ? 'This player has multiple outputs. Assign one output per player.' : 'Assign an edge output to this player in Output properties.');
  const output = outputs[0], scene = show.scenes.find(s => s.id === output?.sceneId);
  if (output && !scene) blockers.push('Choose a scene for this output.');
  if (scene?.suppressed) blockers.push('The assigned scene is suppressed.');
  if (output?.schedule?.fromMinutes === output?.schedule?.toMinutes && output?.schedule) blockers.push('Start and end times must be different.');
  if (show.output.blackout) notes.push('Blackout is on. The deployed picture will be dark.');
  if (show.output.testPattern) notes.push('The output test grid is on. Turn it off for the finished show.');
  // A player runs unattended, so a show that does not repeat ends on its own.
  if (show.playback.mode === 'once') notes.push('The show plays once and holds its last moment. Set Show playback to Loop to repeat it indefinitely.');
  if (show.playback.mode === 'continuous') notes.push('Continuous playback runs past the end of the show timeline and goes dark there. Set Show playback to Loop to repeat it indefinitely.');
  // An unset flag is enabled, as the renderer treats it.
  const visuals = (show.visuals ?? []).filter(v => v.enabled !== false && v.targets.some(t => t.sceneID === scene?.id));
  const sources = visuals.filter(v => !v.timelineRefID).map(v => visualSource(show, v));
  if (sources.some(s => s.mediaId && !show.media.some(m => m.id === s.mediaId))) blockers.push('A clip references missing media. Relink it before deployment.');
  if (lowPowerPlayer(status) && sources.some(s => s.shader)) notes.push(`This player (${status?.model || 'its browser'}) cannot draw generators; they will be black. Use video, images, colours or gradients here.`);
  if (sources.some(s => s.web)) notes.push('Web windows open in their own window on the player, as a plain rectangle over the surface. Sign in on the player once with a keyboard and mouse.');
  if (sources.some(s => s.cast)) notes.push('Cast surfaces stay black until you choose Cast into show for this player.');
  if (sources.some(s => s.webcam || (s.tracker && !s.tracker.recording))) notes.push('Live camera inputs need hardware and permission on the player. Use recorded media for unattended playback.');
  return { output, blockers, notes };
}
