import { describe, expect, it } from 'vitest';
import { orderPlayers, parseCrconScoreboard, summarizeTeams } from './statistics';
import { syntheticScoreboard } from './statistics-fixtures';

describe('CRCON scoreboard import', () => {
  it('keeps an allowlist of player fields and drops IDs, Steam data and encounters', () => {
    const parsed = parseCrconScoreboard(syntheticScoreboard())!;
    expect(parsed).toMatchObject({
      externalGameId: '4242',
      mapName: 'Synthetic Map D',
      mode: 'Warfare',
      result: { allied: 1, axis: 4 },
      startedAt: new Date('2024-05-12T18:00:00Z'),
      endedAt: new Date('2024-05-12T19:30:00Z'),
    });
    expect(parsed.players).toHaveLength(12);
    expect(parsed.players[0]).toEqual({
      name: '[SYN] Allies Player 01',
      side: 'allies',
      kills: 30,
      deaths: 12,
      teamkills: 0,
      combat: 400,
      offense: 120,
      defense: 300,
      support: 150,
      killsPerMinute: 0.33,
      killDeathRatio: 2.5,
      timeSeconds: 5400,
      topWeapon: 'M1 GARAND',
    });
    const serialized = JSON.stringify(parsed.players);
    expect(serialized).not.toContain('7656119');
    expect(serialized).not.toContain('must not be imported');
  });

  it('accepts the bare result object and rejects anything that is not a scoreboard', () => {
    expect(parseCrconScoreboard(syntheticScoreboard().result)?.players).toHaveLength(12);
    expect(parseCrconScoreboard({ failed: true, result: null })).toBeNull();
    expect(parseCrconScoreboard({ result: { player_stats: 'x' } })).toBeNull();
    expect(parseCrconScoreboard([1, 2])).toBeNull();
  });

  it('sanitizes names and ignores implausible numbers', () => {
    const body = syntheticScoreboard({ perSide: 1 });
    Object.assign(body.result.player_stats[0]!, { player: '  Evil\u202e\nName  ', kills: -5, deaths: Number.POSITIVE_INFINITY, team: 'Allies' });
    const parsed = parseCrconScoreboard(body)!;
    expect(parsed.players[0]).toMatchObject({ name: 'Evil Name', kills: 0, deaths: 0, side: 'allies' });
  });

  it('summarizes team totals, kills by type and top weapons per side', () => {
    const parsed = parseCrconScoreboard(syntheticScoreboard())!;
    const teams = summarizeTeams(parsed);
    expect(teams.allies).toMatchObject({ players: 6, kills: 30 + 26 + 22 + 18 + 14 + 10, teamkills: 1 });
    expect(teams.axis.players).toBe(6);
    expect(teams.allies.killsByType).toMatchObject({ machine_gun: 18, grenade: 6 });
    expect(teams.allies.weapons[0]).toEqual({ weapon: 'M1 GARAND', kills: 24 + 20 + 16 + 12 + 8 + 4 });
    expect(teams.axis.weapons.map((weapon) => weapon.weapon)).toContain('MG42');
  });

  it('orders players by kills, then combat score', () => {
    const parsed = parseCrconScoreboard(syntheticScoreboard())!;
    expect(orderPlayers(parsed.players).map((player) => player.name).slice(0, 2)).toEqual(['[SYN] Allies Player 01', '[SYN] Allies Player 02']);
  });
});
