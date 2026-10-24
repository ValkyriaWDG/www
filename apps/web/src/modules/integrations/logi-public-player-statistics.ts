import 'server-only';
import { createHash } from 'node:crypto';
import type { Executor, Game } from '@valkyria/db';
import { z } from 'zod';
import type { LogiIntegrationEnv } from './logi-config';
import { readPublicLogiPlayerStatisticsTargets } from './logi-public-players';
import { abortable, boundedJson, validateLogiOrigin, type LogiFetch } from './logi/transport';

/** Public reviewed matches across all teams, not server-session or website-clan totals. */
export type PublicPlayerStatistics = {
  game: Game;
  matches: number;
  kills: number;
  deaths: number;
  kd: number;
  cashDelta: number | null;
  recentMatches: {
    title: string; endedAt: string; mapName: string | null;
    kills: number; deaths: number; kd: number;
    offense: number | null; defense: number | null; support: number | null; cashDelta: number | null;
  }[];
  recentLimit: 30;
  observedAt: string;
};

const counter = z.number().finite().nonnegative();
const gameId = z.enum(['hell_let_loose', 'wardogs']);
// This is an explicit field allowlist. The public producer also returns account,
// clan and avatar identifiers, which are discarded at the boundary, never proxied.
const profileSchema = z.object({ data: z.object({
  gameId,
  identityBinding: z.string().regex(/^[a-f0-9]{64}$/),
  stats: z.object({ matches: counter.int().safe(), kills: counter, deaths: counter, kd: counter, cashDelta: z.number().finite().nullable().optional() }),
  recentMatches: z.array(z.object({
    name: z.string().min(1).max(500), endedAt: z.iso.datetime(), mapName: z.string().max(200).optional(),
    gameId, kills: counter, deaths: counter, killDeathRatio: counter,
    offense: counter.optional(), defense: counter.optional(), support: counter.optional(), cashDelta: z.number().finite().nullable().optional(),
  })).max(30),
}) });

type Target = Awaited<ReturnType<typeof readPublicLogiPlayerStatisticsTargets>>[number];
type Options = {
  game?: Game; now?: () => Date; fetchImpl?: LogiFetch;
  /** Test seam for the same current-core publication resolver, never a caller-provided identity. */
  targets?: typeof readPublicLogiPlayerStatisticsTargets;
};

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 256;
const cache = new Map<string, { expiresAt: number; data: PublicPlayerStatistics }>();

function targetKey(target: Target) {
  return createHash('sha256').update(JSON.stringify([
    target.source.scopeKey, target.source.gameId, target.version,
    target.member.id, target.member.identityId, target.member.discordSubject,
  ])).digest('hex');
}

/**
 * Detail-only public statistics; the directory never makes one request per player.
 * The exact current native identity selects the producer account server-side. Its
 * publication/version is checked again after I/O and cache reads. Revocation, a
 * changed core identity, hidden editorial binding or grant change returns no facts.
 */
export async function readPublicPlayerStatistics(db: Executor, env: LogiIntegrationEnv, playerKey: string, options: Options = {}): Promise<PublicPlayerStatistics[]> {
  const resolve = options.targets ?? readPublicLogiPlayerStatisticsTargets;
  const now = options.now ?? (() => new Date());
  const initial = await resolve(db, env, playerKey, { game: options.game, now }).catch(() => []);
  const candidates: { target: Target; data: PublicPlayerStatistics }[] = [];
  for (const target of initial) {
    if (target.member.identityState !== 'resolved' || !target.member.identityId || !target.member.discordSubject) continue;
    const key = targetKey(target);
    const cached = options.fetchImpl ? undefined : cache.get(key);
    if (cached && cached.expiresAt > now().getTime()) {
      candidates.push({ target, data: cached.data });
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const origin = validateLogiOrigin(target.source.origin, target.source);
      const url = new URL(`/api/v1/public/players/${encodeURIComponent(target.member.discordSubject)}`, origin);
      url.searchParams.set('game', target.source.gameId);
      url.searchParams.set('identity', 'discord');
      const response = await abortable((options.fetchImpl ?? fetch)(url.href, {
        method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store', signal: controller.signal,
      }), controller.signal);
      if (!response.ok) continue;
      const parsed = profileSchema.safeParse(await boundedJson(response, 512 * 1024, controller.signal));
      if (!parsed.success) continue;
      const profile = parsed.data.data;
      // A legacy account ID can equal another account's Discord subject. Require
      // an exact resolver and proof of the immutable native identity, including
      // during rolling deployments whose old API ignores the selector.
      const expectedBinding = createHash('sha256').update(JSON.stringify([
        'public-player-native-v1', target.member.identityId, target.member.discordSubject,
      ])).digest('hex');
      if (profile.identityBinding !== expectedBinding || profile.gameId !== target.source.gameId || profile.recentMatches.some((match) => match.gameId !== profile.gameId)
        || profile.stats.matches < profile.recentMatches.length) continue;
      const wardogs = profile.gameId === 'wardogs';
      const data: PublicPlayerStatistics = {
        game: wardogs ? 'wardogs' : 'hell-let-loose', ...profile.stats,
        cashDelta: wardogs ? profile.stats.cashDelta ?? null : null,
        recentLimit: 30, observedAt: now().toISOString(),
        recentMatches: profile.recentMatches.map((match) => ({
          title: match.name, endedAt: match.endedAt, mapName: match.mapName ?? null,
          kills: match.kills, deaths: match.deaths, kd: match.killDeathRatio,
          offense: wardogs ? null : match.offense ?? null, defense: wardogs ? null : match.defense ?? null,
          support: wardogs ? null : match.support ?? null, cashDelta: wardogs ? match.cashDelta ?? null : null,
        })),
      };
      candidates.push({ target, data });
      if (!options.fetchImpl) {
        for (const [entry, value] of cache) if (value.expiresAt <= now().getTime()) cache.delete(entry);
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
        cache.set(key, { expiresAt: now().getTime() + CACHE_TTL_MS, data });
      }
    } catch {
      // An unavailable or rate-limited producer is not a zero-game player.
    } finally { clearTimeout(timer); }
  }
  const current = await resolve(db, env, playerKey, { game: options.game, now }).catch(() => []);
  const allowed = new Set(current.map(targetKey));
  return candidates.filter(({ target }) => allowed.has(targetKey(target))).map(({ data }) => data);
}
