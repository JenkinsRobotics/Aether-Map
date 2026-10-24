"""First-run setup for an Aether Map projector.

A Pi bolted to a projector has no keyboard, so the wizard cannot be typed on
the screen it is driving. When it has no network it raises its own access
point instead: the projector displays what to join and where to go, and the
operator completes setup from a phone. That is the whole reason this is a web
wizard on the device rather than a console script.

Everything that touches the operating system goes through `Network`, so the
step logic is exercised in tests without a Pi, a radio, or root. What cannot
be tested off-hardware is the nmcli conversation itself; that is why the
commands are built by small named functions rather than inline strings.
"""

from __future__ import annotations

import re
import subprocess
from typing import Protocol

#: The wizard, in order. `done` is a state, not a screen to fill in.
STEPS = ("wifi", "server", "name", "permissions", "done")

#: What the setup access point is called when the Pi has no network of its own.
SETUP_SSID = "Aether Setup"

#: Choices the operator makes about this device once, at setup. These are real
#: settings the player acts on — not a consent screen for its own sake. The
#: values here are only what the wizard shows pre-ticked; what gets stored is
#: what the operator actually sent.
PERMISSIONS = {
    # A projector that blanks after ten minutes is a support call.
    "keep_display_awake": True,
    # HDMI carries audio on a Pi; a show with sound needs this on, and a
    # gallery piece beside another exhibit usually needs it off.
    "play_audio": True,
    # The show pull also carries player updates. Some installations freeze a
    # known-good version instead.
    "allow_updates": True,
}


class Network(Protocol):
    """The device's radio, as the wizard needs it."""

    def status(self) -> dict: ...
    def scan(self) -> list[dict]: ...
    def join(self, ssid: str, passphrase: str) -> tuple[bool, str]: ...
    def hotspot(self, on: bool) -> tuple[bool, str]: ...


def scan_command() -> list[str]:
    return ["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", "auto"]


def join_command(ssid: str, passphrase: str) -> list[str]:
    command = ["nmcli", "device", "wifi", "connect", ssid]
    # An open network takes no password, and passing an empty one fails.
    if passphrase:
        command += ["password", passphrase]
    return command


def hotspot_command(on: bool, password: str = "") -> list[str]:
    if not on:
        return ["nmcli", "connection", "down", "aether-setup"]
    return ["nmcli", "device", "wifi", "hotspot", "con-name", "aether-setup",
            "ssid", SETUP_SSID, "password", password]


def parse_scan(output: str) -> list[dict]:
    """nmcli terse output into networks, strongest first, one row per SSID.

    Terse mode escapes colons inside fields, so a split on every colon would
    tear apart an SSID containing one. Splitting from the right on the two
    trailing fields leaves the name intact.
    """
    seen: dict[str, dict] = {}
    for line in output.splitlines():
        if not line.strip():
            continue
        parts = line.rsplit(":", 2)
        if len(parts) != 3:
            continue
        ssid, signal, security = (part.strip() for part in parts)
        ssid = ssid.replace("\\:", ":")
        # A hidden network reports an empty SSID; there is nothing to show or
        # tap, and the operator cannot pick it out of a list anyway.
        if not ssid or ssid == SETUP_SSID:
            continue
        try:
            strength = int(signal)
        except ValueError:
            strength = 0
        found = {"ssid": ssid, "signal": strength, "secured": bool(security and security != "--")}
        # The same network on two bands appears twice; keep the stronger.
        if ssid not in seen or seen[ssid]["signal"] < strength:
            seen[ssid] = found
    return sorted(seen.values(), key=lambda entry: -entry["signal"])


class NetworkManager:
    """nmcli, which is what Raspberry Pi OS has used since Bookworm."""

    def __init__(self, run=subprocess.run, password="") -> None:
        self._run = run
        self.password = password

    def _nmcli(self, command: list[str], timeout: int = 45) -> tuple[bool, str]:
        try:
            done = self._run(command, capture_output=True, text=True, timeout=timeout)
        except (OSError, subprocess.SubprocessError) as error:
            return False, str(error)
        return done.returncode == 0, (done.stdout if done.returncode == 0 else done.stderr).strip()

    def status(self) -> dict:
        ok, out = self._nmcli(["nmcli", "-t", "-f", "STATE,CONNECTIVITY", "general", "status"], timeout=10)
        connected = ok and out.startswith("connected")
        ssid = None
        got, active = self._nmcli(
            ["nmcli", "-t", "-f", "ACTIVE,SSID", "device", "wifi"], timeout=10)
        if got:
            for line in active.splitlines():
                if line.startswith("yes:"):
                    ssid = line.split(":", 1)[1] or None
                    break
        # The setup access point is this device talking to itself: being "on"
        # it is not being on a network, and reporting otherwise would let the
        # wizard march past the step that fixes it.
        if ssid == SETUP_SSID:
            return {"connected": False, "ssid": None, "hotspot": True}
        return {"connected": connected, "ssid": ssid, "hotspot": False}

    def scan(self) -> list[dict]:
        ok, out = self._nmcli(scan_command(), timeout=30)
        return parse_scan(out) if ok else []

    def join(self, ssid: str, passphrase: str) -> tuple[bool, str]:
        ok, detail = self._nmcli(join_command(ssid, passphrase))
        if ok:
            got, active = self._nmcli(["nmcli", "-t", "-f", "UUID,TYPE", "connection", "show", "--active"])
            if got:
                for row in active.splitlines():
                    uuid, _, kind = row.partition(":")
                    if kind == "802-11-wireless":
                        self._nmcli(["nmcli", "connection", "modify", "uuid", uuid,
                                     "connection.autoconnect", "yes", "connection.autoconnect-retries", "0"])
        return ok, detail

    def hotspot(self, on: bool) -> tuple[bool, str]:
        if not on:
            return self._nmcli(hotspot_command(False))
        exists, _ = self._nmcli(["nmcli", "connection", "show", "aether-setup"])
        if not exists:
            ok, detail = self._nmcli(hotspot_command(True, self.password))
            if not ok:
                return ok, detail
        ok, detail = self._nmcli(["nmcli", "connection", "modify", "aether-setup",
            "connection.autoconnect", "no", "ipv4.method", "shared", "ipv4.addresses", "192.168.4.1/24",
            "wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", self.password])
        if not ok:
            return ok, detail
        return self._nmcli(["nmcli", "connection", "up", "aether-setup"])


def valid_server_url(url: str) -> str | None:
    """A host address the daemon can actually use, or None.

    Typed on a phone, so a bare `studio.local:8780` is what an operator will
    enter and is accepted; anything that is not http(s) is not.
    """
    url = url.strip().rstrip("/")
    if not url:
        return None
    if not re.match(r"^https?://", url):
        url = "http://" + url
    if not re.match(r"^https?://[A-Za-z0-9._~\-]+(:\d{1,5})?$", url):
        return None
    return url


def device_name(name: str) -> str | None:
    """What this projector is called in Aether Map. The operator picks it."""
    name = " ".join(name.split())[:80]
    return name or None


def next_step(config: dict, status: dict) -> str:
    """The first thing still unanswered. Setup is done when nothing is.

    Order matters and is not arbitrary: without a network the Pi cannot reach
    a host, and without a host there is nothing to register a name with.

    Setup finishing is permanent. A configured projector that loses its
    network is **not** an unconfigured one: it keeps playing its last good
    show from local disk, which is the entire reason this device exists. An
    earlier draft of this function sent any disconnected device back to the
    Wi-Fi step, which would have taken a projector off the wall mid-show the
    moment the router rebooted.
    """
    if config.get("setup_complete"):
        return "done"
    if not status.get("connected"):
        return "wifi"
    if not config.get("server_url"):
        return "server"
    if not config.get("name"):
        return "name"
    if not isinstance(config.get("permissions"), dict):
        return "permissions"
    return "done"


def adopt(config: dict) -> bool:
    """Mark a pre-wizard install as set up. Returns whether anything changed.

    Purely a migration, and keyed on exactly that: `install.sh` has written
    `setup_complete` either way since the wizard existed, so a config missing
    the key entirely was written before it. Such a device has a host, has been
    claimed, and has been running — it must not come up one day inside a
    wizard it has no need for.

    A name is deliberately not required. A device can be paired and playing
    without one; the host falls back to the device id. Requiring it here sent
    a claimed, running projector back to step three.
    """
    if "setup_complete" in config or not config.get("server_url"):
        return False
    config["setup_complete"] = True
    config.setdefault("permissions", dict(PERMISSIONS))
    return True


def progress(config: dict, status: dict, paired: bool) -> dict:
    """Everything both the phone wizard and the projector screen render."""
    step = next_step(config, status)
    return {
        "step": step,
        "steps": list(STEPS),
        "index": STEPS.index(step),
        "ssid": status.get("ssid"),
        "hotspot": bool(status.get("hotspot")),
        "connected": bool(status.get("connected")),
        "server_url": config.get("server_url", ""),
        "name": config.get("name", ""),
        "device_id": config.get("device_id", ""),
        "permissions": config.get("permissions") or PERMISSIONS,
        # Setup finishing is not the same as being claimed: the operator still
        # enters the pairing code in Aether Map.
        "paired": paired,
        "complete": bool(config.get("setup_complete")),
        "code": config.get("_pairing", {}).get("code", ""),
        "setup_ssid": SETUP_SSID,
        "setup_password": config.get("setup_password", ""),
    }


def apply_step(step: str, body: dict, config: dict, network: Network) -> tuple[bool, str]:
    """Answer one step. Returns whether it took, and what to say if it did not.

    The config is mutated in place and saved by the caller, which owns the
    file. Nothing here reaches the disk.
    """
    if step == "wifi":
        ssid = str(body.get("ssid", "")).strip()
        if not ssid:
            return False, "Choose a network."
        joined, detail = network.join(ssid, str(body.get("passphrase", "")))
        return joined, "" if joined else (detail or "Could not join that network.")

    if step == "server":
        url = valid_server_url(str(body.get("server_url", "")))
        if not url:
            return False, "Enter the address of your Aether Studio host."
        config["server_url"] = url
        return True, ""

    if step == "name":
        name = device_name(str(body.get("name", "")))
        if not name:
            return False, "Give this projector a name."
        config["name"] = name
        return True, ""

    if step == "permissions":
        given = body.get("permissions")
        if not isinstance(given, dict):
            return False, "Choose what this device may do."
        # Absent means not granted, never the default. The wizard posts every
        # box, so a partial payload is a malformed one, and it must not be
        # able to switch something on that nobody ticked.
        config["permissions"] = {key: bool(given.get(key, False)) for key in PERMISSIONS}
        # The last step. From here the device is configured for good, and a
        # dead network is a thing to ride out rather than a reason to ask
        # again.
        config["setup_complete"] = True
        return True, ""

    return False, f"Unknown setup step {step!r}."


def load_page() -> str:
    """The wizard, served to a phone. Deliberately one file with no assets:
    it has to work on a device whose only network is this Pi's own."""
    return SETUP_PAGE


SETUP_PAGE = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Set up this projector</title><style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#15161a;color:#f4f4f6;font:16px/1.5 system-ui,sans-serif;
padding:24px 16px;max-width:520px;margin-inline:auto}
h1{font-size:20px;margin:0 0 4px}p.sub{color:#a0a0ad;margin:0 0 20px}
ol.steps{display:flex;gap:6px;list-style:none;padding:0;margin:0 0 20px;font-size:12px}
ol.steps li{flex:1;padding:6px 4px;text-align:center;border-radius:6px;background:#22232a;color:#82828f}
ol.steps li[data-on]{background:#5b4fd6;color:#fff}
label{display:block;margin:14px 0 6px;font-size:13px;color:#c6c6d0}
input[type=text],input[type=password],select{width:100%;padding:11px 12px;border-radius:8px;
border:1px solid #33343d;background:#1d1e24;color:inherit;font:inherit}
button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:8px;background:#5b4fd6;
color:#fff;font:600 16px system-ui;cursor:pointer}
button:disabled{opacity:.5}
.row{display:flex;align-items:center;gap:10px;margin:12px 0}
.row input{width:20px;height:20px;flex:none}
.row span{font-size:14px}.row small{display:block;color:#8d8d99;font-size:12px}
.err{background:#3a1f24;border:1px solid #7a2f3a;padding:10px 12px;border-radius:8px;margin-top:14px;font-size:14px}
.ok{text-align:center;padding:28px 0}.code{font:700 40px ui-monospace,monospace;letter-spacing:6px;margin:12px 0}
</style></head><body>
<h1 id="title">Set up this projector</h1><p class="sub" id="sub"></p>
<ol class="steps" id="bar"></ol>
<div id="form"></div><div id="error"></div>
<script>
const LABEL={wifi:"Wi-Fi",server:"Host",name:"Name",permissions:"Device",done:"Done"};
const BLURB={wifi:"Choose the network this projector should use.",
server:"Where Aether Studio is running on your network.",
name:"What this projector is called in Aether Map.",
permissions:"What this device is allowed to do on its own.",
done:"Setup is complete."};
let state=null,busy=false;
const esc=(s)=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=(id)=>document.getElementById(id);
async function load(){state=await (await fetch("setup/state",{cache:"no-store"})).json();render();}
function bar(){el("bar").innerHTML=state.steps.map((s,i)=>
`<li ${i<=state.index?"data-on":""}>${LABEL[s]}</li>`).join("");}
function render(){
  bar();el("sub").textContent=BLURB[state.step];
  if(state.step==="done")return done();
  el("title").textContent="Set up this projector";
  const f=el("form");
  if(state.step==="wifi")f.innerHTML=`<label for=ssid>Network</label>
<select id=ssid><option value="">Scanning…</option></select>
<label for=psk>Password</label><input id=psk type=password autocomplete=off>
<button id=go>Join network</button>`;
  if(state.step==="server")f.innerHTML=`<label for=url>Host address</label>
<input id=url type=text inputmode=url placeholder="studio.local:8780" value="${esc(state.server_url)}">
<button id=go>Continue</button>`;
  if(state.step==="name")f.innerHTML=`<label for=nm>Projector name</label>
<input id=nm type=text placeholder="Front of house" value="${esc(state.name)}">
<button id=go>Continue</button>`;
  if(state.step==="permissions")f.innerHTML=Object.entries({
    keep_display_awake:["Keep the display awake","Stops the projector blanking between cues."],
    play_audio:["Play audio through this device","HDMI carries sound to the projector."],
    allow_updates:["Update the playback renderer","Renderer updates arrive with the show."]
  }).map(([k,[t,d]])=>`<label class=row><input type=checkbox id=${k} ${state.permissions[k]?"checked":""}>
<span>${t}<small>${d}</small></span></label>`).join("")+`<button id=go>Finish setup</button>`;
  el("go").onclick=submit;
  if(state.step==="wifi")scan();
}
async function scan(){
  const list=await (await fetch("setup/networks",{cache:"no-store"})).json();
  const s=el("ssid");
  s.innerHTML=list.networks.length?list.networks.map(n=>
    `<option value="${esc(n.ssid)}">${esc(n.ssid)}${n.secured?"":" (open)"}</option>`).join("")
    :`<option value="">No networks found</option>`;
}
function values(){
  if(state.step==="wifi")return{ssid:el("ssid").value,passphrase:el("psk").value};
  if(state.step==="server")return{server_url:el("url").value};
  if(state.step==="name")return{name:el("nm").value};
  return{permissions:Object.fromEntries(Object.keys(state.permissions).map(k=>[k,el(k).checked]))};
}
async function submit(){
  if(busy)return;busy=true;el("go").disabled=true;el("error").innerHTML="";
  const step=state.step;
  try{
    const r=await fetch("setup/"+step,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(values())});
    const out=await r.json();
    if(!out.ok){el("error").innerHTML=`<div class=err>${esc(out.error)}</div>`;}
    else{state=out.progress;render();}
  }catch(e){el("error").innerHTML=`<div class=err>The projector stopped responding. It may be
    switching networks — reconnect to it and reload.</div>`;}
  busy=false;const g=el("go");if(g)g.disabled=false;
}
function done(){
  el("title").textContent=state.paired?"This projector is ready":"Almost there";
  el("form").innerHTML=state.paired
    ?`<div class=ok><p>${state.name} is paired and will start on its own at every boot.</p></div>`
    :`<div class=ok><p>Enter this code in Aether Map under Devices.</p>
       <div class=code>${state.code||"……"}</div>
       <p class=sub>Waiting for ${state.name} to be claimed.</p></div>`;
  if(!state.paired)setTimeout(load,3000);
}
load();
</script></body></html>"""
