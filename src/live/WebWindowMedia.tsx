import { useEffect, useRef, type CSSProperties } from "react";

/** On a player, the site opens in its own browser window over this surface's
 * on-screen rectangle; here it is only a black stand-in. Sites such as
 * streaming services refuse to be embedded, so a window is the only way in.
 * ponytail: one web window per player; the first one reported wins. */
export function WebWindowMedia({ url, style, placeholder }: { url: string; style: CSSProperties; placeholder?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("output") || window.parent === window || !url) return;
    const report = () => {
      const box = ref.current?.getBoundingClientRect();
      if (box) window.parent.postMessage({ aetherWebWindow: { url, x: Math.round(box.x), y: Math.round(box.y),
        width: Math.round(box.width), height: Math.round(box.height) } }, location.origin);
    };
    report();
    // Repeating it moves the window with the surface and reopens a closed one.
    const timer = setInterval(report, 5000);
    return () => { clearInterval(timer); window.parent.postMessage({ aetherWebWindow: null }, location.origin); };
  }, [url]);
  let host = "";
  try { host = url ? new URL(url).hostname : ""; } catch { /* shown as unset */ }
  return <div ref={ref} className="map-camera" style={{ ...style, overflow: "hidden", background: "black" }}>
    {placeholder && <div className="map-source-message">{host ? `Web window · ${host}` : "Web window · add a web address"}</div>}
  </div>;
}
