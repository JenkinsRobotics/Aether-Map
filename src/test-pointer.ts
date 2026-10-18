/**
 * jsdom has no PointerEvent, and testing-library then dispatches a bare Event
 * with no button or coordinates. This gives it the real shape so canvas
 * guards like `event.button === 0` are exercised rather than bypassed.
 */
export function installPointerEvents(): void {
  if (typeof globalThis.PointerEvent !== "undefined") return;
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, { bubbles: true, cancelable: true, ...init });
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
}
