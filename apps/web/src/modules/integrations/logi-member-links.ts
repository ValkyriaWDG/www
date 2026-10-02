import 'server-only';
import { authSession, logiMemberLink, logiSyncScope, memberProfile, type Executor } from '@valkyria/db';
import { and, eq, sql } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import { authorizeIssuer, revalidateIssuerFence, type IssuerDeps, type IssuerFence } from '@/modules/access/issuer';
import { AccessDeniedError, type Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { GAME_REGISTRY } from '@/modules/games/registry';
import { authorize, authorizeGames, isUniqueViolation, parseInput } from '@/modules/prose/domain';
import { configuredLogiSources, type LogiIntegrationEnv } from './logi-config';
import {
  logiMemberLinkInputSchema,
  logiMemberLinkTargetSchema,
  type LogiMemberLinkInput,
  type LogiMemberLinkTarget,
  type LogiMemberLinkView,
} from './logi-member-link-schemas';
import { readLogiMemberCandidates } from './logi-people';

const context = { action: 'logi.member.link', entityType: 'member_profile' };
const sessionFields = {
  userId: authSession.userId,
  assurance: authSession.assurance,
  expiresAt: authSession.expiresAt,
  subject: authSession.logiSubject,
  issuer: authSession.logiIssuer,
  clientId: authSession.logiClientId,
  sid: authSession.logiSid,
  guildId: authSession.logiGuildId,
  tokenExpiresAt: authSession.logiAccessTokenExpiresAt,
  // An update to any private session binding (including encrypted token) invalidates this observation.
  rowVersion: sql<string>`${authSession}.xmin::text || ':' || ${authSession}.ctid::text`,
};

/** Local publication configuration only: no account linking, Logi mutation or inferred identity. */
export async function readLogiMemberLinks(db: Executor, actor: Actor, profileId: string): Promise<LogiMemberLinkView[]> {
  await authorize(db, actor, 'members.edit', { ...context, intent: 'read', entityId: profileId });
  const [profile] = await db.select().from(memberProfile).where(eq(memberProfile.id, profileId));
  if (!profile) throw new DomainError('not_found');
  await authorizeGames(db, actor, 'members.edit', profile.games, { ...context, entityId: profileId });
  const links = await db.select().from(logiMemberLink).where(eq(logiMemberLink.profileId, profileId));
  return links.map((link) => ({
    profileId,
    game: link.gameId === 'hell_let_loose' ? 'hll' : 'wardogs',
    version: link.version,
    memberId: link.memberId,
    identityId: link.identityId,
    scopeKey: link.scopeKey,
    allowStats: link.allowStats,
    allowRoster: link.allowRoster,
  }));
}

async function changeLink(
  db: Executor,
  env: LogiIntegrationEnv,
  actor: Actor,
  input: LogiMemberLinkInput | LogiMemberLinkTarget,
  remove: boolean,
  deps: IssuerDeps,
) {
  await authorize(db, actor, 'members.publish', { ...context, intent: 'write' });
  if (actor.kind !== 'principal') throw new AccessDeniedError('forbidden', 'members.publish');
  const now = deps.now ?? (() => new Date());
  const [observedSession] = await db.select(sessionFields).from(authSession).where(eq(authSession.id, actor.sessionId));
  if (
    !observedSession ||
    observedSession.userId !== actor.userId ||
    observedSession.assurance !== actor.assurance ||
    observedSession.expiresAt <= now() ||
    (actor.source === 'local_admin' ? actor.assurance !== 'mfa' : !['discord', 'logi'].includes(actor.assurance))
  )
    throw new AccessDeniedError('stale_authorization', 'members.publish');
  const target = parseInput(logiMemberLinkTargetSchema, {
    profileId: input.profileId,
    game: input.game,
    expectedVersion: input.expectedVersion,
  });
  const data = remove ? null : parseInput(logiMemberLinkInputSchema, input);
  const game = GAME_REGISTRY[target.game];
  const [observedProfile] = await db.select().from(memberProfile).where(eq(memberProfile.id, target.profileId));
  if (!observedProfile) throw new DomainError('not_found');
  await authorizeGames(db, actor, 'members.publish', observedProfile.games, { ...context, entityId: target.profileId });
  await authorizeGames(db, actor, 'members.publish', [game.db], { ...context, entityId: target.profileId });
  const games = [...new Set([...observedProfile.games, game.db])];
  const fences: IssuerFence[] = [];
  // Provider I/O occurs before row locks. Every profile affiliation needs current authority.
  for (const scopedGame of observedProfile.games.length ? games : [null, ...games]) {
    const result = await authorizeIssuer(
      db,
      {
        issuerKind: actor.source,
        issuerUserId: actor.userId,
        grantId: actor.localGrant?.id ?? null,
        grantVersion: actor.localGrant?.version ?? null,
        capability: 'members.publish',
        game: scopedGame,
      },
      deps,
    );
    if (result.verdict !== 'authorized')
      throw new AccessDeniedError(result.verdict === 'unknown' ? 'verification_unavailable' : 'forbidden', 'members.publish');
    fences.push(result.fence);
  }
  try {
    await db.transaction(async (tx) => {
      const [profile] = await tx.select().from(memberProfile).where(eq(memberProfile.id, target.profileId)).for('update');
      if (!profile || profile.version !== observedProfile.version) throw new DomainError('conflict');
      if (!remove && !profile.games.includes(game.db)) throw new DomainError('validation', 'Profile must belong to the linked game.');
      const where = and(eq(logiMemberLink.profileId, target.profileId), eq(logiMemberLink.gameId, game.logi));
      const [existing] = await tx.select().from(logiMemberLink).where(where).for('update');
      if ((existing?.version ?? 0) !== target.expectedVersion || (remove && !existing)) throw new DomainError('conflict');
      let binding: { sourceInstanceId: string; guildId: string; gameId: string; scopeKey: string } | null = null;
      if (data) {
        const source = configuredLogiSources(env, 'people').find((s) => s.gameId === game.logi && s.scopeKey === data.scopeKey);
        if (!source) throw new DomainError('unavailable');
        // Synchronization swaps/deletes these rows under this lock. Keep the exact validated
        // projection stable until the publication association commits.
        await tx
          .select({ key: logiSyncScope.scopeKey })
          .from(logiSyncScope)
          .where(eq(logiSyncScope.scopeKey, source.scopeKey))
          .for('share');
        const candidate = (await readLogiMemberCandidates(tx, env, actor, game.db, { now })).find(
          (c) => c.scopeKey === data.scopeKey && c.memberId === data.memberId && c.identityId === data.identityId,
        );
        if (!candidate) throw new DomainError('unavailable', 'Fresh, unambiguous member identity required.');
        binding = { sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId, scopeKey: source.scopeKey };
      }
      for (const fence of fences)
        if ((await revalidateIssuerFence(tx, fence, now)) !== 'authorized')
          throw new AccessDeniedError('stale_authorization', 'members.publish');
      const [session] = await tx.select(sessionFields).from(authSession).where(eq(authSession.id, actor.sessionId)).for('share');
      if (
        !session ||
        session.rowVersion !== observedSession.rowVersion ||
        session.expiresAt <= now() ||
        (actor.assurance === 'logi' &&
          (!session.issuer ||
            !session.clientId ||
            !session.sid ||
            !session.guildId ||
            !session.tokenExpiresAt ||
            session.tokenExpiresAt <= now() ||
            fences.some((fence) => fence.kind !== 'logi' || fence.subject !== session.subject)))
      )
        throw new AccessDeniedError('stale_authorization', 'members.publish');
      if (remove) await tx.delete(logiMemberLink).where(where);
      else if (data && binding) {
        const values = {
          ...binding,
          memberId: data.memberId,
          identityId: data.identityId,
          allowStats: data.allowStats,
          allowRoster: data.allowRoster,
          updatedAt: now(),
        };
        if (existing)
          await tx
            .update(logiMemberLink)
            .set({ ...values, version: existing.version + 1 })
            .where(where);
        else await tx.insert(logiMemberLink).values({ ...values, profileId: target.profileId });
      }
      await recordAudit(tx, {
        actor,
        action: remove ? 'logi.member.unlink' : 'logi.member.link',
        outcome: 'success',
        capability: 'members.publish',
        entityType: 'member_profile',
        entityId: target.profileId,
        summary: { game: game.db, allowStats: data?.allowStats ?? false, allowRoster: data?.allowRoster ?? false },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError('conflict', 'The member already has a publication association.');
    throw error;
  }
}

export function saveLogiMemberLink(db: Executor, env: LogiIntegrationEnv, actor: Actor, input: LogiMemberLinkInput, deps: IssuerDeps = {}) {
  return changeLink(db, env, actor, input, false, deps);
}
export function removeLogiMemberLink(
  db: Executor,
  env: LogiIntegrationEnv,
  actor: Actor,
  input: LogiMemberLinkTarget,
  deps: IssuerDeps = {},
) {
  return changeLink(db, env, actor, input, true, deps);
}
