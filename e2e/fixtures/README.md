# Camera fixture

`right_hands.jpg` is the official MediaPipe Hand Landmarker test image from:
https://storage.googleapis.com/mediapipe-assets/right_hands.jpg

It is referenced by the upstream Apache 2.0 test:
https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/python/test/vision/hand_landmarker_test.py

License: `../../public/vendor/mediapipe/LICENSE`.

The camera E2E test uses local `ffmpeg` to produce a temporary looping Y4M camera
feed from this image, then runs the actual bundled detector and WebRTC transport.
It does not use a person's webcam or mock detector responses. Each worker removes
its own generated Y4M file after the run. Install ffmpeg before running that test.

## Body modulation fixture

`pose.jpg` is the official MediaPipe pose test image:
https://storage.googleapis.com/mediapipe-assets/pose.jpg
SHA-256: `c8a830ed683c0276d713dd5aeda28f415f10cd6291972084a40d0d8b934ed62b`
Upstream Apache2.0 test: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/pose_test.py
Retained license: `../../public/vendor/mediapipe/LICENSE`.

Open `body-modulation.html` through Vite, press Start image stream, then move
left/right or select Empty frame. Its canvas capture feeds the actual production
pose worker and local model; results drive the actual shader/effect renderer.
A second tab with `?output=1` receives the numbers through production live-output
transport. This controlled image test is not physical camera qualification.

`visual-library.html` qualifies the eight new stage generators through the real
`ShaderMedia` WebGL path. Click **Check WebGL and loop integrity** for visible
pixel-change and file-integrity results, then play/seek the six ordinary videos.
It is an isolated fixture, not a substitute for Simple/Advanced gallery import,
layering, undo, save and output acceptance in the actual app. The CGL test under
`scripts/verify-stage-shaders.mjs` is an independent native numerical check and
must never be described as browser qualification.
