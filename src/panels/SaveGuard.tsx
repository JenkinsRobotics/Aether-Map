import { Button, Dialog } from '@aether/ui';
import type { SaveState } from '@aether/session/autosave';
import './SaveGuard.css';

export function SaveGuard({ state, recoveries, onRecover, onKeepSaved, onSignIn, onRetry, onCopy, onDownload }: {
  state: SaveState;
  recoveries: { id: string; updated: number; revision?: number }[];
  onRecover: (id: string) => void; onKeepSaved: () => void;
  onSignIn: () => void; onRetry: () => void; onCopy: () => void; onDownload: () => void;
}) {
  if (recoveries.length) return <Dialog open title="Unsaved changes found" onClose={onKeepSaved}>
    <p>Unsaved changes from another tab were found on this browser. The saved show is open; choose a draft to recover.</p>
    {recoveries.map(draft => <div className="map-save-guard-actions" key={draft.id}>
      <span>{new Date(draft.updated).toLocaleString()} · based on revision {draft.revision ?? 'new show'}</span>
      <Button onClick={() => onRecover(draft.id)}>Recover changes</Button>
    </div>)}
    <Button onClick={onKeepSaved}>Keep saved version</Button>
  </Dialog>;
  const problem = state.phase === 'conflict' || state.phase === 'offline' || (state.phase !== 'saved' && state.backedUp === false);
  if (!problem) return null;
  const signIn = state.status === 401;
  const message = signIn ? 'Your sign-in expired. Changes have not been saved to Studio.'
    : state.status === 409 ? 'Another tab saved a newer version. This tab cannot overwrite it.'
    : state.message ?? 'Your latest changes do not have a recovery backup. Keep this tab open until saving finishes.';
  return <section className="map-save-guard" aria-label="Save needs attention">
    <p role="alert">{message} {state.backedUp ? 'A recovery copy is kept on this browser.' : 'Keep this tab open or download your changes.'}</p>
    <div className="map-save-guard-actions">
      {signIn && <Button primary onClick={onSignIn}>Sign in to save</Button>}
      <Button onClick={onRetry}>Check and retry save</Button>
      {!signIn && <Button onClick={onCopy}>Save a copy</Button>}
      <Button onClick={onDownload}>Download unsaved copy</Button>
    </div>
  </section>;
}
