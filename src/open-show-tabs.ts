/** Only navigation metadata lives here; the host and recovery journal own file contents. */
export interface OpenShowTab { id: string; name: string; branch: string; branchLabel?: string; }
export const showTabLabel = (tab: OpenShowTab) => tab.name.replace(/\.aethermap$/i, '') + (tab.branch !== 'Main' ? ` · ${tab.branchLabel ?? (/^branch-[0-9a-f]{64}$/.test(tab.branch) ? 'Workspace' : tab.branch)}` : '');
export const tabKey = (tab: Pick<OpenShowTab, 'id' | 'branch'>) => JSON.stringify([tab.id, tab.branch]);
const storageKey = (owner: string) => `aether-map.open-files.v1:${owner}`;
export function readShowTabs(owner: string): OpenShowTab[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey(owner)) ?? '[]');
    if (!Array.isArray(value)) return [];
    const tabs = value.filter((tab): tab is OpenShowTab => Boolean(tab && typeof tab.id === 'string' && typeof tab.name === 'string' && typeof tab.branch === 'string' && (tab.branchLabel === undefined || typeof tab.branchLabel === 'string')));
    return tabs.filter((tab, index) => tabs.findIndex(other => tabKey(other) === tabKey(tab)) === index);
  } catch { return []; }
}
export function storeShowTabs(owner: string, tabs: readonly OpenShowTab[]) {
  try { sessionStorage.setItem(storageKey(owner), JSON.stringify(tabs)); } catch { /* Navigation still works without device storage. */ }
}
export function upsertShowTab(tabs: readonly OpenShowTab[], tab: OpenShowTab): OpenShowTab[] {
  return tabs.some(candidate => tabKey(candidate) === tabKey(tab))
    ? tabs.map(candidate => tabKey(candidate) === tabKey(tab) ? tab : candidate) : [...tabs, tab];
}
export function reorderShowTabs(tabs: readonly OpenShowTab[], source: string, target: string): OpenShowTab[] {
  const from = tabs.findIndex(tab => tabKey(tab) === source), to = tabs.findIndex(tab => tabKey(tab) === target);
  if (from < 0 || to < 0 || from === to) return [...tabs];
  const next = [...tabs]; next.splice(to, 0, next.splice(from, 1)[0]); return next;
}
export function showTabURL(tab: OpenShowTab) {
  const query = new URLSearchParams({document:tab.id});
  if (tab.branch !== 'Main') query.set('branch',tab.branch);
  return `/map/index.html?${query}`;
}
