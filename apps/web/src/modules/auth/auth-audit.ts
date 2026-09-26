import type { Executor } from '@valkyria/db';
import { displayLabel } from '@/modules/access/resolve-actor';
import type { Actor, Principal, SessionAssurance } from '@/modules/access/types';
import { recordAudit, type AuditInput } from '@/modules/audit/audit';

const NONE = new Set<never>();

/**
 * Attribution-only principal for authentication audit events. It carries no roles or
 * capabilities and is never used for an authorization decision.
 */
export function auditActor(input: {
  userId: string;
  name: string | null | undefined;
  source: Principal['source'];
  assurance: SessionAssurance;
  sessionId?: string | null;
}): Actor {
  return {
    kind: 'principal',
    userId: input.userId,
    label: displayLabel(input.name, input.source),
    source: input.source,
    sessionId: input.sessionId ?? '',
    assurance: input.assurance,
    intent: 'read',
    status: 'unavailable',
    roles: [],
    capabilities: NONE,
    localGrant: null,
    verifiedAt: null,
  };
}

/** Machine-code sanitizer for provider/library error codes placed in audit summaries. */
export function safeCode(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(value) ? value : 'unknown';
}

/**
 * Best-effort audit write for authentication events: a failed audit insert is logged by
 * name only and never breaks sign-in. Summaries must not contain secrets, tokens, raw
 * session IDs, e-mail addresses or provider payloads (they are redacted again anyway).
 */
export async function auditAuthEvent(db: Executor, input: AuditInput): Promise<void> {
  try {
    await recordAudit(db, input);
  } catch (error) {
    console.error(`[auth] audit write failed (${input.action}): ${error instanceof Error ? error.name : 'unknown'}`);
  }
}
