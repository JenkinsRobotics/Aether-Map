"""First-run setup: the step order, the nmcli conversation, and the wizard.

Nothing here touches a radio. `Network` is the seam the player uses for every
OS call, so the whole wizard runs against a fake — which is the point: the
step logic must be verifiable without a Pi, root, or a wireless card.
"""
import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[1]


def _load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


setup = _load("aether_setup")


class FakeNetwork:
    """A radio that does what it is told and remembers being told."""

    def __init__(self, connected=False, ssid=None, joins=True):
        self._connected, self._ssid, self._joins = connected, ssid, joins
        self.hotspot_calls, self.joined = [], []

    def status(self):
        return {"connected": self._connected, "ssid": self._ssid,
                "hotspot": not self._connected and bool(self.hotspot_calls[-1:] == [True])}

    def scan(self):
        return [{"ssid": "Barn", "signal": 71, "secured": True}]

    def join(self, ssid, passphrase):
        self.joined.append((ssid, passphrase))
        if not self._joins:
            return False, "Secrets were required, but not provided"
        self._connected, self._ssid = True, ssid
        return True, ""

    def hotspot(self, on):
        self.hotspot_calls.append(on)
        return True, ""


@pytest.fixture
def config(tmp_path):
    return {"device_id": "pi-test", "show_dir": str(tmp_path / "show"),
            "_path": str(tmp_path / "config.json"), "port": 8777}


# --- the order of the wizard -------------------------------------------------

def test_a_box_out_of_the_wrapper_starts_at_wifi(config):
    assert setup.next_step(config, {"connected": False}) == "wifi"


def test_each_answer_advances_to_the_next_unanswered_thing(config):
    online = {"connected": True, "ssid": "Barn"}
    assert setup.next_step(config, online) == "server"
    config["server_url"] = "http://studio.local:8780"
    assert setup.next_step(config, online) == "name"
    config["name"] = "Front of house"
    assert setup.next_step(config, online) == "permissions"
    config["permissions"] = dict(setup.PERMISSIONS)
    assert setup.next_step(config, online) == "done"


def test_losing_the_network_does_not_send_a_configured_projector_back_to_setup(config):
    """Offline playback is the reason this device exists.

    A projector that drops off the wifi keeps showing its last good show. An
    earlier draft returned "wifi" for any disconnected device, which would
    have replaced a running show with a setup screen the moment a router
    rebooted — losing the show to fix nothing.
    """
    config.update(server_url="http://h", name="Lobby",
                  permissions=dict(setup.PERMISSIONS), setup_complete=True)
    assert setup.next_step(config, {"connected": True}) == "done"
    assert setup.next_step(config, {"connected": False}) == "done"


def test_finishing_the_last_step_completes_setup_for_good(config):
    config.update(server_url="http://h", name="Lobby")
    setup.apply_step("permissions", {"permissions": dict(setup.PERMISSIONS)}, config, FakeNetwork())
    assert config["setup_complete"] is True
    assert setup.next_step(config, {"connected": False}) == "done"


def test_a_device_installed_before_the_wizard_existed_is_adopted(config):
    """It has a host from install.sh and has been running. It must not wake up
    one day inside a wizard it never needed."""
    config.update(server_url="http://studio.local:8780", name="Foyer")
    assert setup.adopt(config) is True
    assert config["setup_complete"] is True
    assert config["permissions"] == setup.PERMISSIONS
    assert setup.next_step(config, {"connected": True}) == "done"
    # Idempotent, and it never adopts a device that has no host to talk to.
    assert setup.adopt(config) is False
    assert setup.adopt({"device_id": "fresh"}) is False


def test_a_claimed_device_with_no_name_is_still_adopted():
    """A projector can be paired and playing without ever being named — the
    host falls back to the device id. Requiring a name here sent a running
    projector back into the wizard."""
    claimed = {"device_id": "pi", "server_url": "http://studio.local:8780", "token": "aether_dev_x"}
    assert setup.adopt(claimed) is True
    assert setup.next_step(claimed, {"connected": False}) == "done"


def test_a_fresh_install_from_the_downloadable_installer_is_never_adopted():
    """It writes setup_complete false on purpose; the wizard must run."""
    fresh = {"device_id": "pi", "server_url": "", "name": "", "setup_complete": False}
    assert setup.adopt(fresh) is False
    assert setup.next_step(fresh, {"connected": False}) == "wifi"


# --- answering the steps -----------------------------------------------------

def test_joining_a_network_is_the_wifi_step(config):
    network = FakeNetwork()
    ok, error = setup.apply_step("wifi", {"ssid": "Barn", "passphrase": "hay"}, config, network)
    assert (ok, error) == (True, "")
    assert network.joined == [("Barn", "hay")]


def test_a_wrong_passphrase_is_reported_not_swallowed(config):
    network = FakeNetwork(joins=False)
    ok, error = setup.apply_step("wifi", {"ssid": "Barn", "passphrase": "no"}, config, network)
    assert ok is False
    assert "Secrets" in error


def test_a_host_typed_on_a_phone_is_accepted_without_a_scheme(config):
    assert setup.apply_step("server", {"server_url": "studio.local:8780"}, config, FakeNetwork())[0]
    assert config["server_url"] == "http://studio.local:8780"


@pytest.mark.parametrize("typed", ["", "   ", "ftp://studio", "not a host", "http://a b"])
def test_a_host_that_is_not_an_address_is_refused(config, typed):
    ok, error = setup.apply_step("server", {"server_url": typed}, config, FakeNetwork())
    assert ok is False and error


def test_the_operator_names_the_projector(config):
    assert setup.apply_step("name", {"name": "  Front   of house "}, config, FakeNetwork())[0]
    assert config["name"] == "Front of house"
    assert setup.apply_step("name", {"name": "   "}, config, FakeNetwork())[0] is False


def test_permissions_record_every_choice_including_the_refusals(config):
    setup.apply_step("permissions", {"permissions": {"play_audio": False}}, config, FakeNetwork())
    assert config["permissions"] == {
        "keep_display_awake": False, "play_audio": False, "allow_updates": False,
    }
    # Absent keys are refusals, not defaults: an unticked box means no.
    setup.apply_step("permissions", {"permissions": dict(setup.PERMISSIONS)}, config, FakeNetwork())
    assert config["permissions"]["play_audio"] is True


# --- the nmcli conversation --------------------------------------------------

def test_an_open_network_is_joined_without_a_password():
    assert setup.join_command("Cafe", "") == ["nmcli", "device", "wifi", "connect", "Cafe"]
    assert setup.join_command("Barn", "hay")[-2:] == ["password", "hay"]


def test_a_scan_keeps_the_strongest_of_each_network_and_drops_the_unusable():
    listing = "\n".join([
        "Barn:71:WPA2",
        "Barn:44:WPA2",          # same network, weaker band
        ":60:WPA2",              # hidden: nothing to tap
        "Cafe:52:",              # open
        "Aether Setup:90:WPA2",  # this device's own access point
        "malformed",
    ])
    assert setup.parse_scan(listing) == [
        {"ssid": "Barn", "signal": 71, "secured": True},
        {"ssid": "Cafe", "signal": 52, "secured": False},
    ]


def test_an_ssid_containing_a_colon_survives_terse_output():
    assert setup.parse_scan(r"Bob\:s Wi-Fi:63:WPA2") == [
        {"ssid": "Bob:s Wi-Fi", "signal": 63, "secured": True}]


def test_nmcli_failure_is_an_empty_list_not_an_exception():
    class Failing:
        def __call__(self, *a, **k):
            raise OSError("nmcli: not found")
    assert setup.NetworkManager(run=Failing()).scan() == []


def test_the_devices_own_access_point_does_not_read_as_being_online():
    """Otherwise the wizard skips the one step that would fix the problem."""
    class Hotspot:
        def __call__(self, command, **kwargs):
            joined = " ".join(command)
            out = "connected:full" if "general" in joined else f"yes:{setup.SETUP_SSID}"
            return type("R", (), {"returncode": 0, "stdout": out, "stderr": ""})()
    status = setup.NetworkManager(run=Hotspot()).status()
    assert status == {"connected": False, "ssid": None, "hotspot": True}


# --- what both screens render ------------------------------------------------

def test_progress_tells_the_projector_screen_what_to_display(config):
    state = setup.progress(config, {"connected": False, "hotspot": True}, paired=False)
    assert state["step"] == "wifi"
    assert state["setup_ssid"] == setup.SETUP_SSID
    assert state["hotspot"] is True
    assert state["index"] == 0 and state["steps"][-1] == "done"


def test_finishing_setup_is_not_the_same_as_being_claimed(config):
    config.update(server_url="http://h", name="Lobby", permissions=dict(setup.PERMISSIONS),
                  _pairing={"code": "123456"})
    state = setup.progress(config, {"connected": True, "ssid": "Barn"}, paired=False)
    assert state["step"] == "done" and state["paired"] is False and state["code"] == "123456"


def test_an_unknown_step_is_refused(config):
    ok, error = setup.apply_step("reboot", {}, config, FakeNetwork())
    assert ok is False and "reboot" in error
