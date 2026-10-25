import { Menu, type MenuItem } from "@aether/ui";
import { useState, type ReactNode } from "react";

/** Right-click on a tree's empty space offers its creation commands (rows
 * keep their own menu). Tree headers then need only a name and "+".
 * `shortcut` runs the selected row's Delete/F2 command, which the shared tree
 * only takes from header controls. */
export function TreeContextArea({ items, onSelect, label, shortcut, children }: {
  items: readonly MenuItem[]; onSelect: (id: string) => void; label: string;
  shortcut?: (key: "Delete" | "F2") => void; children: ReactNode;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return <div className="map-tree-context-area" onKeyDown={event => {
    if (event.defaultPrevented) return;
    const key = event.key === "Backspace" ? "Delete" : event.key;
    if (!shortcut || (key !== "Delete" && key !== "F2") || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!(event.target as Element).matches('[role="treeitem"][aria-selected="true"]')) return;
    event.preventDefault(); shortcut(key);
  }} onContextMenu={event => {
    if ((event.target as Element).closest('input, textarea, [contenteditable], [role="treeitem"], [role="menu"], li') || !items.length) return;
    event.preventDefault(); event.stopPropagation(); setAt({ x: event.clientX, y: event.clientY });
  }}>
    {children}
    {at && <Menu className="aui-collection-popup" open anchor={at} ariaLabel={label} items={items}
      onClose={() => setAt(null)} onSelect={id => { onSelect(id); setAt(null); }} />}
  </div>;
}
