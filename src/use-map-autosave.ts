import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AutosaveSession, readRecovery, recoveryKey, sessionOwner, type SaveState } from '@aether/session/autosave';
import { fromBase64, hosted, library, type StoredFile } from './api';
import { parseShow, serializeShow } from './show-file';
import type { MapShow } from './document';
import { replaceLocationQuery } from './location-history';

type FileBase = { file: StoredFile | null; name: string };
const textOf = (show: MapShow) => new TextDecoder().decode(serializeShow(show));
const identity = ({ id, name, revision, writable, branch, branch_id, branch_label }: StoredFile): StoredFile => ({ id, name, revision, writable, branch, branch_id, branch_label });
const filename = (name: string) => name.replace(/\.aethermap$/i, '').trim() + '.aethermap';

export function useMapAutosave({ text, reset, paused, setDirty, onError }: {
  text: string; reset: (show: MapShow) => void; paused: boolean;
  setDirty: (dirty: boolean) => void; onError: (message: string) => void;
}) {
  const [ready, setReady] = useState(!hosted);
  const [file, setFile] = useState<StoredFile | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ phase: 'saved', durable: true });
  const controller = useRef<AutosaveSession<FileBase> | null>(null);
  const initial = useRef(text);
  useEffect(() => {
    if (!hosted) return;
    let disposed = false;
    let session: AutosaveSession<FileBase> | null = null;
    const open = async () => {
      try {
        const owner = await sessionOwner();
        if (disposed) return;
        const query = new URLSearchParams(location.search);
        const id = query.get('document');
        const branch = query.get('branch') ?? 'Main';
        if (!id && !query.has('draft')) {
          query.set('draft', crypto.randomUUID());
          replaceLocationQuery(query);
        }
        const draftID = query.get('draft') ?? crypto.randomUUID();
        const keyFor = (base: FileBase) => recoveryKey('map', owner, `${base.file?.id ?? draftID}:${branch}`);
        const key = recoveryKey('map', owner, `${id ?? draftID}:${branch}`);
        const recovery = readRecovery<FileBase>(key) ?? (branch === 'Main' ? readRecovery<FileBase>(recoveryKey('map', owner, id ?? draftID)) : null);
        let stored: StoredFile | null = null;
        let confirmedRead = false;
        let opened = parseShow(initial.current);
        if (id) {
          try { stored = await library.read(id, branch); opened = parseShow(fromBase64(stored.data_base64 ?? '')); confirmedRead = true; }
          catch (error) {
            // A network interruption may still leave a usable authenticated-tab draft.
            if (!recovery || (error as { status?: number }).status) throw error;
            stored = recovery.base.file;
          }
        }
        if (disposed) return;
        const base: FileBase = { file: stored ? identity(stored) : null, name: stored?.name ?? 'Untitled show.aethermap' };
        session = new AutosaveSession({ key, base, text: textOf(opened), keyForBase: keyFor,
          save: async (text, current) => {
            const bytes = new TextEncoder().encode(text);
            const next = current.file
              ? await library.save(current.file.id, current.file.revision, bytes, branch)
              : await library.create(current.name, bytes, query.get('scope') === 'workspace' ? 'workspace' : 'personal', query.get('folder') ?? undefined);
            return { file: identity(next), name: next.name };
          },
        });
        controller.current = session;
        session.subscribe(state => {
          if (disposed) return;
          setSaveState(state); setDirty(session!.dirty);
          const saved = session!.base.file;
          setFile(saved);
          if (saved) {
            const next = new URLSearchParams(location.search); next.set('document', saved.id); next.delete('new'); next.delete('draft');
            replaceLocationQuery(next);
          }
        });
        // Only a fresh authorized read can confirm an interrupted write. Offline
        // recovery metadata is not evidence that the server accepted the draft.
        const confirmed = confirmedRead && recovery?.text === textOf(opened);
        if (recovery && !confirmed && (recovery.blocked || recovery.text !== textOf(opened))) {
          opened = parseShow(recovery.text);
          session.recover(recovery, Boolean(stored && stored.revision !== recovery.base.file?.revision));
        } else if (recovery) { try { sessionStorage.removeItem(key); } catch { /* optional cleanup */ } }
        if (stored && !stored.writable) session.block('This file is read-only. Your edits stay in this tab; use Save a copy to keep them in your library.');
        reset(opened); setFile(stored); setReady(true);
      } catch (error) { if (!disposed) onError((error as Error).message); }
    };
    void open();
    return () => { disposed = true; session?.dispose(); controller.current = null; };
  }, [reset, setDirty, onError]);

  useLayoutEffect(() => {
    if (!ready || !controller.current) return;
    controller.current.pause(paused);
    controller.current.write(text);
  }, [text, paused, ready]);

  const save = async (name?: string, copy = false) => {
    const session = controller.current;
    if (!session) throw new Error('Saving needs the Aether Studio host. Open Aether Map from /map/.');
    if (paused) throw new Error('Finish or cancel the active feature before saving a version.');
    session.pause(false);
    if (copy) {
      try { await session.flush(); } catch { /* A copy is also the explicit conflict recovery path. */ }
      session.copyTo({ file: null, name: filename(name || 'Untitled show copy') });
    }
    else if (!session.base.file && name) session.updateBase({ file: null, name: filename(name) });
    session.write(text, !session.base.file);
    await session.flush();
    // Also drain an edit that arrived during the previous request.
    if (session.dirty) await session.flush();
    if(copy&&session.base.file){session.dispose();location.assign(`${location.pathname}?document=${encodeURIComponent(session.base.file.id)}`);return;}
    if (!copy && name && session.base.file && filename(name) !== session.base.file.name) {
      const renamed = await library.rename(session.base.file.id, session.base.file.revision, filename(name));
      session.updateBase({ file: identity(renamed), name: renamed.name }); setFile(renamed);
    }
  };
  return { ready, file, saveState, save };
}
