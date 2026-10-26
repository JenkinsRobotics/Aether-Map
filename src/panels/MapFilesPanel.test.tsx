// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DocumentConnection } from '@aether/ui';
import { MapFilesPanel } from './MapFilesPanel';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const connection = { flush: async () => {} } as unknown as DocumentConnection;
// CAD's Files panel: the Comments | Tasks header control, "This show | Drive".
it('switches between this show and Drive with the review-style tabs', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ user: { id: 'u' }, organizations: [{ id: 'o', name: 'Org' }], workspaces: [] }))));
  render(<MapFilesPanel documentID={null} connection={connection}><p>Open shows here</p></MapFilesPanel>);
  const tabs = screen.getByRole('radiogroup', { name: 'Files view' });
  expect(within(tabs).getAllByRole('radio').map(r => r.textContent?.trim())).toEqual(['This show', 'Drive']);
  expect(screen.getByText('Open shows here')).toBeTruthy();
  fireEvent.click(within(tabs).getByRole('radio', { name: /Drive/ }));
  expect(screen.queryByText('Open shows here')).toBeNull();
  expect(await screen.findByRole('region', { name: 'Drive files' })).toBeTruthy();
});
