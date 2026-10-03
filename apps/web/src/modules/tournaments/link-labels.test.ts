import { describe, expect, it } from 'vitest';
import { genericTournamentLink } from './link-labels';

describe('generic tournament link labels', () => {
  it('recognises generic labels typed in either language', () => {
    expect(genericTournamentLink('Website')).toEqual({ kind: 'website', note: null });
    expect(genericTournamentLink('Competition website')).toEqual({ kind: 'website', note: null });
    expect(genericTournamentLink('  web  soutěže ')).toEqual({ kind: 'website', note: null });
    expect(genericTournamentLink('Rules')).toEqual({ kind: 'rules', note: null });
    expect(genericTournamentLink('PRAVIDLA')).toEqual({ kind: 'rules', note: null });
    expect(genericTournamentLink('Pořadí')).toEqual({ kind: 'standings', note: null });
    expect(genericTournamentLink('Registrace')).toEqual({ kind: 'registration', note: null });
  });

  it('keeps a trailing note in parentheses beside the localized generic label', () => {
    expect(genericTournamentLink('Web soutěže (ukázka)')).toEqual({ kind: 'website', note: '(ukázka)' });
    expect(genericTournamentLink('COMPETITION WEBSITE  (sample)')).toEqual({ kind: 'website', note: '(sample)' });
    expect(genericTournamentLink('Pravidla (PDF)')).toEqual({ kind: 'rules', note: '(PDF)' });
  });

  it('keeps specific labels as written, with or without a note', () => {
    for (const label of ['Discord', 'ECL Discord', 'Challonge bracket', 'Discord (CZ)', '(ukázka)']) expect(genericTournamentLink(label)).toBeNull();
  });
});
