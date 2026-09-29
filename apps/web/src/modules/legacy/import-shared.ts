import 'server-only';
import { legacyImport, type Executor } from '@valkyria/db';
import { and, eq, sql } from 'drizzle-orm';
import type { Actor } from '@/modules/access/types';
import type { ImportBundle } from './import-contract';
import { ZodError } from 'zod';

/** Operator-only service identity. This module is used by the CLI, never a request action. */
export const IMPORT_ACTOR: Actor = { kind: 'system', label: 'legacy-hll-migration', capabilities: new Set(['content.edit', 'content.publish', 'media.editorial.manage', 'media.match.manage', 'matches.edit', 'matches.publish']) };
export type ImportAction = 'create' | 'adopt' | 'unchanged' | 'publish' | 'conflict' | 'invalid' | 'skipped';
export type ImportReportItem = { kind: string; key: string; action: ImportAction; reason?: string; targetId?: string };
export type ImportOptions = { apply?: boolean; publish?: boolean; adoptSeed?: boolean; mediaRoot?: string; matchClock?: 'legacy-fixed-offset' | 'europe-prague' };
export type ImportContext = { bundle: ImportBundle; root: string; options: ImportOptions; media: Map<string, string>; report: ImportReportItem[] };
export type ImportIdentity = { kind: 'news' | 'manual' | 'page' | 'tournament' | 'match' | 'media'; key: string; hash: string; sourceUrl: string; sourcePublishedOn?: string | null; sourceLanguage?: 'cs' | 'sk'; credits?: string; sourceMetadata?: Record<string, unknown> };

export async function findIdentity(tx: Executor, context: ImportContext, identity: ImportIdentity) {
  // Serialize all migration writers before looking up identities or adopting seeded shells.
  await tx.execute(sql`select pg_advisory_xact_lock(76293065)`);
  const [existing] = await tx.select().from(legacyImport).where(and(
    eq(legacyImport.sourceOrigin, context.bundle.sourceOrigin), eq(legacyImport.sourceKind, identity.kind),
    eq(legacyImport.sourceKey, identity.key), eq(legacyImport.locale, 'cs'),
  )).for('update');
  return existing;
}

export async function recordIdentity(tx: Executor, context: ImportContext, identity: ImportIdentity, target: { translationId?: string; matchId?: string; tournamentId?: string; assetId?: string; importedVersion?: number }) {
  await tx.insert(legacyImport).values({
    sourceOrigin: context.bundle.sourceOrigin, sourceKind: identity.kind, sourceKey: identity.key, locale: 'cs',
    sourceUrl: identity.sourceUrl, sourceSha256: identity.hash, sourcePublishedOn: identity.sourcePublishedOn ?? null,
    sourceLanguage: identity.sourceLanguage ?? 'cs', credits: identity.credits ?? '', sourceMetadata: identity.sourceMetadata ?? {}, observedAt: new Date(context.bundle.observedAt), ...target,
  });
}

/** Stable diagnostic codes only: never SQL errors, connection strings or raw source records. */
export function importFailure(error: unknown): string {
  if (error instanceof ZodError) return `validation:${[...new Set(error.issues.map((issue) => issue.path.map(String).join('.')).filter((item) => /^[a-zA-Z0-9_.]{1,100}$/.test(item)))].slice(0, 8).join(',')}`;
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[a-z_]+$/.test(error.code)) return error.code;
  return 'record_validation_or_storage_failed';
}
