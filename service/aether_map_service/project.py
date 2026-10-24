"""Aether Map project bundles.

One archive holding everything a show is: the document, the layout a device
runs, every asset it references, and a wireframe of the mapping that opens in
any vector editor. It is a backup, a handover, and the thing you inspect when a
projector does something you did not expect.
"""

from __future__ import annotations

import io
import json
import zipfile

from core.host.state import Problem

#: Anything larger is a mistake rather than a show, and streaming a zip we
#: build in memory has to stop somewhere.
MAX_BUNDLE_BYTES = 1024 * 1024 * 1024


def safe_folder(name: str) -> str:
    """A show name is user text; a folder name inside an archive is not."""
    cleaned = "".join(c if c.isalnum() or c in " -_." else "-" for c in name).strip()
    cleaned = cleaned.removesuffix(".aethermap").strip() or "Aether Map show"
    return cleaned[:80]


def _scene_size(scene: dict, show: dict) -> tuple[int, int]:
    board = scene.get("artboard") or {}
    output = show.get("output") or {}
    return (
        int(board.get("widthPx") or output.get("width") or 1920),
        int(board.get("heightPx") or output.get("height") or 1080),
    )


def wireframe_svg(show: dict, title: str) -> str:
    """The mapping as plain SVG: one polygon per surface, masks dashed.

    Geometry only — the warp itself is a CSS matrix the browser applies, and
    nothing here tries to reproduce it. This is for measuring, printing and
    handing to someone who does not run Aether Map.
    """
    # This export contains every scene, so its canvas must fit every artboard.
    sizes = [_scene_size(scene, show) for scene in show.get("scenes") or []]
    width = max((size[0] for size in sizes), default=_scene_size({}, show)[0])
    height = max((size[1] for size in sizes), default=_scene_size({}, show)[1])

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">',
        f"<title>{escape(title)}</title>",
        f'<rect width="{width}" height="{height}" fill="#000"/>',
    ]

    for scene in show.get("scenes") or []:
        parts.append(f'<g id="{escape(str(scene.get("name", "Scene")))}">')
        for surface in scene.get("surfaces") or []:
            corners = surface.get("corners") or []
            if len(corners) == 4:
                parts.append(
                    f'<polygon points="{points(corners)}" fill="none" '
                    f'stroke="#4c9dff" stroke-width="2">'
                    f"<title>{escape(str(surface.get('name', 'Surface')))}</title>"
                    f"</polygon>"
                )
            mask = surface.get("mask")
            if isinstance(mask, list) and len(mask) >= 3:
                parts.append(
                    f'<polygon points="{points(mask)}" fill="none" '
                    f'stroke="#e7a843" stroke-width="2" stroke-dasharray="8 6"/>'
                )
        parts.append("</g>")

    parts.append("</svg>")
    return "\n".join(parts)


def points(pairs) -> str:
    return " ".join(f"{number(p[0])},{number(p[1])}" for p in pairs if len(p) >= 2)


def number(value) -> str:
    try:
        return f"{float(value):g}"
    except (TypeError, ValueError):
        return "0"


def escape(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def readme(show: dict, name: str, media_names: list[str]) -> str:
    scenes = show.get("scenes") or []
    lines = [
        f"{name}",
        "",
        "An Aether Map project bundle.",
        "",
        "  show.aethermap   the document — open it in Aether Map",
        "  layout.json      the same mapping, as an output device receives it",
        "  wireframe.svg    surface and mask geometry, for any vector editor",
        f"  media/           every asset this show references ({len(media_names)})",
        "",
        f"Output: {(show.get('output') or {}).get('width', 1920)}"
        f"x{(show.get('output') or {}).get('height', 1080)}",
        f"Scenes: {len(scenes)}",
    ]
    for scene in scenes:
        surfaces = scene.get("surfaces") or []
        width, height = _scene_size(scene, show)
        lines.append(
            f"  - {scene.get('name', 'Scene')}: {width}x{height} px, "
            f"{len(surfaces)} surface(s)"
        )
    if media_names:
        lines.append("")
        lines.append("Assets:")
        lines.extend(f"  - {media}" for media in media_names)
    return "\n".join(lines) + "\n"


def build_bundle(document_name: str, content: bytes, media_root) -> bytes:
    """Assemble the archive. Missing assets are reported, never silently
    dropped: a bundle that quietly lacks its media looks fine until show day."""
    try:
        show = json.loads(content)
    except (ValueError, UnicodeDecodeError):
        raise Problem(400, "This show could not be read.") from None
    if not isinstance(show, dict):
        raise Problem(400, "This show could not be read.")

    folder = safe_folder(document_name)
    referenced = [
        str(item.get("file", ""))
        for item in (show.get("media") or [])
        if isinstance(item, dict) and item.get("file")
    ]

    missing: list[str] = []
    buffer = io.BytesIO()
    total = 0
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(f"{folder}/show.aethermap", content)
        archive.writestr(f"{folder}/layout.json", content)
        archive.writestr(f"{folder}/wireframe.svg", wireframe_svg(show, folder))

        for name in referenced:
            source = media_root / name
            if "/" in name or not source.is_file():
                missing.append(name)
                continue
            total += source.stat().st_size
            if total > MAX_BUNDLE_BYTES:
                raise Problem(413, "This project is too large to bundle.")
            archive.write(source, f"{folder}/media/{name}")

        archive.writestr(f"{folder}/README.txt", readme(show, folder, referenced))
        if missing:
            archive.writestr(
                f"{folder}/MISSING-ASSETS.txt",
                "These assets are referenced by the show but were not on the "
                "server:\n\n" + "\n".join(f"  - {name}" for name in missing) + "\n",
            )

    return buffer.getvalue()
