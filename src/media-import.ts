import type { MediaRef } from "./document";

/** Reject unreadable media rather than silently assigning fictitious dimensions. */
export function naturalSize(url: string, kind: MediaRef["kind"]): Promise<{ width: number; height: number; duration?: number }> {
  return new Promise((resolve, reject) => {
    const element = kind === "audio" ? document.createElement("audio") : kind === "video" ? document.createElement("video") : new Image();
    const timer = setTimeout(() => finish(), 15_000);
    const finish = (size?: { width: number; height: number; duration?: number }) => {
      clearTimeout(timer);
      element.onload = null;
      element.onerror = null;
      if (element instanceof HTMLMediaElement) element.onloadedmetadata = null;
      if (size && size.width > 0 && size.height > 0) resolve(size);
      else reject(new Error("This media could not be read. Choose a supported image, video or audio file."));
    };
    if (element instanceof HTMLMediaElement) {
      element.preload = "metadata";
      element.onloadedmetadata = () => finish({ width: element instanceof HTMLVideoElement ? element.videoWidth : 1, height: element instanceof HTMLVideoElement ? element.videoHeight : 1,
        ...(Number.isFinite(element.duration) ? { duration: element.duration } : {}) });
    } else element.onload = () => finish({ width: element.naturalWidth, height: element.naturalHeight });
    element.onerror = () => finish();
    element.src = url;
  });
}
