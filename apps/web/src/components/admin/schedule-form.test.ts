import { describe, expect, it } from 'vitest';
import { defaultScheduleValues, localParts, offsetLabel, resolveScheduleForm } from './schedule-form';

const NOW = new Date('2026-09-26T10:00:00.000Z');

describe('schedule form conversion', () => {
  it('sends a local wall-clock time with its explicit zone', () => {
    const result = resolveScheduleForm({ date: '2026-10-03', time: '19:00', timeZone: 'Europe/Prague', occurrence: 'earlier' }, NOW);
    expect(result).toMatchObject({ ok: true, ambiguous: false, dueAt: { localDateTime: '2026-10-03T19:00', timeZone: 'Europe/Prague' } });
    if (result.ok) expect(result.instant.toISOString()).toBe('2026-10-03T17:00:00.000Z');
  });

  it('respects a different explicit zone', () => {
    const result = resolveScheduleForm({ date: '2026-12-01', time: '09:30', timeZone: 'Europe/London', occurrence: 'earlier' }, NOW);
    expect(result.ok && result.instant.toISOString()).toBe('2026-12-01T09:30:00.000Z');
  });

  it('exposes both candidates of an ambiguous autumn time and honours the choice', () => {
    const earlier = resolveScheduleForm({ date: '2026-10-25', time: '02:30', timeZone: 'Europe/Prague', occurrence: 'earlier' }, NOW);
    expect(earlier.ok && earlier.ambiguous).toBe(true);
    if (!earlier.ok) throw new Error('expected ok');
    expect(earlier.candidates.map((candidate) => candidate.toISOString())).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']);
    expect(earlier.instant.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(earlier.dueAt).toEqual({ localDateTime: '2026-10-25T02:30', timeZone: 'Europe/Prague' });

    const later = resolveScheduleForm({ date: '2026-10-25', time: '02:30', timeZone: 'Europe/Prague', occurrence: 'later' }, NOW);
    if (!later.ok) throw new Error('expected ok');
    expect(later.instant.toISOString()).toBe('2026-10-25T01:30:00.000Z');
    expect(later.dueAt).toBe('2026-10-25T01:30:00.000Z');
  });

  it('rejects a spring-forward gap, the past and incomplete input', () => {
    expect(resolveScheduleForm({ date: '2027-03-28', time: '02:30', timeZone: 'Europe/Prague', occurrence: 'earlier' }, NOW)).toEqual({ ok: false, error: 'nonexistent' });
    expect(resolveScheduleForm({ date: '2026-09-26', time: '11:00', timeZone: 'Europe/Prague', occurrence: 'earlier' }, NOW)).toEqual({ ok: false, error: 'past' });
    expect(resolveScheduleForm({ date: '', time: '11:00', timeZone: 'Europe/Prague', occurrence: 'earlier' }, NOW)).toEqual({ ok: false, error: 'required' });
    expect(resolveScheduleForm({ date: '2026-13-40', time: '11:00', timeZone: 'Europe/Prague', occurrence: 'earlier' }, NOW)).toEqual({ ok: false, error: 'invalid' });
    expect(resolveScheduleForm({ date: '2026-10-03', time: '11:00', timeZone: 'Mars/Olympus', occurrence: 'earlier' }, NOW)).toEqual({ ok: false, error: 'invalid_time_zone' });
  });

  it('proposes tomorrow 09:00 in the zone and formats offsets', () => {
    expect(defaultScheduleValues(NOW)).toEqual({ date: '2026-09-27', time: '09:00', timeZone: 'Europe/Prague', occurrence: 'earlier' });
    expect(localParts(new Date('2026-10-03T17:00:00.000Z'), 'Europe/Prague')).toEqual({ date: '2026-10-03', time: '19:00' });
    expect(offsetLabel(new Date('2026-10-03T17:00:00.000Z'), 'Europe/Prague')).toBe('GMT+2');
    expect(offsetLabel(new Date('2026-12-03T17:00:00.000Z'), 'Europe/Prague')).toBe('GMT+1');
  });
});
