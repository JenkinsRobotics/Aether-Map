import type { OutputSchedule } from './document';
import { scheduleActive } from './output-schedule';

/** A headless show starts at boot/deployment, or at the opening of the current
 * local schedule window, whichever is later. Closed hours never consume a
 * play-once sequence. Calendar arithmetic also handles overnight/DST windows. */
export function deployedElapsedS(schedule: OutputSchedule | undefined, deployedAtMs: number, nowMs: number): number {
  if (!schedule) return Math.max(0,(nowMs-deployedAtMs)/1000);
  const now = new Date(nowMs);
  if (!scheduleActive(schedule,now)) return 0;
  const opened = new Date(nowMs);
  if (schedule.toMinutes < schedule.fromMinutes && now.getHours()*60+now.getMinutes() < schedule.toMinutes) opened.setDate(opened.getDate()-1);
  opened.setHours(Math.floor(schedule.fromMinutes/60),schedule.fromMinutes%60,0,0);
  return Math.max(0,(nowMs-Math.max(deployedAtMs,opened.getTime()))/1000);
}
