import { describe, expect, it } from 'vitest';
import { genericTournamentLink } from './link-labels';

describe('generic tournament link labels', () => {
  it('recognises generic labels typed in either language', () => {
    expect(genericTournamentLink('Website')).toBe('website');
    expect(genericTournamentLink('  web  soutěže ')).toBe('website');
    expect(genericTournamentLink('Rules')).toBe('rules');
    expect(genericTournamentLink('PRAVIDLA')).toBe('rules');
    expect(genericTournamentLink('Pořadí')).toBe('standings');
    expect(genericTournamentLink('Registrace')).toBe('registration');
  });

  it('keeps specific labels as written', () => {
    for (const label of ['Discord', 'ECL Discord', 'Web soutěže (ukázka)', 'Challonge bracket']) expect(genericTournamentLink(label)).toBeNull();
  });
});
