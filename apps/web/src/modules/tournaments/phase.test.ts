import { describe, expect, it } from 'vitest';
import { tournamentPhase } from './phase';

describe('tournament phase', () => {
  it('derives the phase from inclusive calendar days', () => {
    expect(tournamentPhase(null, null, '2026-09-28')).toBe('undated');
    expect(tournamentPhase(null, '2026-12-01', '2026-09-28')).toBe('undated');
    expect(tournamentPhase('2026-10-01', '2026-12-01', '2026-09-28')).toBe('upcoming');
    expect(tournamentPhase('2026-09-28', '2026-12-01', '2026-09-28')).toBe('ongoing');
    expect(tournamentPhase('2026-09-01', '2026-09-28', '2026-09-28')).toBe('ongoing');
    expect(tournamentPhase('2026-09-01', '2026-09-27', '2026-09-28')).toBe('finished');
    // Without an end day a started tournament stays in progress.
    expect(tournamentPhase('2026-01-01', null, '2026-09-28')).toBe('ongoing');
  });
});
