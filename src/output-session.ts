import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MapShow } from "./document";
import { useLiveOutput } from "./live/output-live";
import type { Transport } from "./playback";
import { outputWindowFeatures, type DisplayInfo } from "./screens";

export type WirelessKind = "cast" | "airplay";
export type OutputDisplay = { width: number; height: number; fullscreen: boolean };
export type ChannelMessage =
  | { type: "show"; show: MapShow; transport: Transport; mediaUrls?: Record<string, string>; previewMode?: "mapping" | "visualization" }
  | { type: "hello" }
  | { type: "request-device"; outputID: string }
  // An editor's session changes when a draft it is holding becomes a saved
  // document. Windows already on a projector are listening to the old name.
  | { type: "rekey"; session: string }
  | ({ type: "device"; windowKind: string; outputID: string } & OutputDisplay);

export function outputChannel(session: string): string { return `aether-map:${session}`; }
/** Reopening an output must find the window already on that projector. */
function outputWindowName(session: string, outputID: string): string {
  return `aether-map-${session}-${outputID}`;
}

/** Editors publish at least this often, so an output can tell live from gone. */
const HEARTBEAT_MS = 2000;
/** Silence longer than this means the editor behind this output has gone. */
export const LINK_TIMEOUT_MS = 7000;

const SESSION_KEY = "aether-map.output-session";

/**
 * One session per editor tab, surviving reload.
 *
 * It used to be minted on mount, so reloading the editor changed both the
 * channel and the output window names: the window already aimed at the
 * projector kept listening to a channel nobody published on any more — still
 * animating its last frame — while the next Open made a second window beside
 * it. The tab keeps its session now, so a reload reconnects the window it
 * already owns instead of orphaning it.
 */
export function readOutputSession(documentID: string | null): string {
  // A saved show is the same show in every tab, so its outputs are the same
  // windows: two editors on one document drive one projector rather than
  // opening a second window onto it. Different documents never share, which is
  // the isolation this session id existed for.
  if (documentID) return `doc-${documentID}`;
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const minted = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, minted);
    return minted;
  } catch {
    // Private windows and blocked storage: a per-mount id still holds for the
    // life of the page, which is all it can promise there.
    return crypto.randomUUID();
  }
}

/** One editor owns its output windows. Other open shows never share its channel. */
export function useOutputSession(
  show: MapShow, transport: Transport, mediaUrls: Record<string, string>,
  onDisplay: (displays: Record<string, OutputDisplay>) => void,
  onError: (message: string) => void, onStatus: (message: string) => void,
  /** The saved document, when there is one; its outputs are shared by every
   *  editor open on it. */
  documentID: string | null = null,
  previewMode: "mapping" | "visualization" = "visualization",
) {
  const session = useMemo(() => readOutputSession(documentID), [documentID]);
  useLiveOutput(session, "editor");
  // Keyed by output id, not by transport: a show can drive two projectors, and
  // "the monitor window" stopped being a single thing when outputs became a list.
  // The kind travels with the handle: an output whose device changes from a
  // monitor to Cast must re-point the window it already owns, not focus the
  // monitor window and call it done.
  const outputs = useRef(new Map<string, { window: Window; kind: string }>());
  const reports = useRef(new Map<string, OutputDisplay>());
  const reported = useRef<Record<string, OutputDisplay>>({});
  // Held by ref, not closed over: a caller that passes an inline callback must
  // not be able to make this hook rebuild its channel on every render. The
  // channel's lifetime is the session's, and nothing a consumer does to its own
  // render should shorten it.
  const notify = useRef(onDisplay);
  useEffect(() => { notify.current = onDisplay; }, [onDisplay]);
  const updateDisplay = useCallback(() => {
    const next = Object.fromEntries(reports.current);
    const same = Object.keys(next).length === Object.keys(reported.current).length
      && Object.entries(next).every(([id, display]) => reported.current[id] === display);
    if (!same) { reported.current = next; notify.current(next); }
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      for (const [id, output] of outputs.current) {
        if (!output.window.closed) continue;
        outputs.current.delete(id);
        reports.current.delete(id);
      }
      updateDisplay();
    }, 500);
    return () => clearInterval(timer);
  }, [updateDisplay]);
  // The channel belongs to the session, the payload to the document. Keying the
  // channel on the document tore down a live BroadcastChannel and built another
  // on every edit — one per pointer move while dragging — and each rebuild left
  // a gap with no `onmessage` attached, so an output's device reports could be
  // dropped and its window go quietly unreported while still open.
  const latest = useRef({ show, transport, mediaUrls, previewMode });
  useEffect(() => { latest.current = { show, transport, mediaUrls, previewMode }; }, [show, transport, mediaUrls, previewMode]);
  // Every channel this editor has used, not just its current one. Autosave
  // turns a draft into a saved document mid-session, which renames the channel
  // from the tab's draft id to `doc-<id>` — and a window already aimed at a
  // projector goes on listening to the old name. It is told the new one below,
  // but the old channel stays open and fed for as long as this editor lives, so
  // a window that missed the hand-off (still loading, say) keeps playing the
  // current render instead of quietly holding a stale frame.
  const channels = useRef(new Map<string, BroadcastChannel>());
  const publish = useCallback(() => {
    const message = { type: "show", ...latest.current } satisfies ChannelMessage;
    for (const channel of channels.current.values()) channel.postMessage(message);
  }, []);
  // Pointer events may arrive faster than the projector can paint. Coalesce
  // document changes to one publish per animation frame so dragging several
  // mapped shapes cannot queue a structured clone of the whole show for every
  // raw pointer sample. Hello, heartbeat and session hand-off remain immediate.
  const publishFrame = useRef<number | null>(null);
  const schedulePublish = useCallback(() => {
    if (publishFrame.current !== null) return;
    const schedule = typeof window.requestAnimationFrame === "function"
      ? (callback: FrameRequestCallback) => window.requestAnimationFrame(callback)
      : (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16);
    publishFrame.current = schedule(() => {
      publishFrame.current = null;
      publish();
    });
  }, [publish]);

  const receive = useCallback((event: MessageEvent<ChannelMessage>) => {
    if (event.data?.type === "hello") publish();
    else if (event.data?.type === "device") {
      const { outputID, width, height, fullscreen } = event.data;
      if (!outputs.current.has(outputID) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      reports.current.set(outputID, { width, height, fullscreen });
      updateDisplay();
    }
  }, [publish, updateDisplay]);

  useEffect(() => {
    const all = channels.current;
    if (!all.has(session)) {
      // Hand over before the new channel joins the list, so the announcement
      // only reaches windows that predate it.
      for (const old of all.values()) old.postMessage({ type: "rekey", session } satisfies ChannelMessage);
      all.set(session, new BroadcastChannel(outputChannel(session)));
    }
    for (const [id, channel] of all) channel.onmessage = event => {
      // A receiver may finish loading after the original handoff. Repeat the
      // destination on its handshake so its URL is safe to reload, too.
      if (id !== session && event.data?.type === "hello") {
        channel.postMessage({ type: "rekey", session } satisfies ChannelMessage);
      }
      receive(event);
    };
    // Rename the windows this editor already owns, or reopening an output after
    // a reload would stack a second window beside the one on the projector.
    for (const [outputID, output] of outputs.current) {
      if (!output.window.closed) output.window.name = outputWindowName(session, outputID);
    }
    publish();
  }, [session, receive, publish]);

  // Channels outlive the session they were opened for; only unmount ends them.
  useEffect(() => () => {
    for (const channel of channels.current.values()) channel.close();
    channels.current.clear();
  }, []);

  // Every open window sees each edit; only the payload crosses, not a new pipe.
  useEffect(() => { schedulePublish(); }, [show, transport, mediaUrls, previewMode, schedulePublish]);
  useEffect(() => () => {
    if (publishFrame.current === null) return;
    if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(publishFrame.current);
    else clearTimeout(publishFrame.current);
    publishFrame.current = null;
  }, []);

  // And on a timer: without it a quiet editor is indistinguishable from a
  // closed one, and an output cannot know its render has gone stale.
  useEffect(() => {
    const beat = setInterval(publish, HEARTBEAT_MS);
    return () => clearInterval(beat);
  }, [publish]);

  const open = useCallback((outputID: string, kind: "monitor" | WirelessKind, display?: DisplayInfo) => {
    const requestDisplay = () => {
      for (const channel of channels.current.values()) {
        channel.postMessage({ type: "request-device", outputID } satisfies ChannelMessage);
      }
    };
    const previous = outputs.current.get(outputID);
    if (previous && !previous.window.closed) {
      if (previous.kind === kind) {
        if (display) {
          try { previous.window.moveTo(display.left, display.top); previous.window.resizeTo(display.width, display.height); }
          catch { /* Browsers may require the operator to position the window. */ }
        }
        previous.window.focus();
        requestDisplay();
        return;
      }
      // An output has one device. Moving it from a monitor to Cast must move
      // the projector, not leave the old window playing the show beside the new
      // one — and a Cast tab cannot be a reused popup, which is where Chrome
      // keeps the Cast menu.
      previous.window.close();
      outputs.current.delete(outputID);
      reports.current.delete(outputID);
    }
    const query = new URLSearchParams({ output: "1", session, windowKind: kind, outputID });
    if (kind !== "monitor") query.set("wireless", kind);
    // A regular tab retains Chrome's Cast menu.
    const features = kind === "cast" ? undefined : display
      ? outputWindowFeatures(display) : "popup,width=960,height=540";
    // Name = session + output id, and the session follows the document, so
    // reopening an output — from this tab, another tab, or after a reload —
    // targets the window already on that projector instead of stacking a
    // second one beside it.
    // Acquire the named window without navigating it: after an editor reload
    // the handle is gone, but the projector may still be playing in that window.
    const output = window.open("", outputWindowName(session, outputID), features);
    if (!output) { onError("Allow pop-ups to open the projector output."); return; }
    const target = new URL(`${location.pathname}?${query}`, location.href).href;
    let matches = false;
    try {
      const current = new URL(output.location.href);
      matches = current.origin === location.origin && current.pathname === location.pathname
        && [...query].every(([key, value]) => current.searchParams.get(key) === value);
    } catch { /* A blank or navigated window needs the output page. */ }
    if (!matches) output.location.replace(target);
    outputs.current.set(outputID, { window: output, kind });
    output.focus();
    requestDisplay();
    onStatus(kind === "cast" ? "Output tab opened. In that tab use Chrome's Cast menu and choose Cast tab."
      : kind === "airplay" ? "Output opened. Share this output window with AirPlay, or move it to your extended AirPlay display."
        : `Output window opened${display ? ` on ${display.label}` : ""}. Move it to your display and double-click inside to go fullscreen.`);
  }, [session, onError, onStatus]);

  const close = useCallback((outputID: string) => {
    outputs.current.get(outputID)?.window.close();
    outputs.current.delete(outputID);
    reports.current.delete(outputID);
    updateDisplay();
  }, [updateDisplay]);

  return {
    openOutput: useCallback((outputID: string, display?: DisplayInfo) => open(outputID, "monitor", display), [open]),
    openWirelessOutput: useCallback((outputID: string, kind: WirelessKind) => open(outputID, kind), [open]),
    closeOutput: close,
  };
}
