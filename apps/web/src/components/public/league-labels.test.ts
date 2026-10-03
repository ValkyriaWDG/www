import { describe, expect, it } from 'vitest';
import { enMessages } from '@/i18n/messages';
import { LEAGUE_VALUE_GROUPS, leagueValueKey } from './league-labels';

describe('League value labels', () => {
  it('maps known published values to dictionary keys and leaves other text as published', () => {
    expect(leagueValueKey('status', 'Scheduled')).toBe('values.status.scheduled');
    expect(leagueValueKey('type', ' Friendly ')).toBe('values.type.friendly');
    expect(leagueValueKey('hosting', 'Self-hosted')).toBe('values.hosting.self_hosted');
    expect(leagueValueKey('mapVote', 'Open')).toBe('values.mapVote.open');
    expect(leagueValueKey('progress', 'Rules agreed')).toBe('values.progress.rules_agreed');
    expect(leagueValueKey('progress', 'Moderator claimed')).toBe('values.progress.moderator_claimed');
    expect(leagueValueKey('status', 'Awaiting placements')).toBeNull();
    expect(leagueValueKey('type', 'Showmatch')).toBeNull();
    expect(leagueValueKey('status', null)).toBeNull();
    expect(leagueValueKey('status', '')).toBeNull();
  });

  it('has a dictionary entry for every known value', () => {
    const values = enMessages.matches.detail.league.values as Record<string, Record<string, string>>;
    for (const [group, slugs] of Object.entries(LEAGUE_VALUE_GROUPS)) {
      for (const slug of slugs) expect(values[group]?.[slug], `${group}.${slug}`).toBeTypeOf('string');
    }
  });
});
