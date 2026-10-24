"""Short-lived signalling for paired Map players. Media travels peer-to-peer.

Call under the host lock. Leases live in memory, are bound to the current
pairing token, and never change the saved-show assignment.
"""
import secrets
import time

from core.host.state import Problem


class MapCast:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.sessions = {}

    def current(self, device):
        session = self.sessions.get(device["id"])
        if session and (session["expires"] <= self.clock() or session["token"] != device["token"]):
            self.sessions.pop(device["id"], None)
            return None
        return session

    @staticmethod
    def description(data, kind):
        sdp = data.get("sdp")
        if not isinstance(sdp, str) or not sdp.startswith("v=0") or len(sdp) > 65536:
            raise Problem(400, "Invalid session description.")
        return {"type": kind, "sdp": sdp}

    def owner(self, device, action, data):
        session = self.current(device)
        if action == "cast-start":
            offer = self.description(data, "offer")
            if session:
                raise Problem(409, "This device is already mirroring. Stop that session first.")
            # Prune expired leases so disconnected devices do not accumulate.
            self.sessions = {k: v for k, v in self.sessions.items() if v["expires"] > self.clock()}
            session = {"id": secrets.token_urlsafe(24), "token": device["token"],
                       "offer": offer, "answer": None, "state": "waiting", "expires": self.clock() + 20}
            self.sessions[device["id"]] = session
        else:
            if not session or data.get("session_id") != session["id"]:
                raise Problem(409, "The mirroring session has ended.")
            if action == "cast-stop":
                self.sessions.pop(device["id"], None)
                return {"stopped": True}
            if action != "cast-poll":
                raise Problem(404, "Unknown mirroring action.")
            session["expires"] = self.clock() + 20
        return {"session_id": session["id"], "answer": session["answer"], "state": session["state"]}

    def player(self, device, data=None):
        session = self.current(device)
        if data is not None:
            if not session or data.get("session_id") != session["id"]:
                raise Problem(409, "The mirroring session has ended.")
            if "sdp" in data:
                session["answer"] = self.description(data, "answer")
            if data.get("state") in ("connecting", "connected", "failed", "disconnected"):
                session["state"] = data["state"]
        return {"session": {"id": session["id"], "offer": session["offer"]} if session else None}
