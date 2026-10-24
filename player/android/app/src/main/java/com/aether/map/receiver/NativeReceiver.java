package com.aether.map.receiver;

import org.webrtc.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Native receive-only WebRTC; it does not depend on a TV WebView. */
final class NativeReceiver implements ReceiverSession.Engine {
    private final ReceiverSession.Events events;
    private final SurfaceViewRenderer renderer;
    private final PeerConnection peer;
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    private final List<VideoTrack> videoTracks = new ArrayList<>();
    private final List<AudioTrack> audioTracks = new ArrayList<>();
    private final AtomicBoolean firstFrame = new AtomicBoolean();
    private final AtomicBoolean answered = new AtomicBoolean();
    private volatile boolean closed, audible;
    private final VideoSink sink;
    NativeReceiver(PeerConnectionFactory factory, SurfaceViewRenderer renderer, ReceiverSession.Events events) {
        this.events=events;this.renderer=renderer;
        sink=frame -> { if(!closed) { renderer.onFrame(frame);if(firstFrame.compareAndSet(false,true)) events.frame(); } };
        PeerConnection.RTCConfiguration config=new PeerConnection.RTCConfiguration(java.util.Collections.emptyList());
        config.sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN;
        peer=factory.createPeerConnection(config,new PeerConnection.Observer() {
            public void onSignalingChange(PeerConnection.SignalingState state) {}
            public void onIceConnectionChange(PeerConnection.IceConnectionState state) {}
            public void onIceConnectionReceivingChange(boolean receiving) {}
            public void onIceGatheringChange(PeerConnection.IceGatheringState state) {
                if(state==PeerConnection.IceGatheringState.COMPLETE) dispatch(NativeReceiver.this::answer);
            }
            public void onIceCandidate(IceCandidate candidate) {}
            public void onIceCandidatesRemoved(IceCandidate[] candidates) {}
            public void onAddStream(MediaStream stream) {}
            public void onRemoveStream(MediaStream stream) {}
            public void onDataChannel(DataChannel channel) { channel.close();channel.dispose(); }
            public void onRenegotiationNeeded() {}
            public void onAddTrack(RtpReceiver receiver, MediaStream[] streams) { dispatch(() -> track(receiver.track())); }
            public void onTrack(RtpTransceiver transceiver) { dispatch(() -> track(transceiver.getReceiver().track())); }
            public void onConnectionChange(PeerConnection.PeerConnectionState state) {
                if(closed) return;
                if(state==PeerConnection.PeerConnectionState.CONNECTED) events.connection(true);
                else if(state==PeerConnection.PeerConnectionState.DISCONNECTED) events.connection(false);
                else if(state==PeerConnection.PeerConnectionState.FAILED) events.failed();
            }
        });
        if(peer==null) {timer.shutdownNow();throw new IllegalStateException("WebRTC is unavailable");}
    }
    private void dispatch(Runnable action) {
        if(closed)return;
        try { timer.execute(() -> {if(!closed)action.run();}); } catch(java.util.concurrent.RejectedExecutionException ignored) { /* receiver closed */ }
    }
    private void track(MediaStreamTrack track) {
        if(closed || track==null) return;
        if(track instanceof VideoTrack video && videoTracks.stream().noneMatch(v -> v.id().equals(video.id()))) {
            videoTracks.add(video);video.setEnabled(true);video.addSink(sink);
        } else if(track instanceof AudioTrack audio && audioTracks.stream().noneMatch(v -> v.id().equals(audio.id()))) {
            audioTracks.add(audio);audio.setEnabled(audible);
        }
    }
    public void start(String sdp) { dispatch(() -> startOffer(sdp)); }
    private void startOffer(String sdp) {
        if(closed) return;
        peer.setRemoteDescription(new Observer() {
            public void onSetSuccess() { dispatch(() -> {
                if(closed)return;
                peer.createAnswer(new Observer() {
                    public void onCreateSuccess(SessionDescription description) { dispatch(() -> {
                        if(closed)return;
                        peer.setLocalDescription(new Observer() {
                            public void onSetSuccess() { dispatch(() -> {
                                if(closed)return;
                                if(peer.iceGatheringState()==PeerConnection.IceGatheringState.COMPLETE) answer();
                                else timer.schedule(NativeReceiver.this::answer,5,TimeUnit.SECONDS);
                            }); }
                        },description);
                    }); }
                },new MediaConstraints());
            }); }
        },new SessionDescription(SessionDescription.Type.OFFER,sdp));
    }
    private void answer() {
        if(closed || answered.get())return;
        SessionDescription description=peer.getLocalDescription();
        if(description!=null && answered.compareAndSet(false,true)) events.answer(description.description);
    }
    public void audio(boolean enabled) { dispatch(() -> {
        audible=enabled;
        for(AudioTrack track:audioTracks)track.setEnabled(enabled);
    }); }
    public void close() {
        if(closed)return;closed=true;
        // All Java-to-native calls share one executor. Never dispose a peer while
        // a queued SDP callback is about to use it, or hold a callback monitor.
        try { timer.submit(() -> {
            for(VideoTrack track:videoTracks)track.removeSink(sink);
            for(AudioTrack track:audioTracks)track.setEnabled(false);
            videoTracks.clear();audioTracks.clear();peer.close();peer.dispose();renderer.clearImage();
        }).get(); }
        catch(InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        catch(java.util.concurrent.ExecutionException failure) { throw new IllegalStateException("Could not close receiver",failure); }
        finally {timer.shutdown();}
    }
    private class Observer implements SdpObserver {
        public void onCreateSuccess(SessionDescription description) {}
        public void onSetSuccess() {}
        public void onCreateFailure(String message) {if(!closed) events.failed();}
        public void onSetFailure(String message) {if(!closed) events.failed();}
    }
}
