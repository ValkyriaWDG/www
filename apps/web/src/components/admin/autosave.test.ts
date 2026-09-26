import { afterEach, describe, expect, it, vi } from 'vitest';
import { canAutosave, createDebouncer, initialSaveMachine, isDirty, reduceSave, type SaveEvent, type SaveMachine } from './autosave';

const run = (events: SaveEvent[], start: SaveMachine = initialSaveMachine()) => events.reduce(reduceSave, start);

describe('editor save machine', () => {
  it('starts clean and becomes dirty on edit', () => {
    const machine = run([{ type: 'edit' }]);
    expect(machine.status).toBe('dirty');
    expect(isDirty(machine)).toBe(true);
    expect(canAutosave(machine)).toBe(true);
  });

  it('marks only the edits that were sent as saved', () => {
    // Edit → autosave starts → author keeps typing → autosave succeeds.
    const machine = run([{ type: 'edit' }, { type: 'start', kind: 'autosave' }, { type: 'edit' }, { type: 'success', savedAt: '2026-09-26T10:00:00.000Z' }]);
    expect(machine.status).toBe('dirty');
    expect(isDirty(machine)).toBe(true);
    expect(machine.lastSavedAt).toBe('2026-09-26T10:00:00.000Z');
    expect(canAutosave(machine)).toBe(true);
  });

  it('reports saved when nothing changed during the save', () => {
    const machine = run([{ type: 'edit' }, { type: 'start', kind: 'save' }, { type: 'success', savedAt: 'x' }]);
    expect(machine.status).toBe('saved');
    expect(isDirty(machine)).toBe(false);
    expect(canAutosave(machine)).toBe(false);
  });

  it('does not autosave while a save is in flight', () => {
    const machine = run([{ type: 'edit' }, { type: 'start', kind: 'autosave' }, { type: 'edit' }]);
    expect(machine.status).toBe('saving');
    expect(canAutosave(machine)).toBe(false);
  });

  it('keeps the edits dirty after a failure and stops the autosave loop until the next edit', () => {
    const failed = run([{ type: 'edit' }, { type: 'start', kind: 'autosave' }, { type: 'failure', error: { code: 'unavailable' } }]);
    expect(failed.status).toBe('failed');
    expect(failed.error).toEqual({ code: 'unavailable' });
    expect(isDirty(failed)).toBe(true);
    expect(canAutosave(failed)).toBe(false);
    const retried = reduceSave(failed, { type: 'edit' });
    expect(retried.status).toBe('dirty');
    expect(retried.error).toBeNull();
    expect(canAutosave(retried)).toBe(true);
  });

  it('pauses autosave on a conflict even when the author keeps typing', () => {
    const conflict = run([{ type: 'edit' }, { type: 'start', kind: 'autosave' }, { type: 'conflict' }, { type: 'edit' }]);
    expect(conflict.status).toBe('conflict');
    expect(isDirty(conflict)).toBe(true);
    expect(canAutosave(conflict)).toBe(false);
    // Only an explicit save (overwrite after review) leaves the conflict.
    const overwritten = run([{ type: 'start', kind: 'save' }, { type: 'success', savedAt: 'y' }], conflict);
    expect(overwritten.status).toBe('saved');
  });

  it('blocks autosave while local validation fails', () => {
    const invalid = run([{ type: 'edit' }, { type: 'invalid', error: { code: 'validation', fieldErrors: { body: 'invalid' } } }]);
    expect(invalid.status).toBe('invalid');
    expect(canAutosave(invalid)).toBe(false);
    expect(reduceSave(invalid, { type: 'edit' }).status).toBe('dirty');
  });

  it('resets to the server state after reloading or restoring', () => {
    const reset = run([{ type: 'edit' }, { type: 'edit' }, { type: 'conflict' }, { type: 'reset', savedAt: 'z' }]);
    expect(reset.status).toBe('saved');
    expect(isDirty(reset)).toBe(false);
    expect(reset.error).toBeNull();
    expect(run([{ type: 'reset' }]).status).toBe('clean');
  });
});

describe('createDebouncer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once after the idle delay and restarts on every schedule', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debouncer = createDebouncer(fn, 4000);
    debouncer.schedule();
    vi.advanceTimersByTime(3000);
    debouncer.schedule();
    vi.advanceTimersByTime(3000);
    expect(fn).not.toHaveBeenCalled();
    expect(debouncer.pending).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(debouncer.pending).toBe(false);
  });

  it('can be cancelled or flushed', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debouncer = createDebouncer(fn, 4000);
    debouncer.schedule();
    debouncer.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    debouncer.schedule();
    debouncer.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    debouncer.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
