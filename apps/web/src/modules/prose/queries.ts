import 'server-only';
import {
  LOCALES,
  match,
  memberProfile,
  proseRevision,
  proseTranslation,
  tournament,
  type Executor,
  type Locale,
} from '@valkyria/db';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { loadPublicImages } from './assets';
import type { LocalizedProse, ProseAdminDetail, ProseOwner, ProseOwnerKind, ProseStatus } from './types';

export function ownerColumn(kind: ProseOwnerKind) {
  if (kind === 'member') return proseTranslation.memberProfileId;
  return kind === 'match' ? proseTranslation.matchId : proseTranslation.tournamentId;
}

export function ownerCondition(owner: ProseOwner) {
  return eq(ownerColumn(owner.kind), owner.id);
}

function byLocaleOrder(a: Locale, b: Locale) {
  return LOCALES.indexOf(a) - LOCALES.indexOf(b);
}

/**
 * Published prose of `owner` for exactly `locale`, or its explicit absence. The CALLER
 * must already have established the owner's global public gate (see `getPublicProse`).
 */
export async function publishedProseFor(db: Executor, owner: ProseOwner, locale: Locale): Promise<LocalizedProse> {
  const rows = await db
    .select({
      locale: proseTranslation.locale,
      publishedAt: proseTranslation.publishedAt,
      body: proseRevision.body,
      cover: proseRevision.cover,
      assetIds: proseRevision.assetIds,
    })
    .from(proseTranslation)
    .innerJoin(
      proseRevision,
      and(eq(proseRevision.id, proseTranslation.publishedRevisionId), eq(proseRevision.proseTranslationId, proseTranslation.id)),
    )
    .where(and(ownerCondition(owner), isNotNull(proseTranslation.publishedRevisionId)));
  const current = rows.find((row) => row.locale === locale);
  if (!current) {
    return { state: 'missing', availableIn: rows.map((row) => row.locale).filter((l) => l !== locale).sort(byLocaleOrder) };
  }
  const images = await loadPublicImages(db, current.assetIds);
  return {
    state: 'published',
    locale,
    body: current.body,
    cover: current.cover ?? null,
    assets: [...images.values()],
    publishedAt: (current.publishedAt ?? new Date(0)).toISOString(),
  };
}

/** True when the owner passes its global public gate (published match or tournament / published + consented profile). */
export async function ownerIsPublic(db: Executor, owner: ProseOwner): Promise<boolean> {
  if (owner.kind === 'tournament') {
    const [row] = await db
      .select({ id: tournament.id })
      .from(tournament)
      .where(and(eq(tournament.id, owner.id), eq(tournament.publication, 'published')))
      .limit(1);
    return Boolean(row);
  }
  if (owner.kind === 'match') {
    const [row] = await db
      .select({ id: match.id })
      .from(match)
      .where(and(eq(match.id, owner.id), eq(match.publication, 'published')))
      .limit(1);
    return Boolean(row);
  }
  const [row] = await db
    .select({ id: memberProfile.id })
    .from(memberProfile)
    .where(and(eq(memberProfile.id, owner.id), eq(memberProfile.state, 'published'), isNotNull(memberProfile.consentConfirmedAt)))
    .limit(1);
  return Boolean(row);
}

/** Public prose with the owner's global gate applied; `null` when the owner is not public. */
export async function getPublicProse(db: Executor, owner: ProseOwner, locale: Locale): Promise<LocalizedProse | null> {
  if (!(await ownerIsPublic(db, owner))) return null;
  return publishedProseFor(db, owner, locale);
}

function statusOf(row: { draftRevisionId: string | null; publishedRevisionId: string | null } | undefined): ProseStatus {
  if (!row || (!row.draftRevisionId && !row.publishedRevisionId)) return 'none';
  if (!row.publishedRevisionId) return 'draft';
  return row.draftRevisionId && row.draftRevisionId !== row.publishedRevisionId ? 'published_with_changes' : 'published';
}

/** Per-owner, per-locale prose status for admin lists (no bodies loaded). */
export async function loadProseStatuses(db: Executor, kind: ProseOwnerKind, ownerIds: string[]): Promise<Map<string, Record<Locale, ProseStatus>>> {
  const result = new Map<string, Record<Locale, ProseStatus>>();
  for (const id of ownerIds) result.set(id, { cs: 'none', en: 'none' });
  if (ownerIds.length === 0) return result;
  const column = ownerColumn(kind);
  const rows = await db
    .select({
      ownerId: column,
      locale: proseTranslation.locale,
      draftRevisionId: proseTranslation.draftRevisionId,
      publishedRevisionId: proseTranslation.publishedRevisionId,
    })
    .from(proseTranslation)
    .where(inArray(column, ownerIds));
  for (const row of rows) {
    if (!row.ownerId) continue;
    const entry = result.get(row.ownerId);
    if (entry) entry[row.locale] = statusOf(row);
  }
  return result;
}

/** Both locales' draft/live prose state for an admin editor. Caller authorizes. */
export async function loadProseAdminDetail(db: Executor, owner: ProseOwner): Promise<Record<Locale, ProseAdminDetail>> {
  const translations = await db.select().from(proseTranslation).where(ownerCondition(owner));
  const draftIds = translations.map((t) => t.draftRevisionId).filter((id): id is string => Boolean(id));
  const drafts = draftIds.length
    ? await db.select().from(proseRevision).where(inArray(proseRevision.id, draftIds))
    : [];
  const result = {} as Record<Locale, ProseAdminDetail>;
  for (const locale of LOCALES) {
    const translation = translations.find((t) => t.locale === locale);
    const draft = translation?.draftRevisionId ? drafts.find((d) => d.id === translation.draftRevisionId) : undefined;
    result[locale] = {
      locale,
      status: statusOf(translation),
      version: translation?.version ?? 0,
      translationId: translation?.id ?? null,
      draft: draft
        ? {
            revisionId: draft.id,
            body: draft.body,
            cover: draft.cover ?? null,
            createdAt: draft.createdAt.toISOString(),
            createdByLabel: draft.createdByLabel,
          }
        : null,
      published:
        translation?.publishedRevisionId && translation.publishedAt
          ? { revisionId: translation.publishedRevisionId, publishedAt: translation.publishedAt.toISOString() }
          : null,
    };
  }
  return result;
}
