import { bodyState, setOutputBody, subscribeBody } from '../body/runtime';
import type { BodySignals } from '../body/signals';
import { audioState, setOutputAudio, subscribeAudio } from './audio';
import { midiState, setOutputMidi, subscribeMidi } from './midi';
import { SILENT_LEVELS } from './audio-analysis';
import type { AudioBand } from '../features/types';
import { useEffect } from "react";
import { cameraEntries, cameraState, setCameraState, stopCamera, subscribeCameras } from "./cameras";
import type { HandSample } from "../features/types";

type Signal = { body?: BodySignals; bodyOn?: boolean; from: string; to?: string; key?: string; levels?: Record<AudioBand, number>; audioOn?: boolean; beat?: number; controls?: Record<number, number>; midiOn?: boolean; type: "controls" | "hello" | "offer" | "answer" | "state" | "bye"; sdp?: RTCSessionDescriptionInit; hands?: HandSample[]; status?: string; tracking?: boolean; connected?: boolean };
const iceReady = (peer: RTCPeerConnection) => new Promise<void>((resolve) => {
  if (peer.iceGatheringState === "complete") return resolve();
  const done = () => { if (peer.iceGatheringState === "complete") { clearTimeout(timeout); peer.removeEventListener("icegatheringstatechange", done); resolve(); } };
  const timeout = window.setTimeout(() => { peer.removeEventListener("icegatheringstatechange", done); resolve(); }, 1500);
  peer.addEventListener("icegatheringstatechange", done);
});
/** Local peer connections share one physical camera with every clean output window. */
export function useLiveOutput(session: string | null, role: "editor" | "output") {
  useEffect(() => {
    if (!session) return;
    const id = crypto.randomUUID(), channel = new BroadcastChannel(`aether-map-live:${session}`);
    const peers = new Map<string, { peer: RTCPeerConnection; stream?: MediaStream }>();
    const receivers = new Set<string>(); const remoteKeys = new Set<string>(); let disposed = false, controlsFrom: string | undefined;
    const send = (message: Omit<Signal, "from">) => { if (!disposed) channel.postMessage({ ...message, from: id }); };
    const publishControls = () => {
      const audio = audioState(), midi = midiState(), body = bodyState();
      send({ type: 'controls', body: body.signals, bodyOn: body.active, levels: audio.levels, audioOn: audio.listening, beat: audio.beat, controls: midi.controls, midiOn: midi.connected });
    };
    const publish = () => {
      for (const [key, state] of cameraEntries()) {
        send({ type: "state", key, hands: state.hands, status: state.status, tracking: state.tracking, connected: Boolean(state.stream) });
        for (const to of receivers) {
          const peerKey = `${to}:${key}`, old = peers.get(peerKey);
          if (old?.stream === state.stream) continue;
          old?.peer.close(); peers.delete(peerKey);
          if (!state.stream) continue;
          const peer = new RTCPeerConnection({ iceServers: [] });
          peers.set(peerKey, { peer, stream: state.stream });
          state.stream.getTracks().forEach((track) => peer.addTrack(track, state.stream!));
          void (async () => {
            try { await peer.setLocalDescription(await peer.createOffer()); await iceReady(peer);
              if (peer.connectionState !== "closed") send({ type: "offer", to, key, sdp: peer.localDescription!.toJSON() });
            } catch { /* Closed windows dispose negotiations in flight. */ }
          })();
        }
      }
    };
    channel.onmessage = async (event: MessageEvent<Signal>) => {
      const m = event.data;
      if (m.from === id || (m.to && m.to !== id)) return;
      if (role === "editor") {
        if (m.type === "hello") { receivers.add(m.from); publish(); publishControls(); }
        if (m.type === "answer" && m.key && m.sdp) {
          try { await peers.get(`${m.from}:${m.key}`)?.peer.setRemoteDescription(m.sdp); } catch { /* stale receiver */ }
        }
        if (m.type === "bye") {
          receivers.delete(m.from);
          for (const [key, value] of peers) if (key.startsWith(`${m.from}:`)) { value.peer.close(); peers.delete(key); }
        }
      } else if (m.type === 'bye') {
        if (m.from === controlsFrom) { setOutputAudio(SILENT_LEVELS, false); setOutputMidi({}, false); setOutputBody({}, false); }
      } else if (m.type === 'controls') {
        controlsFrom = m.from;
        setOutputAudio(m.levels ?? SILENT_LEVELS, m.audioOn === true, m.beat);
        setOutputMidi(m.controls ?? {}, m.midiOn === true);
        setOutputBody(m.body, m.bodyOn === true);
      } else if (m.key) {
        remoteKeys.add(m.key);
        if (m.type === "state") {
          setCameraState(m.key, { hands: m.hands ?? [], status: m.status ?? "", tracking: m.tracking ?? false,
            ...(!m.connected ? { stream: undefined } : {}) });
        }
        if (m.type === "offer" && m.sdp) {
          peers.get(m.key)?.peer.close();
          const peer = new RTCPeerConnection({ iceServers: [] }); peers.set(m.key, { peer });
          peer.ontrack = (event) => setCameraState(m.key!, { stream: event.streams[0] });
          try { await peer.setRemoteDescription(m.sdp); await peer.setLocalDescription(await peer.createAnswer()); await iceReady(peer);
            send({ type: "answer", to: m.from, key: m.key, sdp: peer.localDescription!.toJSON() });
          } catch { /* editor closed while negotiating */ }
        }
      }
    };
    const unsubscribers = role === 'editor' ? [subscribeCameras(publish), subscribeAudio(publishControls), subscribeMidi(publishControls), subscribeBody(publishControls)] : [];
    const unsubscribe = () => unsubscribers.forEach(dispose => dispose());
    // Reconnect after an editor reload and expire connections to closed outputs.
    if (role === "output") send({ type: "hello" });
    const heartbeat = role === "output" ? window.setInterval(() => send({ type: "hello" }), 3000) : 0;
    const leave = () => send({ type: "bye" }); addEventListener("pagehide", leave);
    return () => {
      leave(); disposed = true; unsubscribe(); clearInterval(heartbeat); removeEventListener("pagehide", leave); channel.close();
      for (const value of peers.values()) value.peer.close();
      if (role === "output") { setOutputAudio(SILENT_LEVELS, false); setOutputMidi({}, false); setOutputBody({}, false); }
      if (role === "output") for (const key of remoteKeys) { cameraState(key).stream?.getTracks().forEach((track) => track.stop()); setCameraState(key, { stream: undefined, hands: [] }); }
    };
  }, [session, role]);
}

export function useCameraCleanup(keys: string[]) {
  const signature = [...new Set(keys)].sort().join("\n");
  useEffect(() => { for (const [key] of cameraEntries()) if (!signature.split("\n").includes(key)) stopCamera(key); }, [signature]);
  useEffect(() => () => { for (const [key] of cameraEntries()) stopCamera(key); }, []);
}
