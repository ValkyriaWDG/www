import 'server-only';
import {
  match,
  memberProfile,
  proseRevision,
  proseTranslation,
  type AssetScope,
  type Executor,
  type Locale,
} from '@valkyria/db';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import type { Capability } from '@/modules/access/capabilities';
import { actorLabel, actorUserId } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { parseRichTextDocument, RICH_TEXT_SCHEMA_VERSION } from '@/modules/content/rich-text/schema';
import { assertUsableAssets } from './assets';
import { assertVersion, authorize, isUniqueViolation, parseInput } from './domain';
import { ownerCondition } from './queries';
import {
  MAX_PROSE_BODY_BYTES,
  proseTargetSchema,
  publishProseSchema,
  restoreProseRevisionSchema,
  saveProseDraftSchema,
  unpublishProseSchema,
  type ProseTargetInput,
  type PublishProseInput,
  type RestoreProseRevisionInput,
  type SaveProseDraftInput,
  type UnpublishProseInput,
} from './schemas';
import type { ProseMutationResult, ProseOwner, ProseOwnerKind, ProseRevisionSummary } from './types';

/** Revisions kept per translation (pointers are always kept in addition). */
export const MAX_PROSE_REVISIONS = 50;

/** Authorization and media scope follow the owning domain, never the locale. */
const OWNER_POLICY: Record<ProseOwnerKind, { edit: Capability; publish: Capability; scopes: readonly AssetScope[]; entityType: string }> = {
  member: { edit: 'members.edit', publish: 'members.publish', scopes: ['editorial'], entityType: 'member_profile' },
  match: { edit: 'matches.edit', publish: 'matches.publish', scopes: ['match', 'editorial'], entityType: 'match' },
};

/**
 * Authorizes against the owner domain named in the raw input before the input is fully
 * validated, so unauthorized callers learn nothing from validation errors.
 */
async function guard(db: Executor, actor: Actor, input: unknown, capability: 'edit' | 'publish', action: string, intent: 'read' | 'write' = 'write') {
  const owner = typeof input === 'object' && input !== null ? (input as { owner?: { kind?: unknown; id?: unknown }; locale?: unknown }).owner : undefined;
  const kind = owner?.kind;
  if (kind !== 'member' && kind !== 'match') throw new DomainError('validation', 'Invalid input.', { 'owner.kind': 'invalid_value' });
  const policy = OWNER_POLICY[kind];
  const entityId = typeof owner?.id === 'string' && /^[0-9a-f-]{36}$/i.test(owner.id) ? owner.id : null;
  const rawLocale = (input as { locale?: unknown }).locale;
  const locale = rawLocale === 'cs' || rawLocale === 'en' ? rawLocale : null;
  await authorize(db, actor, policy[capability], { intent, action, entityType: policy.entityType, entityId, locale });
  return policy;
}

async function assertOwnerExists(db: Executor, owner: ProseOwner) {
  const table = owner.kind === 'member' ? memberProfile : match;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, owner.id)).limit(1);
  if (!row) throw new DomainError('not_found');
}

async function lockTranslation(db: Executor, owner: ProseOwner, locale: Locale) {
  const [row] = await db
    .select()
    .from(proseTranslation)
    .where(and(ownerCondition(owner), eq(proseTranslation.locale, locale)))
    .for('update');
  return row;
}

function validateBody(body: unknown) {
  const size = Buffer.byteLength(JSON.stringify(body ?? null), 'utf8');
  if (size > MAX_PROSE_BODY_BYTES) throw new DomainError('payload_too_large');
  const parsed = parseRichTextDocument(body);
  if (!parsed.ok) throw new DomainError('validation', 'Invalid rich text.', { body: parsed.issues[0] ?? 'invalid' });
  return parsed;
}

async function pruneRevisions(db: Executor, translationId: string, keep: (string | null)[]) {
  const newest = await db
    .select({ id: proseRevision.id })
    .from(proseRevision)
    .where(eq(proseRevision.proseTranslationId, translationId))
    .orderBy(desc(proseRevision.createdAt), desc(proseRevision.id))
    .limit(MAX_PROSE_REVISIONS);
  const ids = [...new Set([...newest.map((row) => row.id), ...keep.filter((id): id is string => Boolean(id))])];
  await db.delete(proseRevision).where(and(eq(proseRevision.proseTranslationId, translationId), notInArray(proseRevision.id, ids)));
}

/**
 * Saves a new immutable draft revision for one owner/locale. Creating the translation
 * uses `expectedVersion: 0`. The published revision and the other locale are untouched.
 */
export async function saveProseDraft(db: Executor, actor: Actor, input: SaveProseDraftInput): Promise<ProseMutationResult> {
  const policy = await guard(db, actor, input, 'edit', 'prose.save');
  const data = parseInput(saveProseDraftSchema, input);
  const parsed = validateBody(data.body);
  const cover = data.cover ?? null;
  const assetIds = [...new Set([...parsed.assetIds, ...(cover ? [cover.assetId.toLowerCase()] : [])])];
  await assertUsableAssets(
    db,
    [...parsed.assetIds.map((id) => ({ field: 'body', id })), { field: 'cover.assetId', id: cover?.assetId }],
    policy.scopes,
  );

  try {
    return await db.transaction(async (tx) => {
      await assertOwnerExists(tx, data.owner);
      let translation = await lockTranslation(tx, data.owner, data.locale);
      if (!translation) {
        if (data.expectedVersion !== 0) throw new DomainError('conflict');
        [translation] = await tx
          .insert(proseTranslation)
          .values({
            memberProfileId: data.owner.kind === 'member' ? data.owner.id : null,
            matchId: data.owner.kind === 'match' ? data.owner.id : null,
            locale: data.locale,
          })
          .returning();
      } else {
        assertVersion(translation, data.expectedVersion);
      }
      const current = translation!;
      const [revision] = await tx
        .insert(proseRevision)
        .values({
          proseTranslationId: current.id,
          locale: data.locale,
          kind: data.kind,
          schemaVersion: RICH_TEXT_SCHEMA_VERSION,
          body: parsed.doc,
          cover,
          assetIds,
          createdBy: actorUserId(actor),
          createdByLabel: actorLabel(actor),
        })
        .returning({ id: proseRevision.id });
      const isNew = data.expectedVersion === 0;
      const [updated] = await tx
        .update(proseTranslation)
        .set({
          draftRevisionId: revision!.id,
          version: isNew ? current.version : sql`${proseTranslation.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(proseTranslation.id, current.id))
        .returning({ version: proseTranslation.version });
      await pruneRevisions(tx, current.id, [revision!.id, current.publishedRevisionId]);
      return { translationId: current.id, locale: data.locale, version: updated!.version, revisionId: revision!.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError('conflict');
    throw error;
  }
}

/** Publishes the current draft (or a named revision of this exact translation) for one locale. */
export async function publishProse(db: Executor, actor: Actor, input: PublishProseInput): Promise<ProseMutationResult> {
  const policy = await guard(db, actor, input, 'publish', 'prose.publish');
  const data = parseInput(publishProseSchema, input);
  return db.transaction(async (tx) => {
    const translation = await lockTranslation(tx, data.owner, data.locale);
    assertVersion(translation, data.expectedVersion);
    const revisionId = data.revisionId ?? translation.draftRevisionId;
    if (!revisionId) throw new DomainError('invalid_state', 'Nothing to publish.');
    const [revision] = await tx
      .select()
      .from(proseRevision)
      .where(and(eq(proseRevision.id, revisionId), eq(proseRevision.proseTranslationId, translation.id)))
      .limit(1);
    if (!revision) throw new DomainError('not_found');
    const parsed = validateBody(revision.body);
    await assertUsableAssets(
      tx,
      [...parsed.assetIds.map((id) => ({ field: 'body', id })), { field: 'cover.assetId', id: revision.cover?.assetId }],
      policy.scopes,
    );
    const now = new Date();
    const [updated] = await tx
      .update(proseTranslation)
      .set({ publishedRevisionId: revision.id, publishedAt: now, version: sql`${proseTranslation.version} + 1`, updatedAt: now })
      .where(eq(proseTranslation.id, translation.id))
      .returning({ version: proseTranslation.version });
    await recordAudit(tx, {
      actor,
      action: 'prose.publish',
      outcome: 'success',
      capability: policy.publish,
      entityType: policy.entityType,
      entityId: data.owner.id,
      translationId: translation.id,
      locale: data.locale,
      summary: { revisionId: revision.id, replacedRevisionId: translation.publishedRevisionId },
    });
    return { translationId: translation.id, locale: data.locale, version: updated!.version, revisionId: revision.id };
  });
}

/** Removes one locale's live prose; its drafts and the other locale are untouched. */
export async function unpublishProse(db: Executor, actor: Actor, input: UnpublishProseInput): Promise<ProseMutationResult> {
  const policy = await guard(db, actor, input, 'publish', 'prose.unpublish');
  const data = parseInput(unpublishProseSchema, input);
  return db.transaction(async (tx) => {
    const translation = await lockTranslation(tx, data.owner, data.locale);
    assertVersion(translation, data.expectedVersion);
    if (!translation.publishedRevisionId) throw new DomainError('invalid_state', 'Not published.');
    const [updated] = await tx
      .update(proseTranslation)
      .set({ publishedRevisionId: null, publishedAt: null, version: sql`${proseTranslation.version} + 1`, updatedAt: new Date() })
      .where(eq(proseTranslation.id, translation.id))
      .returning({ version: proseTranslation.version });
    await recordAudit(tx, {
      actor,
      action: 'prose.unpublish',
      outcome: 'success',
      capability: policy.publish,
      entityType: policy.entityType,
      entityId: data.owner.id,
      translationId: translation.id,
      locale: data.locale,
      summary: { revisionId: translation.publishedRevisionId },
    });
    return { translationId: translation.id, locale: data.locale, version: updated!.version, revisionId: null };
  });
}

/** Copies an earlier revision of the same translation into a new draft (never to live). */
export async function restoreProseRevision(db: Executor, actor: Actor, input: RestoreProseRevisionInput): Promise<ProseMutationResult> {
  const policy = await guard(db, actor, input, 'edit', 'prose.restore');
  const data = parseInput(restoreProseRevisionSchema, input);
  return db.transaction(async (tx) => {
    const translation = await lockTranslation(tx, data.owner, data.locale);
    assertVersion(translation, data.expectedVersion);
    const [source] = await tx
      .select()
      .from(proseRevision)
      .where(and(eq(proseRevision.id, data.revisionId), eq(proseRevision.proseTranslationId, translation.id)))
      .limit(1);
    if (!source) throw new DomainError('not_found');
    const [revision] = await tx
      .insert(proseRevision)
      .values({
        proseTranslationId: translation.id,
        locale: data.locale,
        kind: 'restore',
        schemaVersion: source.schemaVersion,
        body: source.body,
        cover: source.cover,
        assetIds: source.assetIds,
        createdBy: actorUserId(actor),
        createdByLabel: actorLabel(actor),
      })
      .returning({ id: proseRevision.id });
    const [updated] = await tx
      .update(proseTranslation)
      .set({ draftRevisionId: revision!.id, version: sql`${proseTranslation.version} + 1`, updatedAt: new Date() })
      .where(eq(proseTranslation.id, translation.id))
      .returning({ version: proseTranslation.version });
    await recordAudit(tx, {
      actor,
      action: 'prose.restore',
      outcome: 'success',
      capability: policy.edit,
      entityType: policy.entityType,
      entityId: data.owner.id,
      translationId: translation.id,
      locale: data.locale,
      summary: { restoredFromRevisionId: source.id, revisionId: revision!.id },
    });
    await pruneRevisions(tx, translation.id, [revision!.id, translation.publishedRevisionId]);
    return { translationId: translation.id, locale: data.locale, version: updated!.version, revisionId: revision!.id };
  });
}

export type ProseRevisionList = {
  translationId: string | null;
  version: number;
  revisions: ProseRevisionSummary[];
};

/** Bounded revision history of one owner/locale, newest first. */
export async function listProseRevisions(db: Executor, actor: Actor, input: ProseTargetInput): Promise<ProseRevisionList> {
  await guard(db, actor, input, 'edit', 'prose.history', 'read');
  const data = parseInput(proseTargetSchema, input);
  const [translation] = await db
    .select()
    .from(proseTranslation)
    .where(and(ownerCondition(data.owner), eq(proseTranslation.locale, data.locale)))
    .limit(1);
  if (!translation) return { translationId: null, version: 0, revisions: [] };
  const rows = await db
    .select({ id: proseRevision.id, kind: proseRevision.kind, createdAt: proseRevision.createdAt, createdByLabel: proseRevision.createdByLabel })
    .from(proseRevision)
    .where(eq(proseRevision.proseTranslationId, translation.id))
    .orderBy(desc(proseRevision.createdAt), desc(proseRevision.id))
    .limit(MAX_PROSE_REVISIONS);
  return {
    translationId: translation.id,
    version: translation.version,
    revisions: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      createdAt: row.createdAt.toISOString(),
      createdByLabel: row.createdByLabel,
      isDraft: row.id === translation.draftRevisionId,
      isPublished: row.id === translation.publishedRevisionId,
    })),
  };
}
