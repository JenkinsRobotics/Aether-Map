import type { OutputSchedule } from "./document";

export const MINUTES_PER_DAY = 24 * 60;
/** Sunday first, matching `Date.getDay()`. */
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Is this output's showtime now?
 *
 * Local time on the machine drawing the picture, deliberately: a projector in a
 * front yard runs "dusk to eleven" in its own timezone, and the laptop that
 * programmed it may be somewhere else entirely — or long gone. A Pi decides
 * this from its own clock with no server in reach.
 */
export function scheduleActive(schedule: OutputSchedule | undefined, at: Date = new Date()): boolean {
  if (!schedule) return true; // No schedule is not a closed one: it always runs.
  const { fromMinutes: from, toMinutes: to } = schedule;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
  const minutes = at.getHours() * 60 + at.getMinutes();
  // A window whose end is before its start runs through midnight.
  const overnight = to < from;
  const inWindow = overnight ? minutes >= from || minutes < to : minutes >= from && minutes < to;
  if (!inWindow) return false;
  if (!schedule.days?.length) return true;
  // The day that counts is the day the window opened. A Friday 22:00–02:00
  // show is still Friday's show at half past midnight, and switching it off at
  // the stroke of twelve because Saturday is unchecked would be wrong.
  const openedYesterday = overnight && minutes < to;
  return schedule.days.includes((at.getDay() + (openedYesterday ? 6 : 0)) % 7);
}

/** "18:00" from 1080. The UI's `<input type="time">` speaks this. */
export function clockText(minutes: number): string {
  const whole = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

/** 1080 from "18:00"; null when the field is empty or malformed. */
export function clockMinutes(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * The schedule in a few words, for a row that has no space for controls.
 * Named days only when it is not every day, because "Every day" is the case
 * an operator does not need to read twice.
 */
export function describeSchedule(schedule: OutputSchedule | undefined): string {
  if (!schedule) return "Always on";
  const span = `${clockText(schedule.fromMinutes)}–${clockText(schedule.toMinutes)}`;
  const days = schedule.days;
  if (!days?.length || days.length === 7) return `Daily ${span}`;
  const ordered = [...new Set(days)].sort((a, b) => a - b);
  return `${ordered.map((day) => DAY_NAMES[day]).join(" ")} ${span}`;
}
