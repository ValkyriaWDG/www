import 'server-only';
import { LOCALES, memberProfile, type Executor, type Game, type Locale, type PublicRoleKey } from '@valkyria/db';
import { and, asc, count, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { Actor } from '@/modules/access/types';
import { loadPublicImages } from '@/modules/prose/assets';
import { authorize, foldedContains, pageCount, parseInput } from '@/modules/prose/domain';
import { loadProseAdminDetail, loadProseStatuses, publishedProseFor } from '@/modules/prose/queries';
import { SLUG_PATTERN } from '@/modules/prose/slug';
import { adminMemberListSchema, publicMemberListSchema, type AdminMemberListInput, type PublicMemberListInput } from './schemas';
import type { AdminMember, AdminMemberListItem, AdminMemberPage, PublicMember, PublicMemberDetail, PublicMemberPage } from './types';

/** Global public gate: published AND consented. */
const isPublic = and(eq(memberProfile.state, 'published'), isNotNull(memberProfile.consentConfirmedAt));

/** Explicit public column list; user links, consent data and flags are never selected. */
const publicColumns = {
  id: memberProfile.id,
  slug: memberProfile.slug,
  displayName: memberProfile.displayName,
  avatarAssetId: memberProfile.avatarAssetId,
  games: memberProfile.games,
  publicRoleKeys: memberProfile.publicRoleKeys,
};

type PublicRow = { id: string; slug: string; displayName: string; avatarAssetId: string | null; games: Game[]; publicRoleKeys: PublicRoleKey[] };

async function toPublic(db: Executor, rows: PublicRow[]): Promise<PublicMember[]> {
  const avatars = await loadPublicImages(
    db,
    rows.map((row) => row.avatarAssetId),
  );
  return rows.map((row) => ({
    slug: row.slug,
    displayName: row.displayName,
    avatar: row.avatarAssetId ? (avatars.get(row.avatarAssetId) ?? null) : null,
    games: [...row.games],
    publicRoleKeys: [...row.publicRoleKeys],
  }));
}

/** Public member directory (published + consented profiles only). */
export async function listPublicMembers(db: Executor, input: PublicMemberListInput = {}): Promise<PublicMemberPage> {
  const query = parseInput(publicMemberListSchema, input);
  const where = and(
    isPublic,
    query.game ? sql`${memberProfile.games} @> array[${query.game}]::text[]` : undefined,
    query.role ? sql`${memberProfile.publicRoleKeys} @> array[${query.role}]::text[]` : undefined,
    query.q ? foldedContains([memberProfile.displayName], query.q) : undefined,
  );
  const [totalRow] = await db.select({ total: count() }).from(memberProfile).where(where);
  const total = totalRow?.total ?? 0;
  const rows = await db
    .select(publicColumns)
    .from(memberProfile)
    .where(where)
    .orderBy(asc(memberProfile.sortOrder), asc(sql`lower(${memberProfile.displayName})`), asc(memberProfile.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  return { items: await toPublic(db, rows), total, page: query.page, pageCount: pageCount(total, query.pageSize) };
}

/**
 * Public profile with the requested locale's published biography (or explicit absence).
 * Draft, hidden, unconsented and unknown profiles all return `null` identically.
 */
export async function getPublicMember(db: Executor, slug: string, locale: Locale): Promise<PublicMemberDetail | null> {
  if (typeof slug !== 'string' || slug.length > 80 || !SLUG_PATTERN.test(slug) || !LOCALES.includes(locale)) return null;
  const [row] = await db
    .select(publicColumns)
    .from(memberProfile)
    .where(and(eq(memberProfile.slug, slug), isPublic))
    .limit(1);
  if (!row) return null;
  const [[member], biography] = await Promise.all([toPublic(db, [row]), publishedProseFor(db, { kind: 'member', id: row.id }, locale)]);
  return { ...member!, biography };
}

function adminItem(row: typeof memberProfile.$inferSelect, biography: AdminMemberListItem['biography']): AdminMemberListItem {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    state: row.state,
    consentConfirmedAt: row.consentConfirmedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    games: row.games,
    publicRoleKeys: row.publicRoleKeys,
    avatarAssetId: row.avatarAssetId,
    sortOrder: row.sortOrder,
    version: row.version,
    biography,
    isFixture: row.isFixture,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Admin profile list. Requires `members.edit`. */
export async function listMembersForAdmin(db: Executor, actor: Actor, input: AdminMemberListInput = {}): Promise<AdminMemberPage> {
  await authorize(db, actor, 'members.edit', { intent: 'read', action: 'member.list', entityType: 'member_profile' });
  const query = parseInput(adminMemberListSchema, input);
  const conditions: (SQL | undefined)[] = [
    query.state ? eq(memberProfile.state, query.state) : undefined,
    query.q ? foldedContains([memberProfile.displayName, memberProfile.slug], query.q) : undefined,
  ];
  const where = and(...conditions);
  const [totalRow] = await db.select({ total: count() }).from(memberProfile).where(where);
  const total = totalRow?.total ?? 0;
  const rows = await db
    .select()
    .from(memberProfile)
    .where(where)
    .orderBy(asc(memberProfile.sortOrder), asc(sql`lower(${memberProfile.displayName})`), desc(memberProfile.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  const statuses = await loadProseStatuses(
    db,
    'member',
    rows.map((row) => row.id),
  );
  return {
    items: rows.map((row) => adminItem(row, statuses.get(row.id) ?? { cs: 'none', en: 'none' })),
    total,
    page: query.page,
    pageCount: pageCount(total, query.pageSize),
  };
}

/** Full admin profile incl. both locales' biography drafts. Requires `members.edit`. */
export async function getMemberForAdmin(db: Executor, actor: Actor, id: string): Promise<AdminMember | null> {
  await authorize(db, actor, 'members.edit', { intent: 'read', action: 'member.read', entityType: 'member_profile', entityId: id });
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select().from(memberProfile).where(eq(memberProfile.id, id)).limit(1);
  if (!row) return null;
  const biographyDetail = await loadProseAdminDetail(db, { kind: 'member', id });
  return {
    ...adminItem(row, { cs: biographyDetail.cs.status, en: biographyDetail.en.status }),
    userId: row.userId,
    biographyDetail,
    createdAt: row.createdAt.toISOString(),
  };
}
