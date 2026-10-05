import 'server-only';
import { match, type Executor } from '@valkyria/db';
import { and, eq, inArray } from 'drizzle-orm';
import { GAME_REGISTRY } from '@/modules/games/registry';
import { configuredLogiSources, type LogiIntegrationEnv } from './logi-config';
import type { PublicLogiEvent } from './logi/mapping';
import { applyReviewedLogiAliases } from './logi/public-aliases';

/** A configured identity is not publication authority: both sides must already be public. */
export async function attachPublicLogiArchiveLinks(db: Executor, env: LogiIntegrationEnv, input: readonly PublicLogiEvent[]): Promise<PublicLogiEvent[]> {
  if (!input.length) return [];
  const sources = configuredLogiSources(env, 'data').filter((source) => source.publishMatches);
  const events = applyReviewedLogiAliases(input, sources);
  const bindings = events.flatMap((event) => {
    const source = sources.find((row) => row.sourceInstanceId === event.ref.sourceInstanceId && row.guildId === event.ref.guildId && row.gameId === GAME_REGISTRY[event.ref.game].logi);
    const link = source?.matchLinks.find((row) => row.eventId === event.ref.externalId);
    return link ? [{ event, matchId: link.matchId }] : [];
  });
  if (!bindings.length) return [...events];
  const rows = await db.select({ id: match.id, slug: match.slug, game: match.game, opponentName: match.opponentName, opponentShortCode: match.opponentShortCode, competitionName: match.competitionName }).from(match).where(and(eq(match.publication, 'published'), inArray(match.id, bindings.map((row) => row.matchId))));
  return events.map((event) => {
    const binding = bindings.find((row) => row.event === event);
    const archive = rows.find((row) => row.id === binding?.matchId && row.game === GAME_REGISTRY[event.ref.game].db);
    return archive ? { ...event, archive: { slug: archive.slug, opponentName: archive.opponentName, opponentShortCode: archive.opponentShortCode, competitionName: archive.competitionName } } : event;
  });
}
