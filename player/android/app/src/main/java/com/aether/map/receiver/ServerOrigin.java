package com.aether.map.receiver;

import java.net.IDN;
import java.net.URI;
import java.util.Locale;

/** Only an HTTPS origin. Links and credentials never supply paths or redirects. */
final class ServerOrigin {
    static String parse(String text) {
        try {
            URI uri = new URI(text.trim());
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getRawUserInfo() != null
                    || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || !(uri.getRawPath().isEmpty() || uri.getRawPath().equals("/"))
                    || uri.getPort() == 0 || uri.getPort() > 65535 || host.contains("%")) throw new Exception();
            host = host.toLowerCase(Locale.ROOT);
            if (host.equals("localhost") || host.endsWith(".localhost") || host.equals("[::1]")
                    || host.equals("[::]") || host.equals("0.0.0.0") || host.startsWith("127.")) throw new Exception();
            if (host.startsWith("[")) {
                java.net.InetAddress address = java.net.InetAddress.getByName(host.substring(1,host.length()-1));
                if(address.isLoopbackAddress() || address.isAnyLocalAddress() || address.isMulticastAddress()) throw new Exception();
            } else {
                if(host.matches("[0-9.]+")) {
                    String[] octets=host.split("\\.",-1);
                    if(octets.length!=4)throw new Exception();
                    for(String octet:octets)if(!octet.matches("0|[1-9][0-9]{0,2}") || Integer.parseInt(octet)>255)throw new Exception();
                    int first=Integer.parseInt(octets[0]);if(first==0 || first==127 || first>=224)throw new Exception();
                } else if(host.matches("(?i)(?:0x[0-9a-f]+|[0-9]+)(?:\\.(?:0x[0-9a-f]+|[0-9]+))*")) throw new Exception();
                host = IDN.toASCII(host, IDN.USE_STD3_ASCII_RULES);
                if (host.length() > 253 || host.matches("[0-9]+") || host.endsWith(".")) throw new Exception();
            }
            return "https://" + host + (uri.getPort() == -1 || uri.getPort() == 443 ? "" : ":" + uri.getPort());
        } catch (Exception invalid) {
            throw new IllegalArgumentException("Enter this Studio server’s HTTPS network address, for example https://studio.example:8780. Do not use localhost or a page address.");
        }
    }
    static String pairingLink(String origin, String code) {
        if (code == null || !code.matches("[0-9]{6}")) throw new IllegalArgumentException("Invalid pairing code");
        return parse(origin) + "/map/index.html?pair=" + code;
    }
}
