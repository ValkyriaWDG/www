/** A registered form's dirty state and optional authorized save callback. */
export type GuardEntry = { dirty: boolean; onSaveRequest?: () => Promise<boolean> };

export function dirtyEntries(entries: Iterable<GuardEntry>): GuardEntry[] {
  return [...entries].filter((entry) => entry.dirty);
}

/** "Save and continue" is offered only when every dirty form can save itself. */
export function canSaveAll(entries: Iterable<GuardEntry>): boolean {
  const dirty = dirtyEntries(entries);
  return dirty.length > 0 && dirty.every((entry) => typeof entry.onSaveRequest === 'function');
}

/**
 * Saves dirty forms one by one and stops at the first failure. Only an explicit `true`
 * counts as success; rejections, `false` or missing savers keep the visitor on the page.
 */
export async function saveDirtyEntries(entries: Iterable<GuardEntry>): Promise<boolean> {
  for (const entry of dirtyEntries(entries)) {
    if (!entry.onSaveRequest) return false;
    try {
      if ((await entry.onSaveRequest()) !== true) return false;
    } catch {
      return false;
    }
  }
  return true;
}
