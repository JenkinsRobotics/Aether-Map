package com.aether.map.receiver;

/** A late reply from an old server must never save its bearer under a new server's identity. */
final class ScopedCredentials implements ReceiverSession.Credentials {
    interface Store { String origin(); String id(); String token(); void saveToken(String token); }
    private final Object lock;
    private final Store store;
    private final String origin,id;
    ScopedCredentials(Object lock,Store store,String origin,String id){this.lock=lock;this.store=store;this.origin=origin;this.id=id;}
    private boolean current(){return origin.equals(store.origin())&&id.equals(store.id());}
    public String load(){synchronized(lock){return current()?store.token():"";}}
    public void save(String token){synchronized(lock){if(current())store.saveToken(token);}}
}
