/**
 * The displays attached to this computer, for choosing where the show comes
 * out.
 *
 * Chrome exposes them through the Window Management API (`getScreenDetails`,
 * behind a permission prompt). Elsewhere there is only `window.screen` — the
 * display the editor is on — and the user drags the window across by hand.
 * A missing enumeration API must not invent a one-display inventory.
 */

export interface DisplayInfo {
  id: string;
  label: string;
  width: number;
  height: number;
  /** Position in the virtual desktop, for placing a window onto it. */
  left: number;
  top: number;
  isPrimary: boolean;
  /** True when this is the display the editor window is currently on. */
  isCurrent: boolean;
}

interface ScreenDetailed {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  width: number;
  height: number;
  label?: string;
  isPrimary?: boolean;
}

interface ScreenDetails {
  screens: ScreenDetailed[];
  currentScreen: ScreenDetailed;
}

type WindowWithScreens = Window & {
  getScreenDetails?: () => Promise<ScreenDetails>;
};

export function canListDisplays(win: Window = window): boolean {
  return typeof (win as WindowWithScreens).getScreenDetails === "function";
}

export type DisplaySupport =
  | { supported: true }
  | { supported: false; reason: "insecure" | "browser" | "embedded" };

/**
 * Why displays cannot be listed, when they cannot. The API is Chromium-only
 * (Chrome, Edge, Arc, Brave), needs a secure page (https or localhost), and
 * inside an iframe needs `allow="window-management"`. Saying which one is the
 * difference between a fix and a shrug.
 */
export function displaySupport(win: Window = window): DisplaySupport {
  if (canListDisplays(win)) return { supported: true };
  if (!win.isSecureContext) return { supported: false, reason: "insecure" };
  if (win.self !== win.top) return { supported: false, reason: "embedded" };
  return { supported: false, reason: "browser" };
}

export function explainDisplaySupport(support: DisplaySupport): string {
  if (support.supported) return "";
  switch (support.reason) {
    case "insecure":
      return "Listing displays needs a secure page. Open Aether Studio over https, or at localhost.";
    case "embedded":
      return "Listing displays is blocked inside an embedded frame. Open Aether Map in its own tab.";
    default:
      return "Listing displays needs Chrome, Edge, Arc or Brave. Safari and Firefox do not offer it — open the output window and drag it onto the projector; its content size is reported by the output window.";
  }
}

/**
 * Ask for every display. Rejects if the browser refuses or the user declines
 * the permission. An unsupported browser has no detected display list.
 */
export async function listDisplays(win: Window = window): Promise<DisplayInfo[]> {
  const getScreenDetails = (win as WindowWithScreens).getScreenDetails;
  if (!getScreenDetails) return [];
  const details = await getScreenDetails.call(win);
  return details.screens.map((screen, index) => toDisplay(screen, index, screen === details.currentScreen));
}

/**
 * `window.open` features that put the output window on a chosen display. It
 * opens as a popup filling that display's usable area; going fullscreen from
 * there is one gesture, and lands on the right projector.
 */
export function outputWindowFeatures(display: DisplayInfo): string {
  return [
    "popup",
    `left=${Math.round(display.left)}`,
    `top=${Math.round(display.top)}`,
    `width=${Math.round(display.width)}`,
    `height=${Math.round(display.height)}`,
  ].join(",");
}

function toDisplay(screen: ScreenDetailed, index: number, isCurrent: boolean): DisplayInfo {
  const label = screen.label?.trim() || `Display ${index + 1}`;
  return {
    id: `${index}:${screen.availLeft},${screen.availTop}`,
    label,
    width: screen.width,
    height: screen.height,
    left: screen.availLeft,
    top: screen.availTop,
    isPrimary: Boolean(screen.isPrimary),
    isCurrent,
  };
}

export function describeDisplay(display: DisplayInfo): string {
  const tags = [
    display.isPrimary ? "primary" : null,
    display.isCurrent ? "editor is here" : null,
  ].filter(Boolean);
  return `${display.label} — ${display.width}×${display.height}${tags.length ? ` (${tags.join(", ")})` : ""}`;
}
