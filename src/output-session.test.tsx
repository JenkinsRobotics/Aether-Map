// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emptyShow, type MapShow } from "./document";
import { useOutputSession, readOutputSession } from "./output-session";
import type { Transport } from "./playback";

/** Counts every channel ever constructed, and every message sent. */
const channels: FakeChannel[] = [];
let frames: FrameRequestCallback[] = [];
class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  posted: unknown[] = [];
  closed = false;
  constructor(public name: string) { channels.push(this); }
  postMessage(data: unknown) {
    if (this.closed) throw new DOMException("closed", "InvalidStateError");
    this.posted.push(data);
  }
  close() { this.closed = true; }
  addEventListener() {}
  removeEventListener() {}
}

beforeEach(() => {
  channels.length = 0;
  frames = [];
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback); return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("RTCPeerConnection", class { close() {} addTrack() {} });
});
afterEach(() => vi.unstubAllGlobals());

function Harness({ show, transport, documentID = null, previewMode = "visualization" }: { show: MapShow; transport: Transport; documentID?: string | null; previewMode?: "mapping" | "visualization" }) {
  useOutputSession(show, transport, {}, () => {}, () => {}, () => {}, documentID, previewMode);
  return null;
}
function flushFrame() {
  const ready = frames; frames = [];
  act(() => ready.forEach(callback => callback(performance.now())));
}

test("workspace switches publish to the existing output channel without editing the show", () => {
  const show = emptyShow(), before = JSON.stringify(show);
  const transport: Transport = { playing: false, timeS: 10, anchorMs: 0 };
  const view = render(<Harness show={show} transport={transport} previewMode="visualization" />);
  flushFrame();
  const channel = channels.find(c => c.name.startsWith('aether-map:'))!;
  const count = channels.length;
  for (const previewMode of ['mapping', 'visualization'] as const) {
    view.rerender(<Harness show={show} transport={transport} previewMode={previewMode} />);
    flushFrame();
    expect(channel.posted.at(-1)).toMatchObject({ type: 'show', show, previewMode });
    expect(channels.length).toBe(count);
  }
  expect(JSON.stringify(show)).toBe(before);
});

test("editing with an output open reuses one channel instead of rebuilding it per edit", () => {
  const transport: Transport = { playing: true, timeS: 0, anchorMs: 0 };
  const { rerender } = render(<Harness show={emptyShow()} transport={transport} />);
  const named = () => channels.filter((c) => c.name.startsWith("aether-map:"));
  const opened = named().length;
  expect(opened).toBeGreaterThan(0);

  // A drag emits an edit per pointer move: the document is a new object each
  // time, and each move is its own commit rather than a batch. Thirty moves is
  // half a second of dragging.
  for (let move = 0; move < 30; move += 1) {
    const show = emptyShow();
    show.scenes[0].durationS = 10 + move;
    act(() => { rerender(<Harness show={show} transport={transport} />); });
  }

  // The channel is infrastructure keyed by session, not by document value.
  expect(named().length).toBe(opened);
  // And nothing may post to a channel this session already closed.
  expect(named().filter((c) => c.closed)).toHaveLength(0);

  // Raw pointer samples are coalesced into one frame, carrying the latest show.
  flushFrame();
  const shows = named()[0].posted.filter((m) => (m as { type: string }).type === "show");
  expect(shows.length).toBe(2);
  expect((shows.at(-1) as { show: MapShow }).show.scenes[0].durationS).toBe(39);
});

test("closing the editor leaves no channel open behind it", () => {
  const transport: Transport = { playing: true, timeS: 0, anchorMs: 0 };
  render(<Harness show={emptyShow()} transport={transport} />).unmount();
  expect(channels.filter((c) => c.name.startsWith("aether-map:") && !c.closed)).toHaveLength(0);
});

test("the output session is the document's, so every editor on it drives one window", () => {
  sessionStorage.clear();
  // Two tabs, one saved show: both name the same output window, so opening
  // output twice reuses one projector window instead of stacking two.
  expect(readOutputSession("doc-42")).toBe(readOutputSession("doc-42"));
  expect(readOutputSession("doc-42")).not.toBe(readOutputSession("doc-7"));
});

test("an unsaved show keeps one session across a reload, and apart from saved ones", () => {
  sessionStorage.clear();
  const first = readOutputSession(null);
  // A reload re-runs this with storage intact.
  expect(readOutputSession(null)).toBe(first);
  expect(first).not.toBe(readOutputSession("doc-42"));
});

test("a session is still returned when storage is unavailable", () => {
  const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    },
  });
  try {
    expect(readOutputSession(null)).toBeTruthy();
  } finally {
    if (original) Object.defineProperty(window, "sessionStorage", original);
  }
});

test("a draft that becomes a saved document hands its windows to the new channel", () => {
  const transport: Transport = { playing: true, timeS: 0, anchorMs: 0 };
  const { rerender } = render(<Harness show={emptyShow()} transport={transport} />);
  const draft = channels.filter((c) => c.name.startsWith("aether-map:"));
  expect(draft).toHaveLength(1);

  // Autosave names the show. The window already aimed at a projector is
  // listening to the draft channel, so it is told where the editor went.
  act(() => { rerender(<Harness show={emptyShow()} transport={transport} documentID="doc-7" />); });
  const all = channels.filter((c) => c.name.startsWith("aether-map:"));
  expect(all.map((c) => c.name)).toEqual(["aether-map:" + draft[0].name.slice("aether-map:".length), "aether-map:doc-doc-7"]);
  expect(draft[0].posted).toContainEqual({ type: "rekey", session: "doc-doc-7" });

  const handshakeStart = draft[0].posted.length;
  act(() => { draft[0].onmessage?.({ data: { type: "hello" } } as MessageEvent); });
  expect(draft[0].posted.slice(handshakeStart)).toContainEqual({ type: "rekey", session: "doc-doc-7" });
  const saved = all[1];
  const savedStart = saved.posted.length;
  act(() => { saved.onmessage?.({ data: { type: "hello" } } as MessageEvent); });
  expect(saved.posted.slice(savedStart)).not.toContainEqual({ type: "rekey", session: "doc-doc-7" });

  // And the old channel stays open and fed, for a window that missed the
  // hand-off: it keeps playing the current render rather than a stale frame.
  expect(draft[0].closed).toBe(false);
  const before = draft[0].posted.length;
  const moved = emptyShow();
  moved.scenes[0].durationS = 42;
  act(() => { rerender(<Harness show={moved} transport={transport} documentID="doc-7" />); });
  flushFrame();
  const late = draft[0].posted.slice(before).filter((m) => (m as { type: string }).type === "show");
  expect((late.at(-1) as { show: MapShow }).show.scenes[0].durationS).toBe(42);
});

test("opening an output focuses it repeatedly, recovers it after reload without navigating, and closes only explicitly", () => {
  const transport: Transport = { playing: false, timeS: 0, anchorMs: 0 };
  const show = emptyShow();
  const makeWindow = () => ({
    closed: false, focus: vi.fn(),
    close: vi.fn(function (this: { closed: boolean }) { this.closed = true; }),
    location: { href: "about:blank", replace: vi.fn(function (this: { href: string }, url: string) {
      this.href = new URL(url, location.href).href;
    }) },
  });
  const first = makeWindow();
  const open = vi.spyOn(window, "open").mockReturnValue(first as unknown as Window);
  let commands!: ReturnType<typeof useOutputSession>;
  function OutputHarness() {
    commands = useOutputSession(show, transport, {}, () => {}, () => {}, () => {}, "focus-test");
    return null;
  }
  const editor = render(<OutputHarness />);
  act(() => commands.openOutput("out-1"));
  act(() => commands.openOutput("out-1"));
  expect(open).toHaveBeenCalledTimes(1);
  expect(first.focus).toHaveBeenCalledTimes(2);
  expect(first.location.replace).toHaveBeenCalledTimes(1);
  expect(first.close).not.toHaveBeenCalled();
  editor.unmount();
  const reopened = render(<OutputHarness />);
  act(() => commands.openOutput("out-1"));
  expect(open).toHaveBeenLastCalledWith("", "aether-map-doc-focus-test-out-1", "popup,width=960,height=540");
  expect(first.location.replace).toHaveBeenCalledTimes(1);
  expect(first.focus).toHaveBeenCalledTimes(3);
  act(() => commands.closeOutput("out-1"));
  expect(first.close).toHaveBeenCalledTimes(1);
  const next = makeWindow();
  open.mockReturnValue(next as unknown as Window);
  act(() => commands.openOutput("out-1"));
  expect(next.location.replace).toHaveBeenCalledTimes(1);
  reopened.unmount();
  open.mockRestore();
});
