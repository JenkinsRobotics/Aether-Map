import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { BodyLandmark } from './signals';
let detector: PoseLandmarker | undefined;
self.onmessage = async (event: MessageEvent) => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      const vision = await FilesetResolver.forVisionTasks(message.base, true);
      detector = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${message.base}/pose_landmarker_lite.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5,
      });
      self.postMessage({ type: 'ready' });
    } else if (message.type === 'frame') {
      const image = message.image as ImageBitmap;
      try {
        if (!detector) throw Error('Body detector is not ready.');
        const result = detector.detectForVideo(image, message.timeMs);
        const points: BodyLandmark[] = (result.landmarks[0] ?? []).map(p => ({ x:p.x,y:p.y,z:p.z,visibility:p.visibility }));
        self.postMessage({ type:'pose', points, timeMs:message.timeMs });
      } finally { image.close(); }
    }
  } catch (error) { self.postMessage({ type:'error', message:(error as Error).message }); }
};
