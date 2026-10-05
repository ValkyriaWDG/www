import { GAME_REGISTRY } from '@/modules/games/registry';
import type { ConfiguredLogiSource } from '../logi-config';
import type { PublicLogiEvent } from './mapping';

type AliasSource = Pick<ConfiguredLogiSource, 'sourceInstanceId' | 'guildId' | 'gameId' | 'publishMatches' | 'matchAliases'>;
const instant = (value: string | null) => value === null ? null : Date.parse(value);

/** Observation/import times can differ between copies; teams, authority and actual facts cannot. */
function facts(event: PublicLogiEvent): string {
  const provenance = event.result.provenance;
  return JSON.stringify([event.kind, event.title, event.status, instant(event.startsAt), instant(event.endsAt), event.teams,
    event.result.state, event.result.version, instant(event.result.reviewedAt), instant(event.result.endedAt), event.result.participants,
    provenance?.kind ?? null, provenance?.kind === 'reviewed_result' ? provenance.origin : null]);
}

/** No heuristic matching. A changed/absent canonical record leaves every remaining alias visible. */
export function applyReviewedLogiAliases(events: readonly PublicLogiEvent[], sources: readonly AliasSource[]): PublicLogiEvent[] {
  const hidden = new Set<PublicLogiEvent>();
  const aliases = new Map<PublicLogiEvent, string[]>();
  for (const source of sources.filter((row) => row.publishMatches)) {
    const scoped = events.filter((event) => event.ref.sourceInstanceId === source.sourceInstanceId && event.ref.guildId === source.guildId && GAME_REGISTRY[event.ref.game].logi === source.gameId);
    for (const group of source.matchAliases) {
      const canonical = scoped.find((event) => event.ref.externalId === group.canonicalEventId);
      if (!canonical) continue;
      for (const id of group.aliasEventIds) {
        const alias = scoped.find((event) => event.ref.externalId === id);
        if (alias && facts(canonical) === facts(alias)) {
          hidden.add(alias);
          aliases.set(canonical, [...aliases.get(canonical) ?? [], id]);
        }
      }
    }
  }
  return events.filter((event) => !hidden.has(event)).map((event) => aliases.has(event) ? { ...event, aliases: aliases.get(event)! } : event);
}
