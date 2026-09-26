import { describe, expect, it, vi } from 'vitest';
import { canSaveAll, dirtyEntries, saveDirtyEntries } from './unsaved-changes-logic';

describe('unsaved-changes guard logic', () => {
  it('only considers dirty forms', () => {
    expect(dirtyEntries([{ dirty: false }, { dirty: true }])).toHaveLength(1);
    expect(canSaveAll([{ dirty: false }])).toBe(false);
  });

  it('offers save only when every dirty form can save', () => {
    const save = async () => true;
    expect(canSaveAll([{ dirty: true, onSaveRequest: save }, { dirty: false }])).toBe(true);
    expect(canSaveAll([{ dirty: true, onSaveRequest: save }, { dirty: true }])).toBe(false);
  });

  it('continues only after every save explicitly succeeds', async () => {
    const first = vi.fn(async () => true);
    const second = vi.fn(async () => true);
    await expect(saveDirtyEntries([{ dirty: true, onSaveRequest: first }, { dirty: true, onSaveRequest: second }])).resolves.toBe(true);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('stops at the first failed, rejected or missing save', async () => {
    const later = vi.fn(async () => true);
    await expect(saveDirtyEntries([{ dirty: true, onSaveRequest: async () => false }, { dirty: true, onSaveRequest: later }])).resolves.toBe(false);
    expect(later).not.toHaveBeenCalled();
    await expect(saveDirtyEntries([{ dirty: true, onSaveRequest: async () => Promise.reject(new Error('network')) }])).resolves.toBe(false);
    await expect(saveDirtyEntries([{ dirty: true }])).resolves.toBe(false);
  });

  it('skips clean forms entirely', async () => {
    const save = vi.fn(async () => true);
    await expect(saveDirtyEntries([{ dirty: false, onSaveRequest: save }])).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
});
