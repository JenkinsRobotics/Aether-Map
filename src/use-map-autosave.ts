import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AutosaveSession, readRecovery, recoveryKey, sessionOwner, SaveError, type SaveState } from '@aether/session/autosave';
import { listRecoveryBackups, removeRecoveryBackup, type RecoveryBackup } from '@aether/session/autosave-recovery';
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
  const [backups, setBackups] = useState<RecoveryBackup<FileBase>[]>([]);
  const [openingAuth, setOpeningAuth] = useState(false);
  const checkRef = useRef<() => Promise<void>>(async () => {});
  const recoverRef = useRef<(id: string) => Promise<void>>(async () => {});
  const recoveryChoice = useRef(0);
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const initial = useRef(text);
  useEffect(() => {
    if (!hosted) return;
    let disposed = false;
    let session: AutosaveSession<FileBase> | null = null;
    let cleanup = () => {};
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
        const storedText = stored?.data_base64 ? new TextDecoder().decode(fromBase64(stored.data_base64)) : null;
        const matchesStored = (value: string) => value === storedText || value === textOf(opened);
        const base: FileBase = { file: stored ? identity(stored) : null, name: stored?.name ?? 'Untitled show.aethermap' };
        const adopted: RecoveryBackup<FileBase>[] = [];
        const candidates = confirmedRead ? listRecoveryBackups<FileBase>(key).filter(backup => {
          if (matchesStored(backup.record.text)) { removeRecoveryBackup(key, backup.id, backup); return false; }
          return backup.record.base?.file?.id === stored?.id;
        }) : [];
        session = new AutosaveSession({ key, base, text: textOf(opened), keyForBase: keyFor,
          persistentRecovery: true,
          save: async (text, current) => {
            if (await sessionOwner() !== owner) throw new SaveError('Sign in with the account that opened this show to save your changes.', 401);
            const bytes = new TextEncoder().encode(text);
            const next = current.file
              ? await library.save(current.file.id, current.file.revision, bytes, branch)
              : await library.create(current.name, bytes, query.get('scope') === 'workspace' ? 'workspace' : 'personal', query.get('folder') ?? undefined);
            return { file: identity(next), name: next.name };
          },
        });
        controller.current = session;
        let announcedRevision = stored?.revision;
        const signalKey = `aether.saved.v1:${key}`;
        session.subscribe(state => {
          if (disposed) return;
          setSaveState(state); setDirty(session!.dirty);
          const saved = session!.base.file;
          setFile(saved);
          if (saved) {
            const next = new URLSearchParams(location.search); next.set('document', saved.id); next.delete('new'); next.delete('draft');
            replaceLocationQuery(next);
            if (state.phase === 'saved') {
              adopted.splice(0).forEach(backup => removeRecoveryBackup(backup.key, backup.id, backup));
              if (saved.revision !== announcedRevision) {
                announcedRevision = saved.revision;
                try { localStorage.setItem(signalKey, String(saved.revision)); } catch { /* Focus also checks the server. */ }
              }
            }
          }
        });
        const freshRead = async () => {
          if (await sessionOwner() !== owner) throw new SaveError('Sign in with the account that opened this show to save your changes.', 401);
          const current = session!.base.file;
          if (!current) return null;
          const remote = await library.read(current.id, branch);
          if (!remote.writable) throw new SaveError('This show is read-only. Download your unsaved copy to keep your changes.', 403);
          const bytes = fromBase64(remote.data_base64 ?? '');
          return { remote, opened: parseShow(bytes), text: new TextDecoder().decode(bytes) };
        };
        let checking = false;
        const check = async () => {
          if (disposed || checking || pausedRef.current || session!.saving) return;
          checking = true;
          const before = session!.base;
          try {
            const next = await freshRead();
            if (disposed || !next || pausedRef.current || session!.saving || session!.base !== before) return;
            const clean = !session!.dirty;
            const changed = next.remote.revision !== before.file?.revision && session!.text !== textOf(next.opened);
            // Compare the actual accepted bytes before parsing inserts defaults
            // or reorders fields; that is proof of a lost acknowledgement.
            const confirmedText = next.text === session!.text ? session!.text : textOf(next.opened);
            const accepted = session!.reconcile({ file: identity(next.remote), name: next.remote.name }, confirmedText, next.remote.revision === before.file?.revision);
            if (accepted && clean && changed) reset(next.opened);
          } catch (error) {
            if (!disposed && (error as SaveError).status === 401) session!.block((error as Error).message, 401);
            else if (!disposed && (error as SaveError).status === 403) session!.block((error as Error).message, 403);
          } finally { checking = false; }
        };
        checkRef.current = check;
        recoverRef.current = async id => {
          const backup = candidates.find(item => item.id === id);
          if (!backup || session!.saving || disposed) return;
          const choice = ++recoveryChoice.current, beforeText = session!.text;
          const next = await freshRead();
          if (!next || disposed || recoveryChoice.current !== choice) return;
          if (pausedRef.current || session!.saving || session!.text !== beforeText) throw new Error('The show changed while checking recovery. Your backup is retained; choose it again when editing is finished.');
          const draft = parseShow(backup.record.text);
          adopted.push(backup);
          session!.recover(backup.record, next.remote.revision !== backup.record.base.file?.revision);
          session!.reconcile({ file: identity(next.remote), name: next.remote.name }, next.text === session!.text ? session!.text : textOf(next.opened), next.remote.revision === backup.record.base.file?.revision);
          reset(draft); setBackups([]);
        };
        const focus = () => { if (document.visibilityState !== 'hidden') void check(); };
        const changed = (event: StorageEvent) => { if (event.key === signalKey) void check(); };
        window.addEventListener('focus', focus); window.addEventListener('online', focus);
        document.addEventListener('visibilitychange', focus); window.addEventListener('storage', changed);
        cleanup = () => { window.removeEventListener('focus', focus); window.removeEventListener('online', focus); document.removeEventListener('visibilitychange', focus); window.removeEventListener('storage', changed); };
        // Only a fresh authorized read can confirm an interrupted write. Offline
        // recovery metadata is not evidence that the server accepted the draft.
        const confirmed = confirmedRead && !!recovery && matchesStored(recovery.text);
        if (recovery && !confirmed && (recovery.blocked || recovery.text !== textOf(opened))) {
          adopted.push(...candidates.filter(backup => backup.record.text === recovery.text));
          opened = parseShow(recovery.text);
          session.recover(recovery, Boolean(stored && stored.revision !== recovery.base.file?.revision));
          // A fresh authorized read allows an expired sign-in to resume, but
          // never advances a divergent draft to another tab's newer revision.
          if (confirmedRead && stored?.writable) session.reconcile(base, storedText === session.text ? session.text : textOf(parseShow(fromBase64(stored.data_base64 ?? ''))), stored.revision === recovery.base.file?.revision);
        } else if (recovery) { try { sessionStorage.removeItem(key); } catch { /* optional cleanup */ } }
        else if (candidates.length) setBackups(candidates);
        if (stored && !stored.writable) session.block('This file is read-only. Your edits stay in this tab; use Save a copy to keep them in your library.');
        reset(opened); setFile(stored); setReady(true);
      } catch (error) { if (!disposed) { setOpeningAuth((error as SaveError).status === 401); onError((error as Error).message); } }
    };
    void open();
    return () => { disposed = true; cleanup(); session?.dispose(); controller.current = null; };
  }, [reset, setDirty, onError]);

  useLayoutEffect(() => {
    if (!ready || !controller.current) return;
    if (backups.length) { controller.current.pause(true); return; }
    controller.current.pause(paused);
    controller.current.write(text);
  }, [text, paused, ready, backups.length]);

  const save = async (name?: string, copy = false) => {
    const session = controller.current;
    if (!session) throw new Error('Saving needs the Aether Studio host. Open Aether Map from /map/.');
    if (backups.length) throw new Error('Choose whether to recover your unsaved changes before saving.');
    if (paused) throw new Error('Finish or cancel the active feature before saving a version.');
    session.pause(false);
    if (copy) {
      try { await session.flush(); } catch { /* A copy is also the explicit conflict recovery path. */ }
      session.copyTo({ file: null, name: filename(name || 'Untitled show copy') });
    }
    else if (!session.base.file && name) session.updateBase({ file: null, name: filename(name) });
    session.write(copy ? session.text : text, !session.base.file);
    await session.flush();
    // Also drain an edit that arrived during the previous request.
    if (session.dirty) await session.flush();
    if(copy&&session.base.file){session.dispose();location.assign(`${location.pathname}?document=${encodeURIComponent(session.base.file.id)}`);return;}
    if (!copy && name && session.base.file && filename(name) !== session.base.file.name) {
      const renamed = await library.rename(session.base.file.id, session.base.file.revision, filename(name));
      session.updateBase({ file: identity(renamed), name: renamed.name }); setFile(renamed);
    }
  };
  const recover = async (id: string) => { try { await recoverRef.current(id); onError(''); } catch (error) { onError((error as Error).message); } };
  const retry = async () => { await checkRef.current(); try { if (controller.current?.dirty) await controller.current.flush(); if (controller.current?.state.phase === 'saved') onError(''); } catch (error) { onError((error as Error).message); } };
  const signIn = () => window.open(`/?next=${encodeURIComponent(location.pathname + location.search)}`, '_blank', 'noopener');
  const download = () => {
    const draft = controller.current?.text ?? text;
    const url = URL.createObjectURL(new Blob([draft], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${(file?.name ?? 'Show').replace(/\.aethermap$/i, '')} recovery.aethermap`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return { ready, file, saveState, save, retry, signIn, download, openingAuth,
    recoveries: backups.map(b => ({ id: b.id, updated: b.updated, revision: b.record.base.file?.revision })), recover,
    keepSaved: () => { recoveryChoice.current++; setBackups([]); } };
}
