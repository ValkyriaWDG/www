import { sourceHash } from './import-contract';
import { normalizeLegacyMatch } from './import-match';
import { normalizeLegacyMatchDetails } from './match-details';
import type { ImportContext } from './import-shared';

export function matchMetadataState(metadata: Record<string, unknown>, expectedHash: string): 'missing' | 'unchanged' | 'conflict' {
  const hasDetails = Object.hasOwn(metadata, 'matchDetails');
  const hasHash = Object.hasOwn(metadata, 'matchDetailsSha256');
  if (!hasDetails && !hasHash) return 'missing';
  return hasDetails && hasHash && metadata.matchDetailsSha256 === expectedHash && sourceHash(metadata.matchDetails) === expectedHash ? 'unchanged' : 'conflict';
}

/** The v1 hash deliberately excludes the new projection: old imports remain identifiable. */
export function legacyMatchIdentity(context: ImportContext, input: unknown) {
  const normalized = normalizeLegacyMatch(input, context.options.matchClock);
  const { row } = normalized;
  const sources = context.bundle.scoreboardSources.filter((item) => item.legacyMatchId === row.id);
  const media = context.bundle.matchMedia?.find((item) => item.legacyMatchId === row.id);
  const clock = context.options.matchClock ?? 'legacy-fixed-offset';
  const matchDetails = normalizeLegacyMatchDetails(input, clock);
  return {
    normalized, media,
    identity: {
      kind: 'match' as const, key: String(row.id), sourceUrl: normalized.sourceUrl,
      hash: sourceHash({ row, clock, sources, media }),
      sourceMetadata: {
        identityRepair: row._legacyIdentity ?? null, sourceDate: row.date, clock,
        scoreboardSources: sources.map(({ ordinal, providerGameId, sha256, sourceGameUrl, notes }) => ({ ordinal, providerGameId, sha256, sourceGameUrl: sourceGameUrl ?? null, notes: notes ?? [] })),
        warnings: context.bundle.warnings.filter((note) => new RegExp(`\\b${row.id}\\b`).test(note)),
        matchDetails, matchDetailsSha256: sourceHash(matchDetails),
      },
    },
  };
}
