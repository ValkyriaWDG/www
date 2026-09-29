import { createTranslator } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import messages from '@/i18n/messages/en/matches.json';
import { parseCrconScoreboard, summarizeTeams } from '@/modules/matches/statistics';
import { syntheticScoreboard } from '@/modules/matches/statistics-fixtures';
import type { MatchStatisticsView } from '@/modules/matches/types';
import { MatchStatistics } from './match-statistics';

vi.mock('next-intl/server', () => ({ getTranslations: async () => createTranslator({ locale: 'en', messages, namespace: 'statistics' }) }));

function view(): MatchStatisticsView {
  const parsed = parseCrconScoreboard(syntheticScoreboard())!;
  return {
    source: 'crcon', sourceLabel: 'Synthetic event', externalGameId: '4242', sourceServerPublicId: 'event', sourceGameUrl: 'https://stats.example.org/games/4242',
    mapName: parsed.mapName, mode: parsed.mode, gameStartedAt: parsed.startedAt!.toISOString(), gameEndedAt: parsed.endedAt!.toISOString(), result: parsed.result,
    valkyriaSide: 'allies', teams: summarizeTeams(parsed), players: null, playerCount: parsed.players.length, publishPlayers: false, observedAt: '2026-09-29T10:00:00Z',
  };
}
async function render(statistics: MatchStatisticsView) {
  return renderToStaticMarkup(await MatchStatistics({ statistics, locale: 'en', titleId: 'synthetic', opponentLabel: 'Synthetic opponent' }));
}

describe('public match statistics provenance and rounds', () => {
  it('links the validated public source without exposing player rows that are not published', async () => {
    const html = await render(view());
    expect(html).toContain('href="https://stats.example.org/games/4242"');
    expect(html).toContain('Original game statistics (external site)');
    expect(html).not.toContain('[SYN] Allies Player');
    expect(html).not.toContain('target=');
  });

  it('does not invent a source link for uploads', async () => {
    const html = await render({ ...view(), source: 'upload', sourceServerPublicId: null, sourceGameUrl: null });
    expect(html).not.toContain('data-statistics-source-link');
  });

  it('labels unassigned historical teams by faction without guessing Valkyria’s side', async () => {
    const players = parseCrconScoreboard(syntheticScoreboard())!.players;
    const html = await render({ ...view(), valkyriaSide: null, players, publishPlayers: true });
    expect(html).toContain('The historical source does not identify Valkyria');
    expect(html).toContain('<th scope="col">Allies</th>');
    expect(html).toContain('<th scope="col">Axis</th>');
    expect(html).not.toContain('Valkyria (');
    expect(html).not.toContain('Synthetic opponent (');
    const rows = html.match(/<tr data-player-side="(?:allies|axis)">[\s\S]*?<\/tr>/g) ?? [];
    expect(rows).toHaveLength(players.length);
    for (const row of rows) {
      expect(row).toContain(row.includes('data-player-side="allies"') ? '<td>Allies</td>' : '<td>Axis</td>');
      expect(row).not.toContain('<td>Valkyria</td>');
      expect(row).not.toContain('<td>Synthetic opponent</td>');
    }
  });

  it('keeps every legacy round available through labeled tabs and preserves per-round sides', async () => {
    const first = view();
    const second = { ...view(), externalGameId: '4243', sourceGameUrl: 'https://stats.example.org/games/4243', valkyriaSide: 'axis' as const };
    const html = await render({ ...first, rounds: [{ ordinal: 2, statistics: second }] });
    expect(html).toContain('aria-label="Imported game rounds"');
    expect(html).toContain('>Round 1</button>');
    expect(html).toContain('>Round 2</button>');
    expect(html).toContain('href="https://stats.example.org/games/4243"');
    expect(html).toContain('Valkyria (Allies)');
    expect(html).toContain('Valkyria (Axis)');
    expect(html).not.toContain('[SYN] Allies Player');
  });
});
