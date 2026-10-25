import type { MapWorkspace } from './panels/map-ribbon-layout';

export const WORKSPACE_IDS = ['surfaces', 'timeline', 'audio'] as const;
export type WorkspaceID = typeof WORKSPACE_IDS[number];
export const TRAY_KEY = (mode: MapWorkspace) => `aether-map.${mode}.tray`;
export function readTrayPanels(mode: MapWorkspace): WorkspaceID[] {
  try {
    const stored = localStorage.getItem(`${TRAY_KEY(mode)}.panels`);
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) return WORKSPACE_IDS.filter(id => parsed.includes(id));
    }
    if (localStorage.getItem(`${TRAY_KEY(mode)}.collapsed`) === 'true') return [];
  } catch { /* Layout preferences are optional. */ }
  return mode === 'mapping' ? ['surfaces'] : mode === 'content' ? ['timeline', 'audio'] : ['surfaces', 'timeline', 'audio'];
}
export function trayHeightKind(open: readonly WorkspaceID[]): WorkspaceID {
  return open.includes('timeline') ? 'timeline' : 'surfaces';
}
