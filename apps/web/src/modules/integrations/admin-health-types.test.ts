import { describe, expect, it } from 'vitest';
import { classifyScopeState, scopeFreshness, type AdminLogiScope } from './admin-health-types';

const now = new Date('2026-10-03T12:00:00Z');
const limit = 15 * 60_000;
const scope = (overrides: Partial<AdminLogiScope>): AdminLogiScope => ({
  mode: 'live', hasActiveGeneration: true, lastAttemptAt: '2026-10-03T11:59:00Z', lastSuccessAt: '2026-10-03T11:59:00Z', nextAttemptAt: null, errorCode: null, leaseActive: false, freshness: 'fresh', ...overrides,
});

describe('collector freshness', () => {
  it('measures the last successful pull against the public revalidation limit', () => {
    expect(scopeFreshness(null, now, limit)).toBe('unavailable');
    expect(scopeFreshness('not a date', now, limit)).toBe('unavailable');
    // Strict like the public reads: at exactly the limit the projection is already dropped.
    expect(scopeFreshness(new Date(now.getTime() - limit + 1), now, limit)).toBe('fresh');
    expect(scopeFreshness(new Date(now.getTime() - limit), now, limit)).toBe('stale');
    expect(scopeFreshness(now.toISOString(), now, limit)).toBe('fresh');
  });
});

describe('purpose state', () => {
  it('never reports success without a configured key and a successful pull', () => {
    expect(classifyScopeState(false, scope({}))).toBe('not_configured');
    expect(classifyScopeState(true, null)).toBe('never_ran');
    expect(classifyScopeState(true, scope({ lastAttemptAt: null, lastSuccessAt: null, freshness: 'unavailable' }))).toBe('never_ran');
    expect(classifyScopeState(true, scope({ lastSuccessAt: null, mode: 'bootstrap', freshness: 'unavailable' }))).toBe('bootstrapping');
    expect(classifyScopeState(true, scope({ lastSuccessAt: null, errorCode: 'timeout', freshness: 'unavailable' }))).toBe('unavailable');
  });

  it('lets a persisted error supersede a recent success and ages successes', () => {
    expect(classifyScopeState(true, scope({}))).toBe('healthy');
    expect(classifyScopeState(true, scope({ errorCode: 'unauthorized' }))).toBe('unavailable');
    expect(classifyScopeState(true, scope({ freshness: 'stale' }))).toBe('stale');
    expect(classifyScopeState(true, scope({ leaseActive: true }))).toBe('healthy');
  });
});
