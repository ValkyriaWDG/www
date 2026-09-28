import 'server-only';
import { memberProfile, type Executor } from '@valkyria/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import type { Capability } from '@/modules/access/capabilities';
import type { Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { assertUsableAssets } from '@/modules/prose/assets';
import { assertVersion, authorize, authorizeGames, isUniqueViolation, parseInput } from '@/modules/prose/domain';
import { firstFreeSlug, slugify } from '@/modules/prose/slug';
import {
  createMemberSchema,
  MEMBER_SLUG_MAX,
  memberTargetSchema,
  updateMemberSchema,
  type CreateMemberInput,
  type MemberTargetInput,
  type UpdateMemberInput,
} from './schemas';
import type { MemberMutationResult } from './types';

type ProfileRow = typeof memberProfile.$inferSelect;

/** Avatars come from the editorial media library only. */
const AVATAR_SCOPES = ['editorial'] as const;

const returningFields = { id: memberProfile.id, slug: memberProfile.slug, version: memberProfile.version, state: memberProfile.state };

async function guard(db: Executor, actor: Actor, capability: Capability, action: string, input: unknown) {
  const raw = typeof input === 'object' && input !== null ? (input as { id?: unknown }).id : undefined;
  const entityId = typeof raw === 'string' && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
  await authorize(db, actor, capability, { intent: 'write', action, entityType: 'member_profile', entityId });
}

async function lockProfile(db: Executor, id: string, expectedVersion: number): Promise<ProfileRow> {
  const [row] = await db.select().from(memberProfile).where(eq(memberProfile.id, id)).for('update');
  assertVersion(row, expectedVersion);
  return row as ProfileRow;
}

async function slugsTaken(db: Executor, candidates: string[]) {
  const rows = await db.select({ slug: memberProfile.slug }).from(memberProfile).where(inArray(memberProfile.slug, candidates));
  return new Set(rows.map((row) => row.slug));
}

function slugConflict(error: unknown): never {
  if (isUniqueViolation(error, 'member_profile_slug_unique')) throw new DomainError('slug_taken', 'Slug already in use.', { slug: 'slug_taken' });
  throw error;
}

async function audit(db: Executor, actor: Actor, capability: Capability, action: string, id: string, summary: Record<string, unknown>) {
  await recordAudit(db, { actor, action, outcome: 'success', capability, entityType: 'member_profile', entityId: id, summary });
}

/** Creates a draft profile (never public until consent + explicit publication). */
export async function createMemberProfile(db: Executor, actor: Actor, input: CreateMemberInput): Promise<MemberMutationResult> {
  await guard(db, actor, 'members.edit', 'member.create', null);
  const data = parseInput(createMemberSchema, input);
  // A profile is managed by whoever holds the capability for every affiliated game.
  await authorizeGames(db, actor, 'members.edit', data.games ?? [], { action: 'member.create', entityType: 'member_profile' });
  await assertUsableAssets(db, [{ field: 'avatarAssetId', id: data.avatarAssetId }], AVATAR_SCOPES);
  try {
    return await db.transaction(async (tx) => {
      let slug = data.slug;
      if (slug) {
        if ((await slugsTaken(tx, [slug])).size > 0) throw new DomainError('slug_taken', 'Slug already in use.', { slug: 'slug_taken' });
      } else {
        slug = await firstFreeSlug(slugify(data.displayName, MEMBER_SLUG_MAX) || 'clen', MEMBER_SLUG_MAX, (candidates) => slugsTaken(tx, candidates));
      }
      const [row] = await tx
        .insert(memberProfile)
        .values({
          slug,
          displayName: data.displayName,
          games: data.games ?? [],
          publicRoleKeys: data.publicRoleKeys ?? [],
          avatarAssetId: data.avatarAssetId ?? null,
          sortOrder: data.sortOrder ?? 100,
          state: 'draft',
        })
        .returning(returningFields);
      await audit(tx, actor, 'members.edit', 'member.create', row!.id, { slug });
      return row!;
    });
  } catch (error) {
    return slugConflict(error);
  }
}

/** Updates approved public fields. The display name is stored exactly as supplied (trimmed). */
export async function updateMemberProfile(db: Executor, actor: Actor, input: UpdateMemberInput): Promise<MemberMutationResult> {
  await guard(db, actor, 'members.edit', 'member.update', input);
  const data = parseInput(updateMemberSchema, input);
  await assertUsableAssets(db, [{ field: 'avatarAssetId', id: data.avatarAssetId }], AVATAR_SCOPES);
  try {
    return await db.transaction(async (tx) => {
      const current = await lockProfile(tx, data.id, data.expectedVersion);
      const games = [...new Set([...current.games, ...(data.games ?? [])])];
      await authorizeGames(db, actor, 'members.edit', games, { action: 'member.update', entityType: 'member_profile', entityId: current.id });
      if (data.slug && data.slug !== current.slug && (await slugsTaken(tx, [data.slug])).size > 0) {
        throw new DomainError('slug_taken', 'Slug already in use.', { slug: 'slug_taken' });
      }
      const patch: Partial<typeof memberProfile.$inferInsert> = {};
      const changed: string[] = [];
      for (const field of ['displayName', 'slug', 'games', 'publicRoleKeys', 'avatarAssetId', 'sortOrder'] as const) {
        if (data[field] === undefined) continue;
        (patch as Record<string, unknown>)[field] = data[field];
        changed.push(field);
      }
      const [row] = await tx
        .update(memberProfile)
        .set({ ...patch, version: sql`${memberProfile.version} + 1`, updatedAt: new Date() })
        .where(eq(memberProfile.id, current.id))
        .returning(returningFields);
      await audit(tx, actor, 'members.edit', 'member.update', current.id, { fields: changed });
      return row!;
    });
  } catch (error) {
    return slugConflict(error);
  }
}

type Change = { capability: Capability; action: string; apply: (row: ProfileRow, now: Date) => Partial<typeof memberProfile.$inferInsert> };

async function change(db: Executor, actor: Actor, input: MemberTargetInput, spec: Change): Promise<MemberMutationResult> {
  await guard(db, actor, spec.capability, spec.action, input);
  const target = parseInput(memberTargetSchema, input);
  return db.transaction(async (tx) => {
    const current = await lockProfile(tx, target.id, target.expectedVersion);
    await authorizeGames(db, actor, spec.capability, current.games, { action: spec.action, entityType: 'member_profile', entityId: current.id });
    const now = new Date();
    const patch = spec.apply(current, now);
    const [row] = await tx
      .update(memberProfile)
      .set({ ...patch, version: sql`${memberProfile.version} + 1`, updatedAt: now })
      .where(eq(memberProfile.id, current.id))
      .returning(returningFields);
    await audit(tx, actor, spec.capability, spec.action, current.id, { fromState: current.state, toState: row!.state });
    return row!;
  });
}

/** Records that the member approved publication of this profile. */
export function confirmConsent(db: Executor, actor: Actor, input: MemberTargetInput) {
  return change(db, actor, input, {
    capability: 'members.edit',
    action: 'member.consent.confirm',
    apply: (row, now) => {
      if (row.consentConfirmedAt) throw new DomainError('invalid_state', 'Consent already recorded.');
      return { consentConfirmedAt: now };
    },
  });
}

/** Withdraws consent; a published profile is hidden in the same transaction. */
export function withdrawConsent(db: Executor, actor: Actor, input: MemberTargetInput) {
  return change(db, actor, input, {
    capability: 'members.edit',
    action: 'member.consent.withdraw',
    apply: (row) => {
      if (!row.consentConfirmedAt) throw new DomainError('invalid_state', 'No consent recorded.');
      return { consentConfirmedAt: null, ...(row.state === 'published' ? { state: 'hidden' as const } : {}) };
    },
  });
}

/** Publishes the profile. Requires recorded consent. */
export function publishProfile(db: Executor, actor: Actor, input: MemberTargetInput) {
  return change(db, actor, input, {
    capability: 'members.publish',
    action: 'member.publish',
    apply: (row, now) => {
      if (!row.consentConfirmedAt) throw new DomainError('invalid_state', 'Consent is required before publication.', { consent: 'consent_required' });
      if (row.state === 'published') throw new DomainError('invalid_state', 'Already published.');
      return { state: 'published', publishedAt: now };
    },
  });
}

/** Hides the profile (and its biographies) from every public view. */
export function hideProfile(db: Executor, actor: Actor, input: MemberTargetInput) {
  return change(db, actor, input, {
    capability: 'members.publish',
    action: 'member.hide',
    apply: (row) => {
      if (row.state === 'hidden') throw new DomainError('invalid_state', 'Already hidden.');
      return { state: 'hidden' };
    },
  });
}
