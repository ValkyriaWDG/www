import { describe, expect, it } from 'vitest';
import { reconcileLegacyMatches, REVIEWED_MATCH_IDENTITY_REPAIRS, validateLegacyScoreboardMap, verifiedLegacyScoreboardUrl } from './extract-matches';

const first = { id: 198, date: '19/04/2026 19:30', map: 'sme', teams: { away: { name: 'LORD' } } };
const second = { id: 198, date: '17/05/2026 19:30', map: 'smdm', teams: { away: { name: '57TH' } } };
const sources = [{ fileId: 198, row: first }, { fileId: 199, row: second }];

describe('legacy public match identity reconciliation', () => {
  it('preserves both distinct matches only through an explicit reviewed repair', () => {
    const result = reconcileLegacyMatches([first, second], sources, REVIEWED_MATCH_IDENTITY_REPAIRS);
    expect(result.matches.map((row) => row.id)).toEqual([198, 199]);
    expect(result.matches[1]).toMatchObject({ _legacyIdentity: { originalEmbeddedId: 198, sourceFile: '199.json', sourceUrl: 'https://valkyriahll.cz/matches/199' } });
    expect(result.repairedIds.has(199)).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(second.id).toBe(198);
  });

  it('rejects unreviewed conflicts and changed facts rather than choosing a row', () => {
    expect(() => reconcileLegacyMatches([first, second], sources, [])).toThrow('Unreviewed identity mismatch');
    const changed = { ...second, map: 'carentan' };
    expect(() => reconcileLegacyMatches([first, changed], sources, REVIEWED_MATCH_IDENTITY_REPAIRS)).toThrow('no unique exact source');
    expect(() => reconcileLegacyMatches([first, changed], [sources[0]!, { fileId: 199, row: changed }], REVIEWED_MATCH_IDENTITY_REPAIRS)).toThrow('Unreviewed identity mismatch');
  });

  it('deduplicates only identical public rows with an explicit warning', () => {
    const result = reconcileLegacyMatches([first, { ...first }], [sources[0]!], []);
    expect(result.matches).toEqual([first]);
    expect(result.warnings[0]).toContain('Exact duplicate');
  });

  it('excludes hidden source records and rejects incomplete or ambiguous inventories', () => {
    const hidden = { id: 50, hidden: true };
    expect(reconcileLegacyMatches([first, hidden], [sources[0]!, { fileId: 50, row: hidden }], []).matches).toEqual([first]);
    expect(() => reconcileLegacyMatches([first], sources, [])).toThrow('does not cover every');
    expect(() => reconcileLegacyMatches([first], [sources[0]!, { fileId: 200, row: first }], [])).toThrow('no unique exact source');
  });
});

describe('legacy scoreboard map association', () => {
  it('links only the individually verified origin and complete source identity tuple', () => {
    const source = { id: 16551, server_number: 6, start: '2026-09-27T18:06:19+00:00', map_name: 'carentan_warfare' };
    expect(verifiedLegacyScoreboardUrl(211, 1, source)).toBe('https://event.valkyriahll.app/games/16551');
    expect(verifiedLegacyScoreboardUrl(210, 1, source)).toBeNull();
    expect(verifiedLegacyScoreboardUrl(211, 2, source)).toBeNull();
    expect(verifiedLegacyScoreboardUrl(211, 1, { ...source, server_number: 2 })).toBeNull();
    expect(verifiedLegacyScoreboardUrl(211, 1, { id: 16551 })).toBeNull();
  });

  it('accepts observed old/new map naming families without equating different maps', () => {
    expect(validateLegacyScoreboardMap('phl', 'PHL_L_1944_Warfare').ok).toBe(true);
    expect(validateLegacyScoreboardMap('smdm', 'SMDM_S_1944_Day_P_Skirmish').ok).toBe(true);
    expect(validateLegacyScoreboardMap('sme', 'stmereeglise_warfare').ok).toBe(true);
    expect(validateLegacyScoreboardMap('foy-night', 'purpleheartlane_warfare_night').ok).toBe(false);
    expect(validateLegacyScoreboardMap('smdm', 'carentan_warfare').ok).toBe(false);
  });

  it('flags same-map variant differences and fails closed for unreviewed names', () => {
    expect(validateLegacyScoreboardMap('foy', 'foy_warfare_night')).toMatchObject({ ok: true, note: expect.stringContaining('variant') });
    expect(validateLegacyScoreboardMap('unknown', 'new_map_warfare').ok).toBe(false);
    expect(validateLegacyScoreboardMap('foy', null).ok).toBe(false);
  });
});
