import { createHash, randomUUID } from 'node:crypto';
import type { Executor } from '@valkyria/db';
import { sql } from 'drizzle-orm';

export type ThrottleRule = { windowSeconds: number; max: number };

/** Per-account credential sign-in budget (in addition to Better Auth's per-IP limit). */
export const ACCOUNT_SIGN_IN_RULE: ThrottleRule = { windowSeconds: 900, max: 10 };

/**
 * Durable fixed-window counter in `auth_rate_limit` keyed by a hash of the normalized
 * account identifier (the e-mail itself is never stored). Atomic single-statement upsert,
 * so concurrent attempts cannot bypass the limit.
 */
export async function consumeAccountAttempt(
  db: Executor,
  identifier: string,
  rule: ThrottleRule = ACCOUNT_SIGN_IN_RULE,
  now: number = Date.now(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const digest = createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex').slice(0, 40);
  const key = `account:${digest}|/sign-in/email`;
  const windowStartCutoff = now - rule.windowSeconds * 1000;
  const result = await db.execute<{ count: number | string; last_request: number | string }>(sql`
    insert into auth_rate_limit (id, key, count, last_request)
    values (${randomUUID()}, ${key}, 1, ${now})
    on conflict (key) do update set
      count = case when auth_rate_limit.last_request <= ${windowStartCutoff} then 1 else auth_rate_limit.count + 1 end,
      last_request = case when auth_rate_limit.last_request <= ${windowStartCutoff} then ${now} else auth_rate_limit.last_request end
    returning count, last_request`);
  const row = result.rows[0];
  const count = Number(row?.count ?? Number.POSITIVE_INFINITY);
  const windowStart = Number(row?.last_request ?? now);
  if (count <= rule.max) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + rule.windowSeconds * 1000 - now) / 1000)) };
}
