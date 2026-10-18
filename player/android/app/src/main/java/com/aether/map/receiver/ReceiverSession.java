package com.aether.map.receiver;

import java.io.IOException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;

/** Serial signalling, bounded reconnect and stale-callback rejection shared by all native TV lifecycle paths. */
final class ReceiverSession {
    record Enrollment(String token, String code) {}
    record Offer(String id, String sdp) {}
    interface Transport {
        Enrollment announce(String token) throws Exception;
        Offer poll(String token) throws Exception;
        void signal(String token, String session, String sdp, String state) throws Exception;
        void cancel();
    }
    interface Credentials { String load(); void save(String token); }
    interface Events { void answer(String sdp); void frame(); void connection(boolean connected); void failed(); }
    interface Engine { void start(String sdp); void audio(boolean enabled); void close(); }
    interface Factory { Engine create(Events events); }
    interface Listener { void status(String message, String code, boolean video); }
    static final class HttpFailure extends IOException {
        final int status;
        HttpFailure(int status) { super(status == 400 ? "This Studio host needs the TV receiver update or rejected the request."
                : status == 401 || status == 403 ? "Receiver access was revoked or the account is unavailable."
                : status == 409 ? "The live session ended. Start Mirror live again."
                : status == 429 ? "Studio is busy. Wait before pairing again." : "Studio could not complete the request (" + status + ")."); this.status = status; }
    }
    private final Transport transport;
    private final Credentials credentials;
    private final Factory factory;
    private final Listener listener;
    private final LongSupplier clock;
    private final ScheduledExecutorService executor;
    private final Object engineLock = new Object();
    private volatile boolean stopped, audio;
    private Engine engine;
    private String token, session = "", rejected = "";
    private long announced = Long.MIN_VALUE, lastSignal, started, disconnected;
    private boolean playing;
    ReceiverSession(Transport transport, Credentials credentials, Factory factory, Listener listener, boolean audio) {
        this(transport, credentials, factory, listener, audio, () -> System.nanoTime()/1_000_000,
                Executors.newSingleThreadScheduledExecutor(r -> new Thread(r, "Aether-TV-signalling")));
    }
    ReceiverSession(Transport transport, Credentials credentials, Factory factory, Listener listener, boolean audio,
                    LongSupplier clock, ScheduledExecutorService executor) {
        this.transport=transport;this.credentials=credentials;this.factory=factory;this.listener=listener;this.audio=audio;
        this.clock=clock;this.executor=executor;token=credentials.load();
    }
    void start() { executor.execute(this::tick); }
    void audio(boolean enabled) { audio=enabled; synchronized(engineLock) { if(engine!=null) engine.audio(enabled); } }
    void stop() {
        stopped=true; transport.cancel(); executor.shutdownNow();
        synchronized(engineLock) { if(engine!=null) {engine.close();engine=null;} }
    }
    private void dispatch(Runnable action) {
        if (stopped) return;
        try { executor.execute(() -> {if(!stopped) action.run();}); } catch(java.util.concurrent.RejectedExecutionException ignored) { /* lifecycle stopped */ }
    }
    private void status(String text, String code, boolean video) { if(!stopped) listener.status(text,code,video); }
    private void closeStream() {
        synchronized(engineLock) { if(engine!=null) { engine.close();engine=null; } }
        session="";playing=false;disconnected=0;
    }
    private void fail(String message) {
        String old=session; rejected=old;closeStream(); status(message,"",false);
        if (!old.isEmpty()) {
            try { transport.signal(token,old,null,"failed"); } catch(Exception ignored) { /* lease expires on the server */ }
        }
    }
    private void send(String sdp, String state) {
        try { transport.signal(token,session,sdp,state);lastSignal=clock.getAsLong(); }
        catch(Exception error) {
            if(error instanceof HttpFailure && ((HttpFailure)error).status<500 && ((HttpFailure)error).status!=429)
                fail(error.getMessage());
            else status("Reconnecting to Studio…","",playing);
        }
    }
    private void begin(Offer offer) {
        closeStream();session=offer.id();started=clock.getAsLong();lastSignal=started;
        final String id=session;
        Events events = new Events() {
            private void current(Runnable action) {dispatch(() -> {if(session.equals(id)) action.run();});}
            public void answer(String sdp) {current(() -> send(sdp,"connecting"));}
            public void frame() {current(() -> {playing=true;disconnected=0;status("Receiving live output","",true);send(null,"connected");});}
            public void connection(boolean connected) {current(() -> {
                if(connected) {disconnected=0;if(playing){status("Receiving live output","",true);send(null,"connected");}}
                else { if(disconnected==0)disconnected=clock.getAsLong();status("Reconnecting live output…","",playing);send(null,"disconnected"); }
            });}
            public void failed() {current(() -> fail("Live connection failed. Start Mirror live again."));}
        };
        synchronized(engineLock) {
            if(stopped) return;
            try { engine=factory.create(events);engine.audio(audio);engine.start(offer.sdp()); }
            catch(RuntimeException failure) {events.failed();}
        }
        status("Connecting live output…","",false);
    }
    private void tick() {
        if(stopped) return;
        try {
            long now=clock.getAsLong();
            if(announced==Long.MIN_VALUE || now-announced>=15000 || token.isEmpty()) {
                Enrollment enrollment=transport.announce(token);
                if(stopped) return;
                announced=clock.getAsLong();
                if(!token.equals(enrollment.token())) {closeStream();token=enrollment.token();credentials.save(token);}
                if(token.isEmpty()) {status("Scan to pair, or enter this code in Aether Map → Players",enrollment.code(),false);return;}
            }
            Offer offer=transport.poll(token);
            if(stopped) return;
            lastSignal=clock.getAsLong();
            if(offer==null) {closeStream();rejected="";status("Ready · In Aether Map, open an output window, then Players → Mirror live.","",false);}
            else if(!offer.id().equals(session) && !offer.id().equals(rejected)) begin(offer);
        } catch(Exception error) {
            if(stopped) return;
            if(error instanceof HttpFailure && (((HttpFailure)error).status==401 || ((HttpFailure)error).status==403)) {
                closeStream();token="";credentials.save("");announced=Long.MIN_VALUE;
                status(error.getMessage(),"",false);
            } else status(error instanceof javax.net.ssl.SSLException ? "Cannot verify Studio’s HTTPS certificate. Install its trusted CA on this TV or use a publicly trusted certificate."
                    : session.isEmpty() ? error instanceof HttpFailure || error instanceof IOException ? error.getMessage() : "Could not connect to Studio. Check its network address." : "Reconnecting to Studio…","",playing);
        } finally {
            if(!stopped) {
                long now=clock.getAsLong();
                if(!session.isEmpty()) {
                    if(now-lastSignal>=8000) fail("Studio connection was lost. Start Mirror live again after reconnecting.");
                    else if(!playing && now-started>=25000) fail("No video arrived. Check that both devices are on the same network, then start Mirror live again.");
                    else if(disconnected!=0 && now-disconnected>=8000) fail("The live connection was lost. Start Mirror live again.");
                }
                if(!stopped) executor.schedule(this::tick,token.isEmpty()?2000:1000,TimeUnit.MILLISECONDS);
            }
        }
    }
}
