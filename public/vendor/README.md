# Bundled projection dependencies

Map runs these dependencies locally. Inference does not send camera frames to an
external service; the editor shares an explicitly connected camera with its own
output windows over local WebRTC. Saved recordings contain landmark coordinates,
not the camera video. Live cameras require a secure context (HTTPS or localhost).

## Paper Shaders

`@paper-design/shaders` and `@paper-design/shaders-react`, pinned to **0.0.80**,
provide the 27 procedural effects. Their JavaScript is bundled by Vite. The
unmodified Apache 2.0 licenses and attribution notices are distributed in
`shaders/` and `shaders-react/`.

Powered by [Paper Shaders](https://shaders.paper.design).
Source: https://github.com/paper-design/shaders

## MediaPipe Hand, Face and Pose Landmarkers

`@mediapipe/tasks-vision`, pinned to **1.0.1**, runs in a module worker. The module
WASM runtime comes from that exact npm package. `prepare-vendor.mjs` copies the
matching JavaScript/WASM files before a build or development session.

The landmark models are Google's float16 version **1**, committed rather than fetched:

`mediapipe/hand_landmarker.task`
https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`

`mediapipe/face_landmarker.task`
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`

The build verifies every committed model checksum and downloads nothing. Face
inference runs in the same worker and under the same rule as hands: frames never
leave the machine, and a saved recording holds landmark coordinates, not video.
Runtime and model use Apache 2.0; see `mediapipe/LICENSE`. Upstream source and
model documentation:

- https://github.com/google-ai-edge/mediapipe
- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf

Detection depends on lighting, hand visibility, camera quality and device speed.
Map renders the returned 21 landmarks with its own two-dimensional hand styles;
it does not ship map.club's hand geometry or a textured 3D skin model.

### Body modulation detector

`mediapipe/pose_landmarker_lite.task` is the unmodified float16 version1 pose
bundle (Google MediaPipe, Apache2.0; bundled `mediapipe/LICENSE`).
https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`

The module worker uses the same pinned1.0.1 runtime, CPU inference and one person.
Body capture starts only by operator action. Each frame becomes normalized pose
measurements locally; output windows receive numbers, not body-camera video.
No pose frames or device IDs are stored in the show. Pose detection is limited
by occlusion, framing, lighting and device speed; frame size is not physical depth.

- https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js
- https://github.com/google-ai-edge/mediapipe/issues/6306 (upstream SDK/model licensing clarification)
