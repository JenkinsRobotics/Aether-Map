package com.aether.map.receiver;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;

public class ReceiverSessionTest {
    static final class Task extends FutureTask<Void> implements ScheduledFuture<Void> {
        final long due;Task(Runnable action,long due){super(action,null);this.due=due;}
        public long getDelay(TimeUnit unit){return unit.convert(due,TimeUnit.MILLISECONDS);}
        public int compareTo(Delayed other){return Long.compare(due,((Task)other).due);}
    }
    static final class Scheduler extends ScheduledThreadPoolExecutor {
        long now=100;final PriorityQueue<Task> tasks=new PriorityQueue<>();
        Scheduler(){super(1);}
        @Override public void execute(Runnable action){schedule(action,0,TimeUnit.MILLISECONDS);}
        @Override public ScheduledFuture<?> schedule(Runnable action,long delay,TimeUnit unit){Task task=new Task(action,now+unit.toMillis(delay));tasks.add(task);return task;}
        void run(){while(!tasks.isEmpty()&&tasks.peek().due<=now){Task t=tasks.remove();t.run();try{t.get();}catch(Exception e){throw new AssertionError(e);}}}
        void advance(long ms){now+=ms;run();}
    }
    static final class Wire implements ReceiverSession.Transport {
        ReceiverSession.Enrollment enrollment=new ReceiverSession.Enrollment("token","");
        ReceiverSession.Offer offer;Exception error;int announcements,polls,cancels;final List<String> signals=new ArrayList<>();
        public ReceiverSession.Enrollment announce(String token)throws Exception{announcements++;if(error!=null)throw error;return enrollment;}
        public ReceiverSession.Offer poll(String token)throws Exception{polls++;if(error!=null)throw error;return offer;}
        public void signal(String token,String id,String sdp,String state)throws Exception{if(error!=null)throw error;signals.add(id+":"+state+":"+(sdp==null?"":sdp));}
        public void cancel(){cancels++;}
    }
    static final class Engine implements ReceiverSession.Engine {
        final ReceiverSession.Events events;int closed;boolean audio;String offer;
        Engine(ReceiverSession.Events events){this.events=events;}
        public void start(String offer){this.offer=offer;}public void audio(boolean enabled){audio=enabled;}public void close(){closed++;}
    }
    static final class Fixture {
        final Scheduler clock=new Scheduler();final Wire wire=new Wire();final List<Engine> engines=new ArrayList<>();
        final List<String> status=new ArrayList<>();String credential="token";boolean playing;
        final ReceiverSession session=new ReceiverSession(wire,new ReceiverSession.Credentials(){
            public String load(){return credential;}public void save(String token){credential=token;}
        },events->{Engine e=new Engine(events);engines.add(e);return e;},(message,code,video)->{status.add(message+":"+code);playing=video;},false,()->clock.now,clock);
        void start(){session.start();clock.run();}
        Engine stream(){wire.offer=new ReceiverSession.Offer("a","v=0\r\n");start();return engines.get(0);}
        String last(){return status.get(status.size()-1);}
    }
    @Test public void pairingShowsCodeWithoutCreatingMediaOrPollingWithNoToken(){
        Fixture f=new Fixture();f.wire.enrollment=new ReceiverSession.Enrollment("","001234");f.start();
        assertEquals("",f.credential);assertTrue(f.last().endsWith(":001234"));assertEquals(0,f.wire.polls);assertTrue(f.engines.isEmpty());
        f.wire.enrollment=new ReceiverSession.Enrollment("new-token","");f.clock.advance(2000);
        assertEquals("new-token",f.credential);assertEquals(1,f.wire.polls);assertTrue(f.last().startsWith("Ready"));f.session.stop();
    }
    @Test public void connectionRequiresARealVideoFrameAndAnswersOnlyCurrentSession(){
        Fixture f=new Fixture();Engine e=f.stream();assertFalse(e.audio);assertEquals("v=0\r\n",e.offer);assertFalse(f.playing);
        e.events.connection(true);f.clock.run();assertFalse(f.playing);
        e.events.answer("v=0 answer");f.clock.run();assertEquals(List.of("a:connecting:v=0 answer"),f.wire.signals);
        e.events.frame();f.clock.run();assertTrue(f.playing);assertTrue(f.wire.signals.contains("a:connected:"));
        f.session.audio(true);assertTrue(e.audio);f.session.stop();assertEquals(1,e.closed);
    }
    @Test public void stoppedOfferReleasesMediaAndLateCallbacksCannotRestartIt(){
        Fixture f=new Fixture();Engine e=f.stream();f.wire.offer=null;f.clock.advance(1000);assertEquals(1,e.closed);assertTrue(f.last().startsWith("Ready"));
        e.events.answer("v=0 stale");e.events.frame();f.clock.run();assertTrue(f.wire.signals.isEmpty());assertFalse(f.playing);f.session.stop();
    }
    @Test public void replacedOfferRejectsPreviousCallbacks(){
        Fixture f=new Fixture();Engine old=f.stream();f.wire.offer=new ReceiverSession.Offer("b","v=0 new");f.clock.advance(1000);
        assertEquals(1,old.closed);assertEquals(2,f.engines.size());old.events.frame();old.events.failed();f.clock.run();assertFalse(f.playing);assertTrue(f.wire.signals.isEmpty());
        f.engines.get(1).events.frame();f.clock.run();assertEquals("b:connected:",f.wire.signals.get(0));f.session.stop();
    }
    @Test public void noFramesTimesOutAndDoesNotLoopOnTheFailedOffer(){
        Fixture f=new Fixture();Engine e=f.stream();f.clock.advance(25001);assertEquals(1,e.closed);assertTrue(f.last().startsWith("No video arrived"));
        f.clock.advance(1000);assertEquals(1,f.engines.size());f.wire.offer=null;f.clock.advance(1000);
        f.wire.offer=new ReceiverSession.Offer("b","v=0");f.clock.advance(1000);assertEquals(2,f.engines.size());f.session.stop();
    }
    @Test public void transientDisconnectCanRecoverButProlongedLossCloses(){
        Fixture f=new Fixture();Engine e=f.stream();e.events.frame();f.clock.run();e.events.connection(false);f.clock.run();f.clock.advance(7000);assertEquals(0,e.closed);
        e.events.connection(true);f.clock.run();f.clock.advance(7000);assertEquals(0,e.closed);
        e.events.connection(false);f.clock.run();f.clock.advance(8001);assertEquals(1,e.closed);assertFalse(f.playing);f.session.stop();
    }
    @Test public void signallingFailureCannotLeaveAnUnboundedPlayingStream(){
        Fixture f=new Fixture();Engine e=f.stream();e.events.frame();f.clock.run();f.wire.error=new IOException("offline");f.clock.advance(7000);assertEquals(0,e.closed);
        f.clock.advance(1001);assertEquals(1,e.closed);assertTrue(f.last().contains("Studio connection was lost"));f.session.stop();
    }
    @Test public void revokedCredentialIsDiscardedAndMediaStops(){
        Fixture f=new Fixture();Engine e=f.stream();f.wire.error=new ReceiverSession.HttpFailure(401);f.clock.advance(1000);
        assertEquals("",f.credential);assertEquals(1,e.closed);assertFalse(f.playing);assertTrue(f.last().contains("revoked"));f.session.stop();
    }
    @Test public void leavingActivityCancelsNetworkingAndRejectsQueuedWork(){
        Fixture f=new Fixture();Engine e=f.stream();f.session.stop();e.events.frame();e.events.answer("v=0 stale");f.clock.advance(30000);
        assertEquals(1,e.closed);assertEquals(1,f.wire.cancels);assertTrue(f.wire.signals.isEmpty());assertFalse(f.playing);
    }
    @Test public void decoderCreationFailureReportsFailureWithoutRetryLoop(){
        Scheduler clock=new Scheduler();Wire wire=new Wire();wire.offer=new ReceiverSession.Offer("a","v=0");List<String> statuses=new ArrayList<>();
        ReceiverSession s=new ReceiverSession(wire,new ReceiverSession.Credentials(){public String load(){return "token";}public void save(String token){}},events->{throw new IllegalStateException("Decoder unavailable");},(message,code,video)->statuses.add(message),false,()->clock.now,clock);
        s.start();clock.run();assertTrue(statuses.get(statuses.size()-1).contains("failed"));assertEquals(List.of("a:failed:"),wire.signals);s.stop();
    }
}
