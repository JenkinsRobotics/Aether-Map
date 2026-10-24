"""Map-owned device pairing state, stored in the platform's transaction database."""
import hmac
import secrets
import time
from core.host.state import Problem

class DeviceStore:
    def __init__(self, store):
        self.store = store
        self.db = store.db
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS map_devices (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT REFERENCES users(id),
                code TEXT NOT NULL, code_expires REAL NOT NULL, seen REAL NOT NULL);
        """)
        device_columns = {
            row[1] for row in self.db.execute("PRAGMA table_info(map_devices)")
        }
        for name, definition in [
            ("token", "TEXT NOT NULL DEFAULT ''"),
            ("pairing_secret_hash", "TEXT NOT NULL DEFAULT ''"),
            ("document", "TEXT"),
            ("deployed", "REAL NOT NULL DEFAULT 0"),
        ]:
            if name not in device_columns:
                self.db.execute(
                    f"ALTER TABLE map_devices ADD COLUMN {name} {definition}"
                )

    def __getattr__(self, name):
        return getattr(self.store, name)

    # --- Aether Map output devices -------------------------------------

    #: Initial registration has no account authentication — a Pi being
    #: imaged has no account yet — so the table is capped. A private bootstrap
    #: secret proves device possession; the pairing code grants user ownership.
    MAP_DEVICE_LIMIT = 64
    MAP_CODE_LIFETIME_SECONDS = 600

    def announce_device(self, data, *, token=""):
        device_id = str(data.get("device_id", ""))[:64]
        if not device_id or not all(c.isalnum() or c in "-_" for c in device_id):
            raise Problem(400, "A device id is required.")
        name = str(data.get("name", ""))[:80].strip() or device_id
        now = time.time()

        row = self.db.execute(
            "SELECT * FROM map_devices WHERE id=?", (device_id,)
        ).fetchone()
        secret = data.get("pairing_secret", "")
        valid_secret = isinstance(secret, str) and 32 <= len(secret) <= 256
        proof = self.token_hash(secret) if valid_secret else ""
        if row is not None:
            # Public IDs are labels, not credentials. Existing installed players
            # already send their bearer token; keep that upgrade path intact.
            token_matches = bool(row["owner"] and row["token"] and token) and hmac.compare_digest(
                row["token"].encode(), token.encode()
            )
            proof_matches = bool(row["pairing_secret_hash"] and proof) and hmac.compare_digest(
                row["pairing_secret_hash"], proof
            )
            if not (token_matches or proof_matches):
                raise Problem(403, "Device proof required. Update the player; "
                              "a public device ID cannot authorize pairing.")
        elif not valid_secret:
            raise Problem(400, "Update the player: registration requires "
                          "a private pairing secret.")

        if row is None:
            registered = self.db.execute(
                "SELECT COUNT(*) FROM map_devices"
            ).fetchone()[0]
            if registered >= self.MAP_DEVICE_LIMIT:
                raise Problem(409, "This host already has the maximum number of devices.")
            code = f"{secrets.randbelow(1000000):06d}"
            with self.db:
                self.db.execute(
                    "INSERT INTO map_devices (id,name,owner,code,code_expires,seen,pairing_secret_hash)"
                    " VALUES (?,?,?,?,?,?,?)",
                    (device_id, name, None, code, now + self.MAP_CODE_LIFETIME_SECONDS, now, proof),
                )
            return {"device_id": device_id, "claimed": False, "code": code}

        if row["owner"]:
            with self.db:
                self.db.execute(
                    "UPDATE map_devices SET name=?,seen=? WHERE id=?", (name, now, device_id)
                )
            owner = self.db.execute(
                "SELECT username FROM users WHERE id=?", (row["owner"],)
            ).fetchone()
            return {
                "device_id": device_id,
                "claimed": True,
                "owner": owner["username"] if owner else "",
                # The daemon stores this and uses it to pull its show. It is
                # handed out only after device possession was verified above.
                "token": row["token"],
            }

        # Unclaimed: rotate an expired code so a projector left running
        # overnight still shows a code that works.
        code = row["code"]
        expires = row["code_expires"]
        if expires <= now:
            code = f"{secrets.randbelow(1000000):06d}"
            expires = now + self.MAP_CODE_LIFETIME_SECONDS
        with self.db:
            self.db.execute(
                "UPDATE map_devices SET name=?,seen=?,code=?,code_expires=? WHERE id=?",
                (name, now, code, expires, device_id),
            )
        return {"device_id": device_id, "claimed": False, "code": code}

    def map_devices(self, uid):
        rows = self.db.execute(
            "SELECT id,name,owner,seen,document FROM map_devices ORDER BY name"
        ).fetchall()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "mine": row["owner"] == uid,
                "claimed": bool(row["owner"]),
                "seen": row["seen"],
                # Only the owner learns which show a device is running.
                "document": row["document"] if row["owner"] == uid else None,
            }
            for row in rows
        ]

    def claim_device(self, uid, code):
        code = str(code).strip()
        row = self.db.execute(
            "SELECT * FROM map_devices WHERE code=? AND owner IS NULL AND code_expires>?",
            (code, time.time()),
        ).fetchone()
        if row is None:
            raise Problem(404, "That pairing code is not valid. Check the projector.")
        with self.db:
            self.db.execute(
                "UPDATE map_devices SET owner=?,token=?,code='' WHERE id=?",
                (uid, "aether_dev_" + secrets.token_urlsafe(24), row["id"]),
            )
        return {"device_id": row["id"], "name": row["name"], "claimed": True}

    def own_device(self, uid, device_id):
        row = self.db.execute(
            "SELECT * FROM map_devices WHERE id=?", (str(device_id),)
        ).fetchone()
        if row is None:
            raise Problem(404, "Device not found.")
        if row["owner"] != uid:
            raise Problem(403, "That device belongs to someone else.")
        return row

    def device_for_token(self, token):
        if not token.startswith("aether_dev_"):
            return None
        return self.db.execute(
            "SELECT * FROM map_devices WHERE token=? AND owner IS NOT NULL", (token,)
        ).fetchone()

    def map_device_action(self, action, user, data):
        uid = user["id"]
        if action == "claim":
            return self.claim_device(uid, data.get("code", ""))
        if action == "list":
            return {"devices": self.map_devices(uid)}
        row = self.own_device(uid, data.get("device_id"))
        if action == "rename":
            name = str(data.get("name", "")).strip()[:80]
            if not name:
                raise Problem(400, "Enter a device name.")
            with self.db:
                self.db.execute(
                    "UPDATE map_devices SET name=? WHERE id=?", (name, row["id"])
                )
            return {"device_id": row["id"], "name": name}
        if action == "assign":
            document = data.get("document") or None
            if document is not None:
                # The same read rule Library.entry applies: your own show, or
                # one shared with the workspace. Existence is not authority —
                # without this a signed-in person could deploy a stranger's
                # private show to their own projector.
                owned = self.db.execute(
                    "SELECT id FROM library WHERE id=? AND app='map' AND trashed=0"
                    " AND (owner=? OR scope='workspace')",
                    (str(document), uid),
                ).fetchone()
                if not owned:
                    raise Problem(404, "That show is not in the library.")
            with self.db:
                self.db.execute(
                    "UPDATE map_devices SET document=?,deployed=? WHERE id=?",
                    (document, time.time(), row["id"]),
                )
            return {"device_id": row["id"], "document": document}
        if action == "forget":
            with self.db:
                self.db.execute("DELETE FROM map_devices WHERE id=?", (row["id"],))
            return {"device_id": row["id"], "forgotten": True}
        raise Problem(404, "Unknown device action.")

