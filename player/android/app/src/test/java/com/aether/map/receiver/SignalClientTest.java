package com.aether.map.receiver;
import org.junit.Test;
import static org.junit.Assert.*;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.cert.Certificate;
import java.util.*;
import org.json.JSONObject;

public class SignalClientTest {
    static final String TOKEN="aether_dev_"+"a".repeat(64);
    static final class Connection extends HttpsURLConnection {
        final String reply;final int status;String type="application/json";boolean disconnected;
        final ByteArrayOutputStream sent=new ByteArrayOutputStream();
        Connection(URL url,String reply,int status){super(url);this.reply=reply;this.status=status;}
        public int getResponseCode(){return status;}public String getContentType(){return type;}
        public InputStream getInputStream(){return new ByteArrayInputStream(reply.getBytes(StandardCharsets.UTF_8));}
        public OutputStream getOutputStream(){return sent;}public void connect(){}public void disconnect(){disconnected=true;}public boolean usingProxy(){return false;}
        public String getCipherSuite(){return "test";}public Certificate[] getLocalCertificates(){return null;}public Certificate[] getServerCertificates(){return null;}
    }
    @Test public void enrollmentAndCastUseFixedPathsAndDeviceAuthority()throws Exception{
        List<Connection> calls=new ArrayList<>();String[] reply={"{\"device_id\":\"tv\",\"kind\":\"live_receiver\",\"claimed\":true,\"token\":\""+TOKEN+"\"}","{\"session\":{\"id\":\"cast\",\"offer\":{\"type\":\"offer\",\"sdp\":\"v=0\\r\\n\"}}}","{\"session\":null}"};
        SignalClient client=new SignalClient("https://studio.example:8780","tv","private-proof","TV",url->{Connection c=new Connection(url,reply[calls.size()],200);calls.add(c);return c;});
        try{
            assertEquals(TOKEN,client.announce("").token());assertEquals("cast",client.poll(TOKEN).id());client.signal(TOKEN,"cast","v=0 answer","connected");
            assertEquals("/api/map/devices/announce",calls.get(0).getURL().getPath());
            JSONObject body=new JSONObject(calls.get(0).sent.toString("UTF-8"));assertEquals("live_receiver",body.getString("kind"));assertEquals("private-proof",body.getString("pairing_secret"));
            assertNull(calls.get(0).getRequestProperty("Authorization"));assertEquals("Bearer "+TOKEN,calls.get(1).getRequestProperty("Authorization"));
            assertEquals("/api/map/device/cast",calls.get(1).getURL().getPath());assertFalse(calls.get(1).getInstanceFollowRedirects());
            assertEquals("connected",new JSONObject(calls.get(2).sent.toString("UTF-8")).getString("state"));
            assertTrue(calls.stream().allMatch(c->c.disconnected));
        }finally{client.cancel();}
    }
    @Test public void invalidEnrollmentCannotDowngradeTheDeviceOrAcceptWrongIdentity()throws Exception{
        for(String value:List.of(
                "{\"device_id\":\"tv\",\"claimed\":false,\"code\":\"123456\"}",
                "{\"device_id\":\"tv\",\"kind\":\"player\",\"claimed\":false,\"code\":\"123456\"}",
                "{\"device_id\":\"other\",\"kind\":\"live_receiver\",\"claimed\":false,\"code\":\"123456\"}",
                "{\"device_id\":\"tv\",\"kind\":\"live_receiver\",\"claimed\":false,\"code\":\"12ab56\"}",
                "{\"device_id\":\"tv\",\"kind\":\"live_receiver\",\"claimed\":true,\"token\":\"not-a-device-token\"}")){
            SignalClient c=new SignalClient("https://studio.example","tv","proof","TV",url->new Connection(url,value,200));
            try{assertThrows(IOException.class,()->c.announce(""));}finally{c.cancel();}
        }
    }
    @Test public void redirectsUnauthorizedHtmlAndOversizedBodiesAreRejected()throws Exception{
        for(int status:List.of(301,302,307,401,403,429,500)){
            SignalClient c=new SignalClient("https://studio.example","tv","proof","TV",url->new Connection(url,"",status));
            try{ReceiverSession.HttpFailure failure=assertThrows(ReceiverSession.HttpFailure.class,()->c.poll(TOKEN));assertEquals(status,failure.status);}finally{c.cancel();}
        }
        SignalClient html=new SignalClient("https://studio.example","tv","proof","TV",url->{Connection c=new Connection(url,"sign in",200);c.type="text/html";return c;});
        try{assertThrows(IOException.class,()->html.poll(TOKEN));}finally{html.cancel();}
        SignalClient big=new SignalClient("https://studio.example","tv","proof","TV",url->new Connection(url,"x".repeat(100001),200));
        try{assertThrows(IOException.class,()->big.poll(TOKEN));}finally{big.cancel();}
    }
    @Test public void cancelledClientNeverStartsAnotherRequest(){
        SignalClient c=new SignalClient("https://studio.example","tv","proof","TV",url->{fail("Request after cancel");return null;});c.cancel();
        assertThrows(IOException.class,()->c.poll(TOKEN));
    }
    @Test public void stalledConnectionSetupHasAnOverallDeadlineAndCannotSendAfterCancel()throws Exception{
        java.util.concurrent.CountDownLatch release=new java.util.concurrent.CountDownLatch(1),finished=new java.util.concurrent.CountDownLatch(1);
        Connection[] result=new Connection[1];
        SignalClient c=new SignalClient("https://studio.example","tv","proof","TV",url->{
            try{while(true){try{release.await();break;}catch(InterruptedException ignored){/* simulate non-interruptible DNS */}}}
            finally{finished.countDown();}
            return result[0]=new Connection(url,"{}",200);
        });
        try{assertThrows(java.net.SocketTimeoutException.class,()->c.poll(TOKEN));}
        finally{c.cancel();release.countDown();}
        assertTrue(finished.await(2,java.util.concurrent.TimeUnit.SECONDS));
        // No following request is accepted even when the abandoned setup returns.
        assertThrows(IOException.class,()->c.announce(TOKEN));
    }

}
