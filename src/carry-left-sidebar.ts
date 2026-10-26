/** The left sidebar belongs to the window, not the room (Jonathan, 2026-10-26).
 * Each room's WorkspaceShell remembers its own layout under its storage key, so
 * before the next room mounts, copy the left aux panels (and the room's own
 * pinned panel) from the room being left into the next room's saved layout. */
export interface Room { key: string; pinned: string }

type Layout = Record<string, { placement: string; position?: unknown }>;
const read = (key: string): { version: 1; layouts: Record<string, Layout> } | null => {
  try { const saved = JSON.parse(localStorage.getItem(key) ?? 'null'); return saved?.version === 1 && saved.layouts ? saved : null; } catch { return null; }
};

export function carryLeftSidebar(from: Room, to: Room, preset: string, auxIDs: readonly string[]) {
  const was = read(from.key)?.layouts[preset];
  if (!was) return;
  const saved = read(to.key) ?? { version: 1 as const, layouts: {} };
  const next: Layout = { ...saved.layouts[preset] };
  // A panel missing from a saved layout is closed.
  for (const id of auxIDs) next[id] = was[id] ?? { placement: 'hidden' };
  next[to.pinned] = was[from.pinned] ?? { placement: 'hidden' };
  try { localStorage.setItem(to.key, JSON.stringify({ ...saved, layouts: { ...saved.layouts, [preset]: next } })); } catch { /* layout memory is per-device convenience */ }
}
