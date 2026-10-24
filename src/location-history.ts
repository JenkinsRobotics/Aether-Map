/**
 * Keep a workspace URL aligned with its current document/session identity.
 *
 * Autosave publishes state for every edit. Safari rate-limits History API
 * writes, including writes that replace the current URL with itself, so the
 * equality guard belongs at the boundary shared by every caller.
 */
export function replaceLocationQuery(query: URLSearchParams): boolean {
  const search = query.toString();
  const current = location.search.startsWith("?") ? location.search.slice(1) : location.search;
  if (current === search) return false;

  const suffix = search ? `?${search}` : "";
  history.replaceState(history.state, "", `${location.pathname}${suffix}${location.hash}`);
  return true;
}
