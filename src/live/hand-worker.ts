import { FaceLandmarker, FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { FaceSample, HandSample } from "../features/types";
let detector: HandLandmarker | undefined;
let faces: FaceLandmarker | undefined;
self.onmessage = async (event: MessageEvent) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      const vision = await FilesetResolver.forVisionTasks(message.base, true);
      // Only the model actually being watched is loaded: each is several
      // megabytes and a laptop driving a projector has better uses for them.
      if (message.subject === "face") {
        faces = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${message.base}/face_landmarker.task`, delegate: "CPU" }, runningMode: "VIDEO", numFaces: 2,
        });
      } else {
        detector = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${message.base}/hand_landmarker.task`, delegate: "CPU" }, runningMode: "VIDEO", numHands: 2,
        });
      }
      self.postMessage({ type: "ready" });
    } else if (message.type === "frame" && faces) {
      const image = message.image as ImageBitmap;
      try {
        const result = faces.detectForVideo(image, message.timeMs);
        const found: FaceSample[] = result.faceLandmarks.map((points) => ({
          points: points.map((p) => [p.x, p.y, p.z] as [number, number, number]),
        }));
        self.postMessage({ type: "faces", faces: found });
      } finally { image.close(); }
    } else if (message.type === "frame" && detector) {
      const image = message.image as ImageBitmap;
      try {
        const result = detector.detectForVideo(image, message.timeMs);
        const hands: HandSample[] = result.landmarks.map((points, i) => ({
          side: result.handedness[i]?.[0]?.categoryName === "Left" ? "Left" : "Right",
          points: points.map((p) => [p.x, p.y, p.z]),
        }));
        self.postMessage({ type: "hands", hands });
      } finally { image.close(); }
    }
  } catch (error) { self.postMessage({ type: "error", message: (error as Error).message }); }
};
