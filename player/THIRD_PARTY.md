# Player third-party code

The offline QR encoder in `aether_receiver.py` is Project Nayuki's **QR Code
generator library v1.8.0**, under the MIT License. The full copyright and license
are retained beside the bundled implementation, including in the self-contained
installer. It uses only the Python standard library; QR creation needs no network
service or additional package on the player.

- Upstream: https://github.com/nayuki/QR-Code-generator/blob/v1.8.0/python/qrcodegen.py
- Original file SHA256: `b089855caf16185c61421ea4927c1b213cf9468940d71fa8ab11ef83662dcc84`
- Adaptation: the `from __future__ import annotations` line moves to the enclosing
  module's header. All other upstream bytes are retained and checked by a test.

The encoder is embedded in the existing receiver module to preserve the current
three-module player distribution contract with the native host. Aether's pairing
URL validation and SVG presentation are separate functions above the vendored
section. Keep the section's upstream license when updating or redistributing it.
