/**
 * Save-state machine of the visual editor (pure; unit tested). It tracks edits with a
 * monotonically increasing sequence number so a save that was in flight while the author
 * kept typing never marks the newer text as saved. States map 1:1 to the visible status:
 * `Neuložené změny` / `Ukládání…` / `Koncept uložen` / `Uložení se nezdařilo` / conflict.
 * Nothing here publishes: the machine only models draft saves.
 */

export type SaveKind = 'autosave' | 'save';

export type SaveStatus =
  /** Nothing changed in this editing session. */
  | 'clean'
  /** Local edits not yet on the server. */
  | 'dirty'
  /** A draft save is in flight. */
  | 'saving'
  /** Every local edit is stored as the server draft. */
  | 'saved'
  /** The last save failed (network, permission, validation…); edits stay in memory. */
  | 'failed'
  /** The server has a newer version; autosave is paused until the author decides. */
  | 'conflict'
  /** Local validation blocks saving (e.g. an image without alternative text). */
  | 'invalid';

export type SaveError = { code: string; fieldErrors?: Record<string, string> };

export type SaveMachine = {
  editSeq: number;
  savedSeq: number;
  inFlight: { seq: number; kind: SaveKind } | null;
  status: SaveStatus;
  /** ISO timestamp of the last successful server save in this session. */
  lastSavedAt: string | null;
  error: SaveError | null;
};

export type SaveEvent =
  | { type: 'edit' }
  | { type: 'start'; kind: SaveKind }
  | { type: 'success'; savedAt: string }
  | { type: 'failure'; error: SaveError }
  | { type: 'invalid'; error: SaveError }
  | { type: 'conflict' }
  /** Local state was replaced by the server state (reload latest, restore revision). */
  | { type: 'reset'; savedAt?: string | null };

export const AUTOSAVE_DELAY_MS = 4000;

export function initialSaveMachine(): SaveMachine {
  return { editSeq: 0, savedSeq: 0, inFlight: null, status: 'clean', lastSavedAt: null, error: null };
}

export function isDirty(machine: SaveMachine): boolean {
  return machine.editSeq !== machine.savedSeq;
}

/** Autosave runs only for plain unsaved edits: never during a conflict, a failure retry loop or while saving. */
export function canAutosave(machine: SaveMachine): boolean {
  return isDirty(machine) && machine.inFlight === null && machine.status === 'dirty';
}

export function reduceSave(machine: SaveMachine, event: SaveEvent): SaveMachine {
  switch (event.type) {
    case 'edit': {
      const editSeq = machine.editSeq + 1;
      if (machine.status === 'conflict') return { ...machine, editSeq };
      if (machine.inFlight) return { ...machine, editSeq, status: 'saving' };
      return { ...machine, editSeq, status: 'dirty', error: null };
    }
    case 'start':
      return { ...machine, inFlight: { seq: machine.editSeq, kind: event.kind }, status: 'saving', error: null };
    case 'success': {
      const seq = machine.inFlight?.seq ?? machine.editSeq;
      const savedSeq = Math.max(machine.savedSeq, seq);
      const next = { ...machine, savedSeq, inFlight: null, lastSavedAt: event.savedAt, error: null };
      return { ...next, status: next.editSeq === savedSeq ? 'saved' : 'dirty' };
    }
    case 'failure':
      return { ...machine, inFlight: null, status: 'failed', error: event.error };
    case 'invalid':
      return { ...machine, inFlight: null, status: 'invalid', error: event.error };
    case 'conflict':
      return { ...machine, inFlight: null, status: 'conflict', error: { code: 'conflict' } };
    case 'reset':
      return {
        editSeq: machine.editSeq,
        savedSeq: machine.editSeq,
        inFlight: null,
        status: event.savedAt ? 'saved' : 'clean',
        lastSavedAt: event.savedAt ?? machine.lastSavedAt,
        error: null,
      };
    default:
      return machine;
  }
}

/** Trailing debounce with explicit cancel/flush (used for autosave-like work). */
export function createDebouncer(fn: () => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    flush() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      fn();
    },
    get pending() {
      return timer !== null;
    },
  };
}
