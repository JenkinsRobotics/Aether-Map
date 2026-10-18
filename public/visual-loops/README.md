# Aether Map original video loops

These six visuals are original procedural artwork created for Aether Map. They
contain no third-party imagery, footage, music or copied Lazy Lighting assets.
The owning project may use, modify and distribute them with Aether Map and in
users' exported shows. No external stock-library attribution is required.

Rebuild with `python3 scripts/render-video-loops.py` from the Map repository.
Requires Python, NumPy, Pillow and ffmpeg with libx264. `--only <id>` re-encodes one
loop and refreshes the complete manifest. The generator rejects nonperiodic
formulas. Each clip is eight seconds at 24 fps, 1280 × 720, H.264/yuv420p with no
audio. Posters are rendered from the two-second frame. The manifest pins byte
lengths and SHA-256 digests; encoder versions may change encoded bytes.

Importing copies the bundled video into the ordinary show media path. Layering,
source timing, effects, undo, save/reopen and project export use existing media
semantics; saved shows never depend on a gallery ID or an external video URL.
