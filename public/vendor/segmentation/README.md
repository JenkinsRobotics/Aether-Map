# Local subject masks

- U²-Net small model, by Xuebin Qin and the U²-Net authors:
  https://github.com/xuebinqin/U-2-Net — Apache-2.0 (`U2NET-LICENSE`).
- Unmodified ONNX conversion distributed by rembg:
  https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
  Source/preprocessing reference: https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py
  rembg is MIT (`REMBG-LICENSE`). No rembg Python code ships in this product.
- Model SHA-256: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`.
  Upstream rembg MD5: `8e83ca70e441ab06c318d82300c84806`.
- ONNX Runtime Web is pinned in package.json. Generated WASM/MJS files are
  copied from npm by prepare-vendor.mjs, under its MIT license (`ONNX-LICENSE`).

The model and runtime are served locally with Map. No third-party request or
image upload is made by subject detection. One cancelable, single-threaded worker
per request isolates inference from the UI and other users. The result is a
portable PNG alpha mask; model inference is not required for playback.
This small saliency model estimates foreground, not a guaranteed semantic
selection. Complex backgrounds and fine edges may need manual refinement.
