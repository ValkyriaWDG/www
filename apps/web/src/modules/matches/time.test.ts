import { describe, expect, it } from 'vitest';
import { instantsForLocal, isValidTimeZone, parseLocalDateTime, zonedDate, zonedLocalDateTime, zonedLocalToInstant, ZonedTimeError } from './time';

describe('zoned local time conversion', () => {
  it('converts winter and summer Prague wall-clock times to the right UTC instants', () => {
    expect(zonedLocalToInstant('2026-01-15T19:00', 'Europe/Prague').toISOString()).toBe('2026-01-15T18:00:00.000Z');
    expect(zonedLocalToInstant('2026-07-15T19:00', 'Europe/Prague').toISOString()).toBe('2026-07-15T17:00:00.000Z');
  });

  it('rejects a local time inside the spring-forward gap (2026-03-29 02:30 Europe/Prague)', () => {
    expect(() => zonedLocalToInstant('2026-03-29T02:30', 'Europe/Prague')).toThrowError(ZonedTimeError);
    try {
      zonedLocalToInstant('2026-03-29T02:30', 'Europe/Prague');
    } catch (error) {
      expect((error as ZonedTimeError).code).toBe('nonexistent_local_time');
    }
    // The minutes around the gap exist.
    expect(zonedLocalToInstant('2026-03-29T01:59', 'Europe/Prague').toISOString()).toBe('2026-03-29T00:59:00.000Z');
    expect(zonedLocalToInstant('2026-03-29T03:00', 'Europe/Prague').toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  it('resolves the October overlap to the earlier instant by default and the later on request', () => {
    const local = parseLocalDateTime('2026-10-25T02:30');
    expect(instantsForLocal(local, 'Europe/Prague').map((d) => d.toISOString())).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']);
    expect(zonedLocalToInstant('2026-10-25T02:30', 'Europe/Prague').toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(zonedLocalToInstant('2026-10-25T02:30', 'Europe/Prague', 'later').toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });

  it('rejects impossible calendar values and unknown zones', () => {
    for (const value of ['2026-02-30T10:00', '2026-13-01T10:00', '2026-01-01T24:00', '2026-01-01 10:00', 'tomorrow']) {
      expect(() => zonedLocalToInstant(value, 'Europe/Prague')).toThrowError(ZonedTimeError);
    }
    expect(isValidTimeZone('Europe/Prague')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(() => zonedLocalToInstant('2026-01-01T10:00', 'Mars/Olympus')).toThrowError(ZonedTimeError);
  });

  it('formats an instant as its local calendar date and wall-clock time', () => {
    const instant = new Date('2026-12-31T23:30:00Z');
    expect(zonedDate(instant, 'Europe/Prague')).toBe('2027-01-01');
    expect(zonedDate(instant, 'UTC')).toBe('2026-12-31');
    expect(zonedLocalDateTime(instant, 'Europe/Prague')).toBe('2027-01-01T00:30');
  });
});
