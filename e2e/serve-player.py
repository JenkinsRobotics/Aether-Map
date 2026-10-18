"""Use the production player HTTP handler on an ephemeral test port.

With a second argument the radio is faked, so the setup wizard can be driven
in a browser without a wireless card, nmcli, or root. Only the network is
substituted — the handler, the wizard and the config file are the real ones.
"""
import importlib.util
import sys
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

SOURCE = Path(__file__).parents[2] / "aether-player"


def load(name):
    spec = importlib.util.spec_from_file_location(name, SOURCE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


setup = load("aether_setup")
load("aether_receiver")
player = load("aether_player")


class FakeRadio:
    """Two networks in range, and joining either one works."""

    def __init__(self):
        self.connected, self.ssid, self.hotspot_up = False, None, True

    def status(self):
        return {"connected": self.connected, "ssid": self.ssid,
                "hotspot": self.hotspot_up and not self.connected}

    def scan(self):
        return [{"ssid": "Barn", "signal": 74, "secured": True},
                {"ssid": "Cafe", "signal": 40, "secured": False}]

    def join(self, ssid, passphrase):
        if ssid == "Barn" and passphrase != "haybales":
            return False, "Secrets were required, but not provided"
        self.connected, self.ssid, self.hotspot_up = True, ssid, False
        return True, ""

    def hotspot(self, on):
        self.hotspot_up = on
        return True, ""


config = player.load_config(Path(sys.argv[1]))
network = FakeRadio() if len(sys.argv) > 2 else None
server = ThreadingHTTPServer(("127.0.0.1", 0), partial(
    player.ShowHandler, directory=config["show_dir"], config=config, network=network))
server.daemon_threads = True
print(server.server_port, flush=True)
server.serve_forever()
