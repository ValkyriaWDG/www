import { describe, expect, it } from 'vitest';
import { isLive, publishIntent, scheduleWarning, translationStatus } from './state-labels';

describe('translation state labels', () => {
  it('maps a missing translation explicitly', () => {
    expect(translationStatus(undefined)).toEqual({ key: 'missing', kind: 'neutral', warning: null });
    expect(translationStatus(null).key).toBe('missing');
  });

  it('keeps each composite state distinct', () => {
    expect(translationStatus({ state: 'draft' })).toEqual({ key: 'draft', kind: 'neutral', warning: null });
    expect(translationStatus({ state: 'published' }).kind).toBe('success');
    expect(translationStatus({ state: 'published_with_changes' }).kind).toBe('warning');
    expect(translationStatus({ state: 'scheduled', schedule: { state: 'pending', overdue: false } })).toEqual({ key: 'scheduled', kind: 'info', warning: null });
    // A scheduled update keeps the live article visibly published.
    expect(translationStatus({ state: 'published_update_scheduled', schedule: { state: 'pending', overdue: false } }).key).toBe('published_update_scheduled');
    expect(translationStatus({ state: 'archived', schedule: { state: 'blocked', overdue: true } })).toEqual({ key: 'archived', kind: 'neutral', warning: null });
  });

  it('flags overdue, blocked and failed schedules', () => {
    expect(scheduleWarning(null)).toBeNull();
    expect(scheduleWarning({ state: 'pending', overdue: true })).toBe('overdue');
    expect(scheduleWarning({ state: 'claimed', overdue: false })).toBeNull();
    expect(scheduleWarning({ state: 'blocked', overdue: false })).toBe('blocked');
    expect(scheduleWarning({ state: 'failed', overdue: true })).toBe('failed');
    expect(translationStatus({ state: 'scheduled', schedule: { state: 'blocked', overdue: false } })).toEqual({ key: 'scheduled', kind: 'danger', warning: 'blocked' });
    expect(translationStatus({ state: 'scheduled', schedule: { state: 'pending', overdue: true } })).toEqual({ key: 'scheduled', kind: 'info', warning: 'overdue' });
  });

  it('distinguishes publish from update', () => {
    expect(isLive('draft')).toBe(false);
    expect(isLive('scheduled')).toBe(false);
    expect(isLive('published_update_scheduled')).toBe(true);
    expect(publishIntent('draft')).toBe('publish');
    expect(publishIntent('published_with_changes')).toBe('update');
    expect(publishIntent(undefined)).toBe('publish');
  });
});
