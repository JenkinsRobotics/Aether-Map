import type { Cue } from "./document";

/** Cue presentation helpers, kept out of the component file so the panel
 *  exports components only (fast refresh, and one job per module). */

export function describeCue(cue: Cue): string {
  if (cue.action === "show") return "Show";
  if (cue.action === "hide") return "Hide";
  return `Opacity ${Math.round((cue.value ?? 1) * 100)}%`;
}

export function formatTime(seconds: number): string {
  const safe = Math.max(seconds, 0);
  const whole = Math.floor(safe);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}.${Math.floor((safe % 1) * 10)}`;
}
