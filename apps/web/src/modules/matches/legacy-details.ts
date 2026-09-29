import 'server-only';
import { legacyImport, match, type Executor } from '@valkyria/db';
import { and, eq, inArray } from 'drizzle-orm';
import { LEGACY_HLL_ORIGIN } from '@/modules/legacy/hll';
import { sourceHash } from '@/modules/legacy/import-contract';
import { parseLegacyMatchDetails, type LegacyMatchDetails } from '@/modules/legacy/match-details';

/** Never expose the import ledger itself, including private operator notes or hashes. */
export async function loadPublicLegacyMatchDetails(db: Executor, matchIds: readonly string[]): Promise<Map<string, LegacyMatchDetails>> {
  if (!matchIds.length) return new Map();
  const rows = await db.select({ matchId: legacyImport.matchId, metadata: legacyImport.sourceMetadata })
    .from(legacyImport)
    .innerJoin(match, eq(match.id, legacyImport.matchId))
    .where(and(
      inArray(match.id, [...new Set(matchIds)]),
      eq(match.publication, 'published'),
      eq(match.game, 'hell-let-loose'),
      eq(legacyImport.sourceOrigin, LEGACY_HLL_ORIGIN),
      eq(legacyImport.sourceKind, 'match'),
      eq(legacyImport.locale, 'cs'),
    ));
  const result = new Map<string, LegacyMatchDetails>();
  for (const row of rows) {
    const details = parseLegacyMatchDetails(row.metadata.matchDetails);
    if (row.matchId && details && row.metadata.matchDetailsSha256 === sourceHash(row.metadata.matchDetails)) result.set(row.matchId, details);
  }
  return result;
}
