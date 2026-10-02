import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { canForGame } from '@/modules/access/policy';
import type { Principal } from '@/modules/access/types';
import { GAME_REGISTRY, gameRouteFromLogi, type GameRoute } from '@/modules/games/registry';
import { configuredLogiSources } from '@/modules/integrations/logi-config';
import { pendingLogiEventCommands } from '@/modules/integrations/logi-command-service';
import { logiEventSummarySchema } from '@/modules/integrations/logi/contracts';
import { readActiveLogiProjections } from '@/modules/integrations/logi-store';
import { LogiMatchEditor } from './logi-match-editor';

export async function LogiMatchPage({ actor }: { actor: Principal }) {
  const env = getServerEnv(); const db = getDb();
  const games: GameRoute[] = [];
  const events: { game: GameRoute; id: string; title: string }[] = [];
  if (actor.assurance === 'logi' && env.LOGI_MEMBERSHIP_SOURCE === 'logi') {
    try {
      for (const source of configuredLogiSources(env, 'commands')) {
        const game = gameRouteFromLogi(source.gameId);
        if (!game || !canForGame(actor, 'matches.edit', GAME_REGISTRY[game].db)) continue;
        games.push(game);
        const readSource = configuredLogiSources(env, 'data').find((entry) => entry.gameId === source.gameId);
        if (!readSource) continue;
        for (const row of await readActiveLogiProjections(db, readSource)) {
          if (row.resource !== 'event-summaries' || row.operation !== 'upsert') continue;
          const event = logiEventSummarySchema.safeParse(row.data);
          if (event.success && event.data.kind === 'match') events.push({ game, id: event.data.id, title: event.data.title });
        }
      }
    } catch { games.length = 0; events.length = 0; }
  }
  return <LogiMatchEditor games={games} events={events} pendingRequests={games.length ? await pendingLogiEventCommands(db, actor) : []} />;
}
