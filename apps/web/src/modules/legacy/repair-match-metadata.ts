import 'server-only';
import { legacyImport, match, type Executor } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { recordAudit } from '@/modules/audit/audit';
import { legacyMatchIdentity, matchMetadataState } from './import-match-identity';
import { findIdentity, IMPORT_ACTOR, type ImportContext, type ImportReportItem } from './import-shared';

/**
 * Operator-only additive provenance repair. It never creates/publishes a match or
 * touches editable facts, results, prose, scoreboards, privacy, or version fields.
 * The reviewed CLI bundle digest binds fields not covered by the original v1 hash.
 */
export async function repairMatchMetadata(db: Executor, context: ImportContext, input: unknown): Promise<ImportReportItem> {
  const { identity } = legacyMatchIdentity(context, input);
  const base = { kind: identity.kind, key: identity.key };
  return db.transaction(async (tx) => {
    const previous = await findIdentity(tx, context, identity);
    if (!previous) return { ...base, action: 'conflict', reason: 'metadata_repair_requires_existing_import' };
    if (previous.sourceSha256 !== identity.hash || previous.sourceUrl !== identity.sourceUrl) return { ...base, action: 'conflict', reason: 'source_changed_since_import' };
    const [target] = await tx.select({ id: match.id, game: match.game }).from(match).where(eq(match.id, previous.matchId!)).for('update');
    if (!target || target.game !== 'hell-let-loose') return { ...base, action: 'conflict', reason: 'imported_target_missing' };
    const metadata = previous.sourceMetadata;
    const { matchDetails, matchDetailsSha256 } = identity.sourceMetadata;
    const state = matchMetadataState(metadata, matchDetailsSha256);
    if (state !== 'missing') {
      // Refuse partial, edited, corrupt or changed projections, even if v1 ignored
      // the changed field. Do not silently replace historical provenance.
      if (state === 'conflict') {
        return { ...base, action: 'conflict', reason: 'match_metadata_changed_since_import' };
      }
      return { ...base, action: 'unchanged', targetId: target.id };
    }
    if (context.options.apply) {
      await tx.update(legacyImport).set({ sourceMetadata: { ...metadata, matchDetails, matchDetailsSha256 } }).where(eq(legacyImport.id, previous.id));
      await recordAudit(tx, { actor: IMPORT_ACTOR, action: 'legacy.match.metadata_repair', outcome: 'success', entityType: 'legacy_import', entityId: previous.id, summary: { sourceKind: 'match', sourceKey: identity.key, detailsSha256: matchDetailsSha256 } });
    }
    return { ...base, action: 'repair', targetId: target.id };
  });
}
