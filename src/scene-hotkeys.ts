import type { MapShow, ShowOutput } from "./document";

/** Function keys only, so typing into a web window cannot change scenes. */
export const HOTKEYS = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"] as const;
export type Hotkey = typeof HOTKEYS[number];
export const isHotkey = (value: unknown): value is Hotkey => HOTKEYS.includes(value as Hotkey);

export function sceneForHotkey(show: MapShow, key: string): string | null {
  return show.scenes.find(scene => scene.hotkey === key)?.id ?? null;
}

/** A pressed hotkey takes the output to its scene until another is pressed. */
export function outputForHotkey(output: ShowOutput | undefined, sceneId: string | null): ShowOutput | undefined {
  return output && sceneId ? { ...output, sceneId } : output;
}
