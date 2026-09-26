import { auditEvent, type AuditOutcome, type Executor, type Locale } from '@valkyria/db';
import type { Capability } from '../access/capabilities';
import type { Actor } from '../access/types';
import { redactSummary } from './redact';

export type AuditInput = {
  actor: Actor;
  action: string;
  outcome: AuditOutcome;
  capability?: Capability | null;
  entityType?: string | null;
  entityId?: string | null;
  translationId?: string | null;
  locale?: Locale | null;
  summary?: Record<string, unknown>;
  requestId?: string | null;
};

function actorFields(actor: Actor) {
  switch (actor.kind) {
    case 'anonymous':
      return { actorUserId: null, actorKind: 'anonymous' as const, actorLabel: 'anonymous' };
    case 'system':
      return { actorUserId: null, actorKind: actor.label.startsWith('scheduler') ? ('scheduler' as const) : ('system' as const), actorLabel: actor.label };
    case 'principal':
      return {
        actorUserId: actor.userId,
        actorKind: actor.source === 'local_admin' ? ('local_admin' as const) : ('discord' as const),
        actorLabel: actor.label,
      };
  }
}

/**
 * Appends a redacted audit event. Pass the transaction executor so privileged changes
 * and their audit record commit (or roll back) together.
 */
export async function recordAudit(executor: Executor, input: AuditInput): Promise<void> {
  await executor.insert(auditEvent).values({
    ...actorFields(input.actor),
    action: input.action,
    outcome: input.outcome,
    capability: input.capability ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    translationId: input.translationId ?? null,
    locale: input.locale ?? null,
    summary: (redactSummary(input.summary ?? {}) as Record<string, unknown>) ?? {},
    requestId: input.requestId ?? null,
  });
}
