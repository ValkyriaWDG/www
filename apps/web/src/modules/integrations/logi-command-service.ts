import 'server-only';
import { createHash } from 'node:crypto';
import { logiCommand, type Executor } from '@valkyria/db';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import type { AccessEnv } from '@/modules/access/config';
import { assertCanForGames } from '@/modules/access/policy';
import type { Principal } from '@/modules/access/types';
import { logiProviderConfigFromEnv, readLogiActorToken, resolveLogiConfig } from '@/modules/auth/logi-provider';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { configuredLogiSources } from './logi-config';
import { createLogiCommandClient, LogiCommandError } from './logi-command-client';
import { logiCommandInputSchema, logiCommandReceiptSchema, logiEventCommandSchema, type LogiCommandInput, type LogiCommandOutcome } from './logi-command-contract';

async function authorizedClient(db: Executor, actor: Principal, game: GameRoute, env: AccessEnv, fetchImpl: typeof fetch, intent: 'read' | 'write') {
  assertCanForGames(actor, 'matches.edit', [GAME_REGISTRY[game].db], intent);
  if (actor.assurance !== 'logi' || env.LOGI_MEMBERSHIP_SOURCE !== 'logi') throw new DomainError('unavailable');
  const source = configuredLogiSources(env, 'commands').find((entry) => entry.gameId === GAME_REGISTRY[game].logi);
  // Same normalized origin the sign-in provider uses (case, default port, trailing slash).
  const issuer = resolveLogiConfig(logiProviderConfigFromEnv(env))?.issuer;
  if (!source || !issuer || source.origin !== issuer) throw new DomainError('unavailable');
  const binding = await readLogiActorToken(db, actor.sessionId, actor.userId, logiProviderConfigFromEnv(env), env.BETTER_AUTH_SECRET ?? '', { fetchImpl });
  if (!binding || binding.guildId !== source.guildId) throw new DomainError('unavailable');
  return { client: createLogiCommandClient(source, binding.token, fetchImpl), source };
}

/** Browser input contains only an operation, immutable request ID and user-editable fields. */
export async function submitLogiEventCommand(db: Executor, actor: Principal, raw: unknown, env: AccessEnv, fetchImpl: typeof fetch = fetch): Promise<LogiCommandOutcome> {
  const checked = logiCommandInputSchema.safeParse(raw);
  if (!checked.success) throw new DomainError('validation');
  const input = checked.data;
  const { source } = await authorizedClient(db, actor, input.game, env, fetchImpl, 'write');
  const bodyHash = createHash('sha256').update(JSON.stringify(input.command)).digest('hex');
  // The source binding survives a service key rotation; Logi rechecks the current key's
  // grant and policy even on an idempotent replay. A changed client/source is a new authority.
  const scopeKey = createHash('sha256').update(JSON.stringify([source.sourceInstanceId, source.origin, source.guildId, source.gameId, env.LOGI_CLIENT_ID])).digest('hex');
  const journal = await db.transaction(async (tx) => {
    const inserted = await tx.insert(logiCommand).values({ id: input.requestId, userId: actor.userId, scopeKey, sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId, bodyHash, body: input.command }).onConflictDoNothing().returning({ id: logiCommand.id });
    const [stored] = await tx.select().from(logiCommand).where(eq(logiCommand.id, input.requestId)).for('update');
    if (!stored || stored.userId !== actor.userId || stored.scopeKey !== scopeKey || stored.bodyHash !== bodyHash) throw new DomainError('conflict');
    const unresolved = inserted.length === 0 && stored.state === 'pending';
    if (unresolved && !stored.errorCode) await tx.update(logiCommand).set({ errorCode: 'unconfirmed' }).where(eq(logiCommand.id, stored.id));
    return { maySend: !stored.nextAttemptAt || stored.nextAttemptAt <= new Date(), unresolved };
  });
  if (!journal.maySend) return { state: 'pending', code: 'rate_limited', requestId: input.requestId };
  try {
    // Journal locks can wait. Revalidate the durable session and central binding
    // after that await, immediately before releasing a bearer to the write endpoint.
    const { client } = await authorizedClient(db, actor, input.game, env, fetchImpl, 'write');
    const receipt = await client.submit(input.command, input.requestId);
    await db.update(logiCommand).set({ state: 'confirmed', receipt, errorCode: null, nextAttemptAt: null, updatedAt: new Date() }).where(and(eq(logiCommand.id, input.requestId), eq(logiCommand.userId, actor.userId)));
    return { state: 'confirmed', receipt };
  } catch (error) {
    const code = error instanceof LogiCommandError ? error.code : 'unavailable';
    const state = journal.unresolved || !(error instanceof LogiCommandError) || error.uncertain ? 'pending' : 'rejected';
    // A lost receipt write is an unknown outcome too; keep the request's original ID.
    const nextAttemptAt = error instanceof LogiCommandError && error.retryAfterMs !== null ? new Date(Date.now() + Math.max(0, Math.min(86_400_000, error.retryAfterMs))) : null;
    // Denial of a retry cannot establish that an earlier attempt never committed.
    // A concurrent retry marks uncertainty before dispatch, fencing late responses.
    await db.update(logiCommand).set({ state: state === 'rejected' ? sql`case when ${logiCommand.state} = 'pending' and ${logiCommand.errorCode} is not null then 'pending' else 'rejected' end` : state, errorCode: code, nextAttemptAt, updatedAt: new Date() }).where(and(eq(logiCommand.id, input.requestId), eq(logiCommand.userId, actor.userId), ne(logiCommand.state, 'confirmed'))).catch(() => {});
    const [current] = await db.select({ state: logiCommand.state, receipt: logiCommand.receipt }).from(logiCommand).where(and(eq(logiCommand.id, input.requestId), eq(logiCommand.userId, actor.userId))).limit(1).catch(() => []);
    if (current?.state === 'confirmed') {
      const receipt = logiCommandReceiptSchema.safeParse(current.receipt);
      if (receipt.success) return { state: 'confirmed', receipt: receipt.data };
    }
    return { state: current?.state === 'pending' ? 'pending' : state, code, requestId: input.requestId };
  }
}

export async function loadLogiEventForEditor(db: Executor, actor: Principal, game: GameRoute, id: string, env: AccessEnv, fetchImpl: typeof fetch = fetch) {
  const { client } = await authorizedClient(db, actor, game, env, fetchImpl, 'read');
  return client.load(id);
}

/** Only the signed-in author's unresolved requests can be resumed after reload. */
export async function pendingLogiEventCommands(db: Executor, actor: Principal): Promise<LogiCommandInput[]> {
  const rows = await db.select().from(logiCommand).where(and(eq(logiCommand.userId, actor.userId), eq(logiCommand.state, 'pending'))).orderBy(desc(logiCommand.createdAt)).limit(20);
  return rows.flatMap((row) => {
    const command = logiEventCommandSchema.safeParse(row.body);
    const game = row.gameId === 'wardogs' ? 'wardogs' : row.gameId === 'hell_let_loose' ? 'hll' : null;
    if (!command.success || !game) return [];
    try { assertCanForGames(actor, 'matches.edit', [GAME_REGISTRY[game].db], 'read'); } catch { return []; }
    return [{ requestId: row.id, game, command: command.data }];
  });
}
