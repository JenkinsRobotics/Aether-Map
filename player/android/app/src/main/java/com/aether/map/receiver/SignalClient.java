package com.aether.map.receiver;

import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Studio's existing device protocol. No cookies, redirects, external ICE service or browser login. */
final class SignalClient implements ReceiverSession.Transport {
    private final String origin, id, proof, name;
    private volatile HttpsURLConnection active;
    private volatile boolean cancelled;
    // One bounded worker isolates a stalled DNS/TLS call from signalling deadlines.
    // At most one pending request is retained if the platform cannot interrupt DNS.
    private final java.util.concurrent.ThreadPoolExecutor io = new java.util.concurrent.ThreadPoolExecutor(
            1,1,30,java.util.concurrent.TimeUnit.SECONDS,new java.util.concurrent.ArrayBlockingQueue<>(1),r -> {
        Thread thread=new Thread(r,"Aether-TV-HTTPS");thread.setDaemon(true);return thread;
    });
    interface ConnectionOpener { HttpsURLConnection open(URL url) throws IOException; }
    private final ConnectionOpener opener;
    SignalClient(String origin, String id, String proof, String name) {
        this(origin,id,proof,name,url -> (HttpsURLConnection)url.openConnection());
    }
    SignalClient(String origin, String id, String proof, String name, ConnectionOpener opener) {
        this.origin = ServerOrigin.parse(origin); this.id = id; this.proof = proof; this.name = name;this.opener=opener;io.allowCoreThreadTimeOut(true);
    }
    public ReceiverSession.Enrollment announce(String token) throws Exception {
        JSONObject reply = request("/api/map/devices/announce", token, new JSONObject()
                .put("device_id", id).put("name", name).put("pairing_secret", proof).put("kind", "live_receiver"));
        if (!"live_receiver".equals(reply.optString("kind")))
            throw new IOException("This Studio host needs the TV receiver update before pairing.");
        if (!id.equals(reply.getString("device_id"))) throw new IOException("Invalid device response");
        if (reply.getBoolean("claimed")) {
            String credential = reply.getString("token");
            if (!credential.matches("aether_dev_[a-f0-9]{64}")) throw new IOException("Invalid device credential");
            return new ReceiverSession.Enrollment(credential, "");
        }
        String code = reply.getString("code");
        if (!code.matches("[0-9]{6}")) throw new IOException("Invalid pairing code");
        return new ReceiverSession.Enrollment("", code);
    }
    public ReceiverSession.Offer poll(String token) throws Exception {
        JSONObject reply = request("/api/map/device/cast", token, null);
        if (reply.isNull("session")) return null;
        JSONObject session = reply.getJSONObject("session"), offer = session.getJSONObject("offer");
        String id = session.getString("id"), sdp = offer.getString("sdp");
        if (id.isEmpty() || id.length() > 128 || !"offer".equals(offer.getString("type"))
                || !sdp.startsWith("v=0") || sdp.getBytes(StandardCharsets.UTF_8).length > 65536) throw new IOException("Invalid live stream offer");
        return new ReceiverSession.Offer(id, sdp);
    }
    public void signal(String token, String session, String sdp, String state) throws Exception {
        JSONObject body = new JSONObject().put("session_id", session).put("state", state);
        if (sdp != null) body.put("sdp", sdp);
        request("/api/map/device/cast", token, body);
    }
    public void cancel() { cancelled=true; io.shutdownNow(); HttpsURLConnection request = active; if (request != null) request.disconnect(); }
    private JSONObject request(String path, String token, JSONObject body) throws Exception {
        java.util.concurrent.Future<JSONObject> pending;
        try {io.purge();pending=io.submit(() -> perform(path,token,body));}
        catch(java.util.concurrent.RejectedExecutionException busy){throw new IOException("Waiting for the previous network request to close.");}
        try {return pending.get(6,java.util.concurrent.TimeUnit.SECONDS);}
        catch(java.util.concurrent.TimeoutException timeout){
            pending.cancel(true);HttpsURLConnection connection=active;if(connection!=null)connection.disconnect();
            throw new java.net.SocketTimeoutException("Studio did not respond within six seconds.");
        } catch(InterruptedException stopped){
            pending.cancel(true);Thread.currentThread().interrupt();throw new java.io.InterruptedIOException("Receiver stopped");
        } catch(java.util.concurrent.ExecutionException failed){
            if(failed.getCause() instanceof Exception error)throw error;
            throw new IOException("Could not connect to Studio",failed.getCause());
        }
    }
    private JSONObject perform(String path, String token, JSONObject body) throws Exception {
        if(cancelled) throw new java.io.InterruptedIOException("Receiver stopped");
        HttpsURLConnection connection = opener.open(new URL(origin + path));
        active = connection;
        try {
            if(cancelled) throw new java.io.InterruptedIOException("Receiver stopped");
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(6000); connection.setReadTimeout(6000);
            connection.setRequestProperty("Accept", "application/json"); connection.setUseCaches(false);
            if (!token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length); connection.setRequestProperty("Content-Type", "application/json");
                try (var output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status != 200) throw new ReceiverSession.HttpFailure(status);
            String contentType = connection.getContentType();
            if (contentType == null || !contentType.toLowerCase(java.util.Locale.ROOT).startsWith("application/json"))
                throw new IOException("Studio returned an unexpected response");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > 100000) throw new IOException("Studio response exceeds receiver limit");
                    output.write(buffer, 0, count);
                }
                return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
            }
        } finally { active = null; connection.disconnect(); }
    }
}
