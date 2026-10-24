import { describe, expect, it } from 'vitest';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { operationalMatchIdentity, publicResultLabel } from './operational-presentation';

const event = (fields: Partial<PublicLogiEvent> = {}): PublicLogiEvent => ({
  ref: { source: 'logi', sourceInstanceId: 'synthetic', guildId: '100000000000000001', game: 'hll', kind: 'match', externalId: 'synthetic-match' },
  title: 'Synthetic match title', kind: 'match', status: 'concluded', startsAt: null, endsAt: '2026-10-24T12:00:00Z',
  sourceUpdatedAt: null, observedAt: '2026-10-24T12:00:00Z', teams: [],
  result: { state: 'provisional', version: null, reviewedAt: null, endedAt: null, participants: [{ id: 'sideA', label: 'axis', score: 0 }, { id: 'sideB', label: 'allies', score: null }], provenance: null },
  ...fields,
});

describe('operational match identity presentation', () => {
  it('retains a supplied title without parsing it into teams', () => {
    expect(operationalMatchIdentity(event({ title: 'Synthetic VLK vs. Other Team' }))).toEqual({ title: 'Synthetic VLK vs. Other Team', teams: [], subtitle: null });
  });

  it('uses an explicitly reviewed archive opponent ahead of captured operational teams', () => {
    const row = event({ archive: { slug: 'synthetic-archive', opponentName: 'Synthetic Opponent', opponentShortCode: 'SYN' }, teams: [{ id: 'other', slot: 'a', name: 'Captured team', shortCode: null, side: 'Axis' }] });
    expect(operationalMatchIdentity(row)).toEqual({
      title: 'Valkyria vs. Synthetic Opponent',
      teams: [{ key: 'home', name: 'Valkyria', code: 'VLK', side: null }, { key: 'opponent', name: 'Synthetic Opponent', code: 'SYN', side: null }],
      subtitle: 'Synthetic match title',
    });
  });

  it('keeps a missing reviewed opponent code null and avoids a repeated subtitle', () => {
    expect(operationalMatchIdentity(event({ title: 'Valkyria vs. Synthetic Opponent', archive: { slug: 'synthetic-archive', opponentName: 'Synthetic Opponent' } }))).toEqual({
      title: 'Valkyria vs. Synthetic Opponent',
      teams: [{ key: 'home', name: 'Valkyria', code: 'VLK', side: null }, { key: 'opponent', name: 'Synthetic Opponent', code: null, side: null }],
      subtitle: null,
    });
  });

  it('does not infer an opponent from an archive link without a reviewed name', () => {
    expect(operationalMatchIdentity(event({ archive: { slug: 'synthetic-archive', opponentShortCode: 'SYN' } }))).toEqual({ title: 'Synthetic match title', teams: [], subtitle: null });
  });

  it('preserves every supplied team, name, code, side and ordering in a multiparty match', () => {
    const row = event({ ref: { ...event().ref, game: 'wardogs' }, teams: [
      { id: 'team-c', slot: 'c', name: 'Complete Charlie Name', shortCode: 'CHA', side: 'Lonestar' },
      { id: 'team-a', slot: 'a', name: 'Complete Alpha Name', shortCode: null, side: null },
      { id: 'team-b', slot: 'b', name: 'Complete Bravo Name', shortCode: 'BRV', side: 'Manticore' },
    ] });
    expect(operationalMatchIdentity(row)).toEqual({
      title: 'Complete Charlie Name vs. Complete Alpha Name vs. Complete Bravo Name',
      teams: [
        { key: 'team-c', name: 'Complete Charlie Name', code: 'CHA', side: 'Lonestar' },
        { key: 'team-a', name: 'Complete Alpha Name', code: null, side: null },
        { key: 'team-b', name: 'Complete Bravo Name', code: 'BRV', side: 'Manticore' },
      ],
      subtitle: row.title,
    });
  });

  it('suppresses only exact case-insensitive duplicate captured codes', () => {
    const teams: PublicLogiEvent['teams'] = [
      { id: 'one', slot: 'a', name: 'VLK', shortCode: 'vlk', side: 'Allies' },
      { id: 'two', slot: 'b', name: 'VLK Full Name', shortCode: 'VLK', side: 'Axis' },
      { id: 'three', slot: 'c', name: ' VLK ', shortCode: 'VLK', side: null },
    ];
    expect(operationalMatchIdentity(event({ teams })).teams.map((team) => team.code)).toEqual([null, 'VLK', 'VLK']);
    expect(operationalMatchIdentity(event({ title: 'VLK', teams: [teams[0]!] })).subtitle).toBeNull();
  });

  it('does not mutate supplied identity or result facts, including zero and unknown scores', () => {
    const row = event({ teams: [{ id: 'one', slot: 'a', name: 'Synthetic Team', shortCode: 'SYN', side: 'Allies' }] });
    const before = structuredClone(row);
    Object.freeze(row.teams[0]);
    Object.freeze(row.teams);
    Object.freeze(row.result.participants[0]);
    Object.freeze(row.result.participants);
    Object.freeze(row.result);
    Object.freeze(row);
    const identity = operationalMatchIdentity(row);
    const labels = row.result.participants.map((participant) => ({ ...participant, label: publicResultLabel(participant.label, row.ref.game, 'cs') }));
    expect(identity.teams[0]).not.toBe(row.teams[0]);
    expect(labels).toEqual([{ id: 'sideA', label: 'Osa', score: 0 }, { id: 'sideB', label: 'Spojenci', score: null }]);
    expect(row).toEqual(before);
  });
});

describe('partial Wardogs identity presentation', () => {
  const partial = (): PublicLogiEvent => event({
    ref: { ...event().ref, game: 'wardogs' },
    title: 'VLK vs ROG vs BACM',
    teams: [
      { id: 'synthetic-pv', slot: 'a', name: 'Polish Veterans', shortCode: 'PV', side: 'Valkyra' },
      { id: 'synthetic-rog', slot: 'b', name: 'TEAM ROGUE', shortCode: 'ROG', side: 'Lonestar' },
    ],
    result: { ...event().result, state: 'corrected', participants: [
      { id: 'Valkyra', label: 'Valkyra', score: 100 },
      { id: 'Manticore', label: 'Manticore', score: 91 },
      { id: 'Lonestar', label: 'Lonestar', score: 65 },
    ] },
  });

  it('keeps the exact conflicting source title primary and all supplied teams secondary without result attribution', () => {
    const row = partial();
    const before = structuredClone(row);
    expect(operationalMatchIdentity(row)).toEqual({
      title: 'VLK vs ROG vs BACM', subtitle: null, partialTeams: true,
      teams: [
        { key: 'synthetic-pv', name: 'Polish Veterans', code: 'PV', side: 'Valkyra' },
        { key: 'synthetic-rog', name: 'TEAM ROGUE', code: 'ROG', side: 'Lonestar' },
      ],
    });
    expect(row).toEqual(before);
  });

  it('does not create team identities by parsing a generic or empty title', () => {
    for (const title of ['Synthetic generic match', '']) {
      const identity = operationalMatchIdentity({ ...partial(), title });
      expect(identity).toMatchObject({ title, subtitle: null, partialTeams: true });
      expect(identity.teams).toHaveLength(2);
    }
  });

  it('keeps complete captured teams, HLL, archive links and absent captured teams on their existing paths', () => {
    const row = partial();
    const complete = { ...row, teams: [...row.teams, { id: 'synthetic-third', slot: 'c' as const, name: 'Supplied Third Team', shortCode: null, side: null }] };
    const hll = { ...row, ref: { ...row.ref, game: 'hll' as const } };
    const linked = { ...row, archive: { slug: 'synthetic-archive', opponentName: 'Reviewed Opponent', opponentShortCode: 'REV' } };
    for (const unchanged of [complete, hll, linked, { ...row, archive: { slug: 'synthetic-archive' } }, { ...row, teams: [] }, { ...row, result: { ...row.result, participants: [] } }]) {
      expect(operationalMatchIdentity(unchanged)).not.toHaveProperty('partialTeams');
    }
    expect(operationalMatchIdentity(complete).title).toBe('Polish Veterans vs. TEAM ROGUE vs. Supplied Third Team');
    expect(operationalMatchIdentity(hll).title).toBe('Polish Veterans vs. TEAM ROGUE');
    expect(operationalMatchIdentity(linked).title).toBe('Valkyria vs. Reviewed Opponent');
    expect(operationalMatchIdentity({ ...row, teams: [] })).toEqual({ title: row.title, teams: [], subtitle: null });
  });
});

describe('public result faction labels', () => {
  it.each([
    ['allies', 'cs', 'Spojenci'], ['Allies', 'cs', 'Spojenci'], ['ALLIES', 'en', 'Allies'],
    ['axis', 'cs', 'Osa'], ['Axis', 'en', 'Axis'], ['AXIS', 'cs', 'Osa'],
  ] as const)('localizes the exact HLL label %s in %s', (label, locale, expected) => {
    expect(publicResultLabel(label, 'hll', locale)).toBe(expected);
  });

  it.each(['Allies', 'Axis', 'Valkyra', 'Manticore', 'Lonestar', 'Faction A', 'sideA', 'Synthetic Clan', 'allied', ' allies ', 'Axis / VLK', ''])('preserves %s outside known HLL faction words', (label) => {
    expect(publicResultLabel(label, 'wardogs', 'cs')).toBe(label);
    expect(publicResultLabel(label, 'wardogs', 'en')).toBe(label);
    if (!['Allies', 'Axis'].includes(label)) {
      expect(publicResultLabel(label, 'hll', 'cs')).toBe(label);
      expect(publicResultLabel(label, 'hll', 'en')).toBe(label);
    }
  });
});
