import { publicationSchedule, siteSetting, type Executor } from '@valkyria/db';
import { eq, sql } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import type { Capability } from '@/modules/access/capabilities';
import { authorizeIssuer, revalidateIssuerFence, type IssuerCheck, type IssuerFence, type IssuerVerdict } from '@/modules/access/issuer';
import type { Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { applyPublication, assertPublishable } from './publication';
import { PUBLISHER_HEARTBEAT_KEY, readHeartbeat, type PublisherHeartbeat } from './schedule';
import {
  MAX_SCHEDULE_ATTEMPTS,
  TRANSIENT_FAILURE_CODES,
  inTransaction,
  lockTranslation,
  readDocument,
  readRevision,
  type ScheduleRow,
} from './store';

/**
 * Durable, idempotent scheduled-publication runner (invoked once per minute by an
 * operator timer through `src/cli/publish-due.ts`; never from a request/setTimeout).
 *
 * 1. Claim due `pending` intents, expired `claimed` leases and retryable `failed`
 *    intents atomically (`FOR UPDATE SKIP LOCKED`): state `claimed`, lease, attempts+1.
 *    The incremented `attempts` value is the claim token of this run.
 * 2. Re-verify the issuer's current authority (no stored session/MFA is replayed).
 *    `revoked`/`unknown` → `blocked` (needs fresh approval; never auto-reactivated).
 * 3. `authorized` → in ONE transaction: re-lock the intent and require it to still be
 *    claimed by this run (a cancellation in between wins), lock the translation,
 *    validate and publish exactly the scheduled revision, mark `completed`, audit.
 * 4. Deterministic problems (archived document, slug taken, invalid revision) →
 *    `failed` with a sanitized code, retried only after reapproval. Database errors →
 *    `failed`/`database_error`, retried automatically with exponential backoff up to
 *    MAX_SCHEDULE_ATTEMPTS. A crash leaves `claimed`; the lease expiry recovers it.
 */

export type VerifyIssuer = (db: Executor, input: IssuerCheck) => Promise<IssuerVerdict>;

export type PublisherOptions = {
  now?: () => Date;
  /** Maximum intents claimed per run (default 25). */
  limit?: number;
  /** Claim lease; an unfinished claim becomes claimable again afterwards (default 5 min). */
  leaseMs?: number;
  /** Trusted test dependency override; production always captures and locks an issuer fence. */
  verifyIssuer?: VerifyIssuer;
  log?: (message: string) => void;
};

export type PublisherRunSummary = {
  ranAt: string;
  claimed: number;
  completed: number;
  blocked: number;
  failed: number;
  skipped: number;
  exhausted: number;
};

/** Service identity used only to attribute audit events. */
export const SCHEDULER_ACTOR: Actor = { kind: 'system', label: 'scheduler', capabilities: new Set<Capability>(['content.publish']) };

const SCHEDULE_CAPABILITY: Capability = 'content.publish';

class PermanentFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

class IssuerInvalidated extends Error {
  constructor(readonly verdict: 'revoked' | 'unknown') { super(`issuer_${verdict}`); }
}

type Claim = Pick<ScheduleRow, 'id' | 'attempts' | 'translationId' | 'locale' | 'revisionId' | 'issuerKind' | 'issuerUserId' | 'issuerLabel' | 'issuerGrantId' | 'issuerGrantVersion' | 'capability'>;

type ClaimRowSql = {
  id: string;
  attempts: number;
  translation_id: string;
  locale: 'cs' | 'en';
  revision_id: string;
  issuer_kind: 'discord' | 'local_admin';
  issuer_user_id: string | null;
  issuer_label: string;
  issuer_grant_id: string | null;
  issuer_grant_version: number | null;
  capability: string;
};

const transientList = sql.join(
  TRANSIENT_FAILURE_CODES.map((code) => sql`${code}`),
  sql`, `,
);

async function claimDue(db: Executor, now: Date, limit: number, leaseMs: number): Promise<Claim[]> {
  const nowIso = now.toISOString();
  const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
  const result = await db.execute<ClaimRowSql>(sql`
    with due as (
      select id from publication_schedule
      where (state = 'pending' and due_at <= ${nowIso}::timestamptz)
         or (state = 'claimed' and claim_expires_at <= ${nowIso}::timestamptz and attempts < ${MAX_SCHEDULE_ATTEMPTS})
         or (state = 'failed' and last_error in (${transientList}) and attempts < ${MAX_SCHEDULE_ATTEMPTS}
             and updated_at + make_interval(secs => least(3600, 60 * power(2, greatest(attempts - 1, 0)))) <= ${nowIso}::timestamptz)
      order by due_at, id
      limit ${limit}
      for update skip locked
    )
    update publication_schedule s
    set state = 'claimed', claimed_at = ${nowIso}::timestamptz, claim_expires_at = ${leaseUntil}::timestamptz,
        attempts = s.attempts + 1, updated_at = ${nowIso}::timestamptz
    from due
    where s.id = due.id
    returning s.id, s.attempts, s.translation_id, s.locale, s.revision_id, s.issuer_kind, s.issuer_user_id,
      s.issuer_label, s.issuer_grant_id, s.issuer_grant_version, s.capability
  `);
  return result.rows.map((row) => ({
    id: row.id,
    attempts: Number(row.attempts),
    translationId: row.translation_id,
    locale: row.locale,
    revisionId: row.revision_id,
    issuerKind: row.issuer_kind,
    issuerUserId: row.issuer_user_id,
    issuerLabel: row.issuer_label,
    issuerGrantId: row.issuer_grant_id,
    issuerGrantVersion: row.issuer_grant_version === null ? null : Number(row.issuer_grant_version),
    capability: row.capability,
  }));
}

/** Expired claims that already used every attempt become permanently `failed`. */
async function failExhaustedClaims(db: Executor, now: Date): Promise<number> {
  return inTransaction(db, async (tx) => {
    const rows = await tx.execute<{ id: string; translation_id: string; locale: 'cs' | 'en'; revision_id: string }>(sql`
      update publication_schedule
      set state = 'failed', last_error = 'attempts_exhausted', claim_expires_at = null, updated_at = ${now.toISOString()}::timestamptz
      where id in (
        select id from publication_schedule
        where state = 'claimed' and claim_expires_at <= ${now.toISOString()}::timestamptz and attempts >= ${MAX_SCHEDULE_ATTEMPTS}
        for update skip locked
      )
      returning id, translation_id, locale, revision_id
    `);
    for (const row of rows.rows) {
      await recordAudit(tx, {
        actor: SCHEDULER_ACTOR,
        action: 'content.schedule.failed',
        outcome: 'failure',
        capability: SCHEDULE_CAPABILITY,
        entityType: 'publication_schedule',
        entityId: row.id,
        translationId: row.translation_id,
        locale: row.locale,
        summary: { scheduleId: row.id, revisionId: row.revision_id, code: 'attempts_exhausted' },
      });
    }
    return rows.rows.length;
  });
}

function issuerSummary(claim: Claim) {
  return {
    kind: claim.issuerKind,
    label: claim.issuerLabel,
    userId: claim.issuerUserId,
    grantId: claim.issuerGrantId,
    grantVersion: claim.issuerGrantVersion,
  };
}

/** Locks the intent and confirms this run still owns the claim. */
async function lockOwnedClaim(tx: Executor, claim: Claim): Promise<ScheduleRow | null> {
  const [row] = await tx.select().from(publicationSchedule).where(eq(publicationSchedule.id, claim.id)).for('update');
  if (!row || row.state !== 'claimed' || row.attempts !== claim.attempts) return null;
  return row;
}

type Outcome = 'completed' | 'blocked' | 'failed' | 'skipped';

async function blockClaim(db: Executor, claim: Claim, verdict: Exclude<IssuerVerdict, 'authorized'> | 'invalid_capability', now: Date): Promise<Outcome> {
  return inTransaction(db, async (tx) => {
    const row = await lockOwnedClaim(tx, claim);
    if (!row) return 'skipped';
    const code = verdict === 'invalid_capability' ? 'invalid_capability' : `issuer_${verdict}`;
    await tx
      .update(publicationSchedule)
      .set({ state: 'blocked', lastError: code, claimExpiresAt: null, updatedAt: now })
      .where(eq(publicationSchedule.id, claim.id));
    await recordAudit(tx, {
      actor: SCHEDULER_ACTOR,
      action: 'content.schedule.blocked',
      outcome: 'denied',
      capability: SCHEDULE_CAPABILITY,
      entityType: 'publication_schedule',
      entityId: claim.id,
      translationId: claim.translationId,
      locale: claim.locale,
      summary: { scheduleId: claim.id, revisionId: claim.revisionId, code, issuer: issuerSummary(claim) },
    });
    return 'blocked';
  });
}

async function failClaim(db: Executor, claim: Claim, code: string, now: Date): Promise<Outcome> {
  return inTransaction(db, async (tx) => {
    const row = await lockOwnedClaim(tx, claim);
    if (!row) return 'skipped';
    await tx
      .update(publicationSchedule)
      .set({ state: 'failed', lastError: code, claimExpiresAt: null, updatedAt: now })
      .where(eq(publicationSchedule.id, claim.id));
    await recordAudit(tx, {
      actor: SCHEDULER_ACTOR,
      action: 'content.schedule.failed',
      outcome: 'failure',
      capability: SCHEDULE_CAPABILITY,
      entityType: 'publication_schedule',
      entityId: claim.id,
      translationId: claim.translationId,
      locale: claim.locale,
      summary: { scheduleId: claim.id, revisionId: claim.revisionId, code, attempts: claim.attempts, issuer: issuerSummary(claim) },
    });
    return 'failed';
  });
}

async function publishClaim(db: Executor, claim: Claim, now: Date, fence: IssuerFence | undefined, clock: () => Date): Promise<Outcome> {
  return inTransaction(db, async (tx) => {
    const schedule = await lockOwnedClaim(tx, claim);
    if (!schedule) return 'skipped';
    const translation = await lockTranslation(tx, schedule.translationId);
    const document = await readDocument(tx, translation.documentId, 'share');
    if (document.archivedAt) throw new PermanentFailure('document_archived');
    const revision = await readRevision(tx, translation.id, schedule.revisionId).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === 'not_found') throw new PermanentFailure('revision_missing');
      throw error;
    });
    try {
      await assertPublishable(tx, document, revision);
    } catch (error) {
      if (error instanceof DomainError) throw new PermanentFailure('not_publishable');
      throw error;
    }
    let result: Awaited<ReturnType<typeof applyPublication>>;
    if (fence) {
      const verdict = await revalidateIssuerFence(tx, fence, clock);
      if (verdict !== 'authorized') throw new IssuerInvalidated(verdict);
    }
    try {
      result = await applyPublication(tx, { translation, revision, now });
    } catch (error) {
      if (error instanceof DomainError) throw new PermanentFailure(error.code === 'slug_taken' ? 'slug_taken' : 'not_publishable');
      throw error;
    }
    await tx
      .update(publicationSchedule)
      .set({ state: 'completed', completedAt: now, claimExpiresAt: null, lastError: null, updatedAt: now })
      .where(eq(publicationSchedule.id, schedule.id));
    await recordAudit(tx, {
      actor: SCHEDULER_ACTOR,
      action: 'content.publish',
      outcome: 'success',
      capability: SCHEDULE_CAPABILITY,
      entityType: 'content_document',
      entityId: document.id,
      translationId: translation.id,
      locale: translation.locale,
      summary: {
        mode: 'scheduled',
        scheduleId: schedule.id,
        revisionId: revision.id,
        slug: result.slug,
        previousSlug: result.previousSlug,
        alreadyLive: result.noop,
        issuer: issuerSummary(claim),
      },
    });
    // Publication or audit writes can themselves wait on locks. Retain the same
    // row lock and check expiry again as the transaction's final awaited work.
    // Failure rolls back the live pointer, completion and success audit together.
    if (fence) {
      const verdict = await revalidateIssuerFence(tx, fence, clock);
      if (verdict !== 'authorized') throw new IssuerInvalidated(verdict);
    }
    return 'completed';
  });
}

function errorCode(error: unknown): string {
  if (error instanceof PermanentFailure) return error.code;
  return 'database_error';
}

async function writeHeartbeat(db: Executor, now: Date, summary: PublisherRunSummary | null, previous: PublisherHeartbeat | null) {
  const value: PublisherHeartbeat = {
    lastRunAt: now.toISOString(),
    lastSuccessAt: summary ? now.toISOString() : (previous?.lastSuccessAt ?? null),
    processed: summary?.claimed ?? 0,
    completed: summary?.completed ?? 0,
    blocked: summary?.blocked ?? 0,
    failed: summary?.failed ?? 0,
  };
  await db
    .insert(siteSetting)
    .values({ key: PUBLISHER_HEARTBEAT_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: siteSetting.key, set: { value, version: sql`${siteSetting.version} + 1`, updatedAt: now } });
}

/**
 * Runs one publisher pass. Throws only on infrastructure failure (e.g. the claim query
 * cannot run); individual intent failures are recorded on the intent and in the audit log.
 */
export async function runPublisher(db: Executor, options: PublisherOptions = {}): Promise<PublisherRunSummary> {
  const clock = options.now ?? (() => new Date());
  const now = clock();
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);
  const leaseMs = Math.min(Math.max(options.leaseMs ?? 5 * 60_000, 10_000), 60 * 60_000);
  const log = options.log ?? (() => undefined);
  const summary: PublisherRunSummary = { ranAt: now.toISOString(), claimed: 0, completed: 0, blocked: 0, failed: 0, skipped: 0, exhausted: 0 };

  let previous: PublisherHeartbeat | null = null;
  try {
    previous = await readHeartbeat(db);
    summary.exhausted = await failExhaustedClaims(db, now);
    summary.failed += summary.exhausted;
    const claims = await claimDue(db, now, limit, leaseMs);
    summary.claimed = claims.length;

    for (const claim of claims) {
      let outcome: Outcome;
      if (claim.capability !== SCHEDULE_CAPABILITY) {
        outcome = await blockClaim(db, claim, 'invalid_capability', now);
      } else {
        let verdict: IssuerVerdict;
        let fence: IssuerFence | undefined;
        try {
          const input: IssuerCheck = {
            issuerKind: claim.issuerKind,
            issuerUserId: claim.issuerUserId,
            grantId: claim.issuerGrantId,
            grantVersion: claim.issuerGrantVersion,
            capability: SCHEDULE_CAPABILITY,
          };
          if (options.verifyIssuer) {
            verdict = await options.verifyIssuer(db, input);
          } else {
            const authority = await authorizeIssuer(db, input, { now: clock });
            verdict = authority.verdict;
            if (authority.verdict === 'authorized') fence = authority.fence;
          }
        } catch {
          verdict = 'unknown';
        }
        if (verdict !== 'authorized') {
          outcome = await blockClaim(db, claim, verdict === 'revoked' ? 'revoked' : 'unknown', now);
        } else {
          try {
            outcome = await publishClaim(db, claim, now, fence, clock);
          } catch (error) {
            // The failed publication transaction has rolled back before we lock
            // the claim again to record a durable denial.
            if (error instanceof IssuerInvalidated) outcome = await blockClaim(db, claim, error.verdict, clock());
            else {
              const code = errorCode(error);
              // If even recording the failure fails, the claim stays leased and is recovered later.
              outcome = await failClaim(db, claim, code, now).catch(() => 'failed' as const);
            }
          }
        }
      }
      summary[outcome] += 1;
      log(`schedule ${claim.id} (${claim.locale}) → ${outcome}`);
    }
  } catch (error) {
    await writeHeartbeat(db, now, null, previous).catch(() => undefined);
    throw error;
  }
  await writeHeartbeat(db, now, summary, previous);
  return summary;
}
