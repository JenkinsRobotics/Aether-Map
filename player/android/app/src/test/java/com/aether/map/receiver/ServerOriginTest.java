package com.aether.map.receiver;
import org.junit.Test;
import static org.junit.Assert.*;

public class ServerOriginTest {
    @Test public void canonicalHttpsAndSixDigitPairing() {
        assertEquals("https://studio.example:8780",ServerOrigin.parse(" HTTPS://Studio.Example:8780/ "));
        assertEquals("https://studio.example",ServerOrigin.parse("https://studio.example:443"));
        assertEquals("https://[fd00::1]:8780/map/index.html?pair=001234",ServerOrigin.pairingLink("https://[fd00::1]:8780","001234"));
    }
    @Test public void rejectsCredentialPathAndRedirectInjection() {
        for(String value:new String[]{"http://studio.example","https://user:password@studio.example","https://studio.example/map/","https://studio.example?next=evil","https://studio.example/#token","https://studio.example:0","https://studio.example:65536","https://studio.example\\@evil.example","https://localhost:8780","https://127.0.0.1","https://[::1]","https://0.0.0.0","https://2130706433","https://[0:0:0:0:0:0:0:1]","https://224.0.0.1","https://127.1","https://0177.0.0.1","https://0x7f000001"}) {
            assertThrows(value,IllegalArgumentException.class,()->ServerOrigin.parse(value));
        }
        for(String code:new String[]{"12345","1234567","12ab56","１２３４５６","123456&next=evil"})assertThrows(IllegalArgumentException.class,()->ServerOrigin.pairingLink("https://studio.example",code));
    }
}
