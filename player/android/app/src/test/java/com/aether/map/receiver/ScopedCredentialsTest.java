package com.aether.map.receiver;
import org.junit.Test;
import static org.junit.Assert.*;
public class ScopedCredentialsTest {
    @Test public void lateOldServerReplyCannotOverwriteNewServerCredentials(){
        class Store implements ScopedCredentials.Store {
            String origin="https://one.example",id="one",token="first";
            public String origin(){return origin;}public String id(){return id;}public String token(){return token;}public void saveToken(String value){token=value;}
        }
        Store store=new Store();Object lock=new Object();ScopedCredentials old=new ScopedCredentials(lock,store,store.origin,store.id);
        assertEquals("first",old.load());old.save("rotated");assertEquals("rotated",store.token);
        synchronized(lock){store.origin="https://two.example";store.id="two";store.token="second";}
        old.save("late-first-token");assertEquals("second",store.token);assertEquals("",old.load());
        ScopedCredentials current=new ScopedCredentials(lock,store,store.origin,store.id);current.save("new-second");assertEquals("new-second",store.token);
        synchronized(lock){store.id="replacement";store.token="replacement-token";}
        current.save("");assertEquals("replacement-token",store.token);
    }
}
