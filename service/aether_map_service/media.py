import json
from core.host.state import Problem

#: Aether Map media. Show documents are JSON in the library; the pixels are not
#: — /api/library/ caps bodies at 9 MB and requires JSON, and a projection show
#: is video. These stream to disk instead, addressed by "<id>.<ext>".
MEDIA_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif",
    ".mp4", ".webm", ".mov", ".m4v",
}
MEDIA_MAX_BYTES = 512 * 1024 * 1024

#: Device announcements allowed per address per throttle window. A device
#: announces every 15s, so this is roughly four devices sharing one address.
ANNOUNCE_LIMIT = 240
MEDIA_CHUNK = 1024 * 1024


def safe_folder_header(name):
    """A filename for Content-Disposition: ASCII, no quotes, no newlines."""
    from .project import safe_folder

    cleaned = safe_folder(name).encode("ascii", "ignore").decode()
    return cleaned.replace('"', "") or "aether-map-project"


def media_in_use(host, name):
    """Is this media referenced by any saved show?

    Show documents are small JSON blobs and a local install has few of them, so
    a scan is honest and exact. If that ever stops being true, store the
    references rather than making this cleverer.
    """
    needle = json.dumps(name).encode()  # quoted: a whole JSON string, not a substring
    for row in host.store.db.execute(
        "SELECT content FROM library WHERE app='map' AND kind='file' AND trashed=0"
    ):
        if row["content"] and needle in row["content"]:
            return True
    return False


def media_target(directory, name):
    """Resolve "<id>.<ext>" inside the media store, rejecting anything else."""
    stem, _, extension = name.rpartition(".")
    extension = "." + extension.lower()
    if (
        not stem
        or len(stem) > 64
        or not all(c.isalnum() or c in "-_" for c in stem)
        or extension not in MEDIA_EXTENSIONS
    ):
        raise Problem(400, "Unsupported media name or format.")
    store = directory / "map-media"
    store.mkdir(exist_ok=True, mode=0o700)
    return store / (stem + extension)


