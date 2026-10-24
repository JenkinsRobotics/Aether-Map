import { devices } from './api';
import { castStatistics, type CastCounters, type CastDiagnostics } from './live-cast-stats';

export type CastStatus = 'Choosing output' | 'Connecting' | 'Mirroring' | 'Reconnecting';
export type { CastDiagnostics } from './live-cast-stats';

/** Bounded LAN candidate gathering; cancellation removes the listener immediately. */
export function gatherCandidates(peer: RTCPeerConnection, signal?: AbortSignal): Promise<void> {
  if (peer.iceGatheringState === 'complete' || signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); peer.removeEventListener('icegatheringstatechange', changed); signal?.removeEventListener('abort', finish); resolve(); };
    const changed = () => { if (peer.iceGatheringState === 'complete') finish(); };
    const timer = setTimeout(finish, 5000);
    peer.addEventListener('icegatheringstatechange', changed);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

function pause(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, 1000);
    signal.addEventListener('abort', finish, { once: true });
  });
}

/** The picker itself cannot be aborted. A late result must still stop its tracks. */
function chooseCapture(signal: AbortSignal): Promise<MediaStream | null> {
  return new Promise((resolve, reject) => {
    const cancelled = () => resolve(null);
    signal.addEventListener('abort', cancelled, { once: true });
    let request: Promise<MediaStream>;
    try { request = navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true }); }
    catch (error) { signal.removeEventListener('abort', cancelled); reject(error); return; }
    void request.then(stream => {
      signal.removeEventListener('abort', cancelled);
      if (signal.aborted) { stream.getTracks().forEach(track => track.stop()); resolve(null); }
      else resolve(stream);
    }, error => { signal.removeEventListener('abort', cancelled); if (signal.aborted) resolve(null); else reject(error); });
  });
}

/** Capture is requested only from an operator's click, never by a render or poll. */
export async function mirrorDevice(deviceID: string, signal: AbortSignal,
  status: (value: CastStatus) => void, diagnostics?: (value: CastDiagnostics) => void): Promise<void> {
  if (signal.aborted) return;
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Live mirroring needs a supported browser on HTTPS or localhost.');
  status('Choosing output');
  const capture = await chooseCapture(signal);
  if (!capture) return;
  const life = new AbortController();
  let peer: RTCPeerConnection | undefined, sessionID: string | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined, failure: Error | undefined;
  const stop = () => {
    if (life.signal.aborted) return;
    life.abort();
    capture.getTracks().forEach(track => track.stop());
    peer?.close();
  };
  signal.addEventListener('abort', stop, { once: true });
  const video = capture.getVideoTracks();
  video.forEach(track => track.addEventListener('ended', stop));
  try {
    if (signal.aborted) { stop(); return; }
    if (!video.some(track => track.readyState !== 'ended')) throw new Error('No live video was selected. Choose the output window and try again.');
    peer = new RTCPeerConnection({ iceServers: [] });
    status('Connecting');
    const audio = capture.getAudioTracks().some(track => track.readyState !== 'ended');
    diagnostics?.({ audio });
    capture.getTracks().forEach(track => peer!.addTrack(track, capture));
    await peer.setLocalDescription(await peer.createOffer());
    await gatherCandidates(peer, life.signal);
    if (life.signal.aborted) return;
    // Let this bounded request finish even if Stop is pressed, so its lease can be revoked.
    const session = await devices.castStart(deviceID, peer.localDescription!.sdp);
    sessionID = session.session_id;
    const started = Date.now();
    let lastContact = started, disconnectedAt: number | undefined, connected = false;
    let counters: CastCounters = new Map();
    watchdog = setInterval(() => {
      if (life.signal.aborted) return;
      if (peer?.connectionState === 'disconnected') disconnectedAt ??= Date.now();
      else disconnectedAt = undefined;
      if (Date.now() - lastContact >= 8000) failure = new CastFailure('Aether Studio stopped responding. Sharing has stopped; the player will return to its saved show. Check the server and network before mirroring again.');
      else if (disconnectedAt !== undefined && Date.now() - disconnectedAt >= 8000) failure = new CastFailure('The media connection was lost. Check that both devices are on the same network, then mirror again.');
      else if (!connected && Date.now() - started >= 25000) failure = new CastFailure('The player did not start playback. Check the player screen, use the same local network, and disable guest-network isolation. Then choose Mirror live again.');
      if (failure) stop();
    }, 250);
    while (!life.signal.aborted) {
      try {
        const result = await devices.castPoll(deviceID, sessionID, life.signal);
        if (life.signal.aborted) break;
        lastContact = Date.now();
        if (result.answer && !peer.remoteDescription) {
          try { await peer.setRemoteDescription(result.answer); }
          catch { throw new CastFailure('The player returned an unsupported video connection. Update the player installer, then mirror again.'); }
        }
        if (['failed', 'closed'].includes(peer.connectionState) || result.state === 'failed' || result.state === 'disconnected') {
          throw new CastFailure('Mirroring disconnected. The player is returning to its saved show. Check the network, then choose Mirror live to reconnect.');
        }
        if (peer.connectionState === 'disconnected') {
          disconnectedAt ??= Date.now();
          status('Reconnecting');
          if (Date.now() - disconnectedAt >= 8000) throw new CastFailure('The media connection was lost. Check that both devices are on the same network, then mirror again.');
        } else {
          disconnectedAt = undefined;
          const mirroring = peer.connectionState === 'connected' && result.state === 'connected';
          connected ||= mirroring;
          status(mirroring ? 'Mirroring' : 'Connecting');
        }
        if (!connected && Date.now() - started >= 25000) throw new CastFailure('The player did not start playback. Check the player screen, use the same local network, and disable guest-network isolation. Then choose Mirror live again.');
        if (diagnostics) {
          try {
            const sample = castStatistics(await peer.getStats(), counters, audio);
            counters = sample.counters;
            if (!life.signal.aborted) diagnostics(sample.diagnostics);
          } catch { /* Some browsers omit getStats. Sharing must still work. */ }
        }
      } catch (error) {
        if (life.signal.aborted) break;
        const code = (error as { status?: number }).status;
        if (error instanceof CastFailure || (code && code >= 400 && code < 500 && code !== 408 && code !== 429)) throw error;
        if (Date.now() - lastContact >= 8000) throw new CastFailure('Aether Studio stopped responding. Sharing has stopped; the player will return to its saved show. Check the server and network before mirroring again.');
        status('Reconnecting');
      }
      await pause(life.signal);
    }
    if (failure) throw failure;
  } catch (error) {
    if (!life.signal.aborted || error === failure) throw error;
  } finally {
    clearInterval(watchdog);
    signal.removeEventListener('abort', stop);
    video.forEach(track => track.removeEventListener('ended', stop));
    stop();
    if (sessionID) await devices.castStop(deviceID, sessionID).catch(() => {});
  }
}
class CastFailure extends Error {}
