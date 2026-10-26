import { useCallback, useState } from "react";

/**
 * Undo for the show document.
 *
 * The document is an immutable value, so history is just a stack of past
 * values — no command objects, no inverse operations to keep in step with the
 * edits.
 *
 * Coalescing matters more than it sounds: a corner drag emits an edit per
 * pointer move, and without merging them one undo would step back a single
 * pixel. Edits carry a key ("corners:s1") and merge with the previous entry
 * when the key matches and they arrive close together.
 */

const COALESCE_WINDOW_MS = 900;
const LIMIT = 100;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  lastKey: string | null;
  lastAt: number;
  /** Checkpoint of an explicit pointer gesture; never persisted. */
  gesture?: History<T>;
}

export function initialHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

export function pushHistory<T>(
  state: History<T>,
  next: T,
  key: string | null,
  now: number,
): History<T> {
  if (next === state.present) return state;

  if (state.gesture) {
    const base = state.gesture;
    return { ...state, present: next, past: [...base.past, base.present].slice(-LIMIT), future: [], lastKey: null, lastAt: 0 };
  }

  const merge =
    key !== null && key === state.lastKey && now - state.lastAt < COALESCE_WINDOW_MS;

  // A merged edit replaces the present without deepening the stack, so one
  // undo takes back the whole gesture.
  const past = merge ? state.past : [...state.past, state.present].slice(-LIMIT);

  return { past, present: next, future: [], lastKey: key, lastAt: now };
}

export function beginHistoryGesture<T>(state: History<T>): History<T> {
  return state.gesture ? state : { ...state, gesture: state };
}

export function endHistoryGesture<T>(state: History<T>, cancel = false): History<T> {
  if (!state.gesture) return state;
  if (cancel) return state.gesture;
  const { gesture: _gesture, ...next } = state;
  return { ...next, lastKey: null, lastAt: 0 };
}

export function undoHistory<T>(state: History<T>): History<T> {
  if (state.past.length === 0) return state;
  const present = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present,
    future: [state.present, ...state.future],
    // Clear the coalesce key so the next edit cannot merge into a restored
    // value and quietly swallow the undo.
    lastKey: null,
    lastAt: 0,
  };
}

export function redoHistory<T>(state: History<T>): History<T> {
  if (state.future.length === 0) return state;
  return {
    past: [...state.past, state.present],
    present: state.future[0],
    future: state.future.slice(1),
    lastKey: null,
    lastAt: 0,
  };
}

export interface DocumentHistory<T> {
  checkpoint: History<T>;
  beginGesture: () => void;
  endGesture: (cancel?: boolean) => void;
  /** Discard a feature's preview history, retaining any other edits as one step. */
  restoreCheckpoint: (checkpoint: History<T>, next: T) => void;
  present: T;
  /** Record an edit. Pass a key to merge a continuous gesture into one step. */
  set: (next: T | ((current: T) => T), key?: string) => void;
  /** Replace the document and drop history — opening a different file. */
  reset: (next: T) => void;
  /** Derived housekeeping (not an edit): changes the present without an undo step. */
  amend: (next: (current: T) => T) => void;
  undo: () => void;
  redo: () => void;
  goTo: (index: number) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useDocumentHistory<T>(initial: T | (() => T)): DocumentHistory<T> {
  const [state, setState] = useState<History<T>>(() =>
    initialHistory(typeof initial === "function" ? (initial as () => T)() : initial),
  );

  const set = useCallback((next: T | ((current: T) => T), key?: string) => {
    setState((current) => {
      const value =
        typeof next === "function" ? (next as (c: T) => T)(current.present) : next;
      return pushHistory(current, value, key ?? null, Date.now());
    });
  }, []);

  const beginGesture = useCallback(() => setState(beginHistoryGesture), []);
  const endGesture = useCallback((cancel = false) => setState((current) => endHistoryGesture(current, cancel)), []);
  const reset = useCallback((next: T) => setState(initialHistory(next)), []);
  const amend = useCallback((next: (current: T) => T) => setState(current => amendHistory(current, next(current.present))), []);
  const undo = useCallback(() => setState(undoHistory), []);
  const redo = useCallback(() => setState(redoHistory), []);
  const restoreCheckpoint = useCallback((checkpoint: History<T>, next: T) => setState(restoreHistoryCheckpoint(checkpoint, next)), []);

  return {
    checkpoint: state,
    goTo: (index) => setState(current => goToHistory(current, index)),
    beginGesture,
    endGesture,
    restoreCheckpoint,
    present: state.present,
    set,
    reset,
    amend,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}

/** Housekeeping the document derives (not an edit): change the present, record nothing. */
export function amendHistory<T>(state: History<T>, next: T): History<T> {
  return { ...state, present: next };
}

export function restoreHistoryCheckpoint<T>(checkpoint: History<T>, next: T): History<T> {
  return next === checkpoint.present ? { ...checkpoint, lastKey: null, lastAt: 0 }
    : pushHistory(checkpoint, next, null, Date.now());
}

/** Move within the existing undo chain without creating a new edit or losing redo. */
export function goToHistory<T>(state: History<T>, index: number): History<T> {
  if (state.gesture || !Number.isInteger(index) || index < 0 || index > state.past.length + state.future.length) return state;
  let next = state;
  while (next.past.length > index) next = undoHistory(next);
  while (next.past.length < index) next = redoHistory(next);
  return next;
}
