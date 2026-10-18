/**
 * Pan and zoom for the output raster.
 *
 * The view is an explicit translate+scale applied with `transform-origin: 0 0`,
 * not flex centering of a scaled child: a `transform: scale()` element still
 * occupies its full unscaled box in layout, so centring one that way leaves the
 * raster offset and clipped.
 *
 * Everything here is pure so the arithmetic — which is where zoom-about-cursor
 * goes wrong — can be tested without a browser.
 */

export interface View {
  scale: number;
  /** Translation in container pixels, applied before the scale. */
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 16;
const FIT_PADDING = 48;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Centre the whole raster in the container with a little breathing room. */
export function fitView(container: Size, content: Size, padding = FIT_PADDING): View {
  const usableWidth = Math.max(container.width - padding, 1);
  const usableHeight = Math.max(container.height - padding, 1);
  const scale = clampScale(
    Math.min(usableWidth / Math.max(content.width, 1), usableHeight / Math.max(content.height, 1)),
  );
  return {
    scale,
    x: (container.width - content.width * scale) / 2,
    y: (container.height - content.height * scale) / 2,
  };
}

/** Show the raster at true size, centred. */
export function actualSize(container: Size, content: Size): View {
  return {
    scale: 1,
    x: (container.width - content.width) / 2,
    y: (container.height - content.height) / 2,
  };
}

/**
 * Zoom about a point in container space, so whatever is under the cursor stays
 * under the cursor. Without this, zooming drifts away from what you are
 * aligning — which is the whole job.
 */
export function zoomAt(view: View, factor: number, pointX: number, pointY: number): View {
  const scale = clampScale(view.scale * factor);
  // The clamp may have refused the requested factor; use what we actually got.
  const applied = scale / view.scale;
  return {
    scale,
    x: pointX - (pointX - view.x) * applied,
    y: pointY - (pointY - view.y) * applied,
  };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/** Container point → output-space pixel, for hit testing and placement. */
export function toContent(view: View, pointX: number, pointY: number): [number, number] {
  return [(pointX - view.x) / view.scale, (pointY - view.y) / view.scale];
}

export function cssTransform(view: View): string {
  return `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

/**
 * A wheel event's delta in pixels. Browsers report lines or pages depending on
 * the device, and treating a line as one pixel makes a mouse wheel feel dead.
 */
export function wheelPixels(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * 16; // lines
  if (deltaMode === 2) return deltaY * 400; // pages
  return deltaY;
}

/**
 * Fill the output device with the raster, cropping whatever overflows.
 *
 * The editor letterboxes, so you can see the whole raster. The projector must
 * not: a letterboxed raster lands the beam on the wrong pixels, and a black
 * bar on a wall is still light. When the device matches the raster exactly the
 * scale is 1 and nothing is cropped; otherwise the raster is scaled to cover
 * and centred, and the overflow is what gets cut.
 */
export function coverView(device: Size, content: Size): View {
  const scale = Math.max(
    device.width / Math.max(content.width, 1),
    device.height / Math.max(content.height, 1),
  );
  return {
    scale,
    x: (device.width - content.width * scale) / 2,
    y: (device.height - content.height * scale) / 2,
  };
}

/** How much of the raster a cover fit leaves off the device, per axis, 0–1. */
export function cropFraction(device: Size, content: Size): { x: number; y: number } {
  const view = coverView(device, content);
  const shownWidth = device.width / view.scale;
  const shownHeight = device.height / view.scale;
  return {
    x: Math.max(0, 1 - shownWidth / Math.max(content.width, 1)),
    y: Math.max(0, 1 - shownHeight / Math.max(content.height, 1)),
  };
}
