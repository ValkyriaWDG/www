'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { DomainError, ok, toActionError, type ActionResult } from '@/lib/result';
import type { Capability } from '@/modules/access/capabilities';
import type { AccessIntent, Principal } from '@/modules/access/types';
import { auditEntityId, guardServerAction } from '@/modules/audit/action-guard';
import { parseInput } from '@/modules/prose/domain';
import { publishProse, saveProseDraft, unpublishProse } from '@/modules/prose/service';
import type { ProseAdminDetail } from '@/modules/prose/types';
import { getMatchForAdmin } from './queries';
import type { CreateMatchInput, MatchTargetInput, PostponeMatchInput, RecordResultInput, RescheduleMatchInput, UpdateMatchInput } from './schemas';
import {
  cancelMatch,
  createMatch,
  deleteMatch,
  markLive,
  postponeMatch,
  publishMatch,
  recordResult,
  rescheduleMatch,
  unpublishMatch,
  updateMatch,
} from './service';
import {
  importMatchStatistics,
  removeMatchStatistics,
  updateMatchStatisticsSettings,
  type ImportStatisticsInput,
  type StatisticsSettingsInput,
} from './statistics-service';
import type { AdminMatch, MatchStatisticsView } from './types';

/*
 * Server actions of the match administration. Every action authorizes on the server
 * (`guardServerAction` → `requireCapability`) before touching input, validates with zod
 * (envelope here, full rules in the domain service) and returns a safe `ActionResult`
 * with stable error codes. Client-supplied roles or actor data are never accepted.
 */

const idSchema = z.object({ id: z.uuid() });
const recapTargetSchema = z.object({
  matchId: z.uuid(),
  locale: z.enum(['cs', 'en']),
  expectedVersion: z.number().int().min(0),
});

type Guard = { capability: Capability; intent?: AccessIntent; action: string; locale?: 'cs' | 'en' | null };

function rawId(input: unknown, key = 'id'): string | null {
  return typeof input === 'object' && input !== null ? auditEntityId((input as Record<string, unknown>)[key]) : null;
}

async function run<T>(input: unknown, guard: Guard, body: (actor: Principal) => Promise<T>, idKey = 'id'): Promise<ActionResult<T>> {
  try {
    const actor = await guardServerAction(guard.capability, guard.intent ?? 'write', {
      action: guard.action,
      entityType: 'match',
      entityId: rawId(input, idKey),
      locale: guard.locale ?? null,
    });
    return ok(await body(actor));
  } catch (error) {
    return toActionError(error, guard.action);
  }
}

/** Public lists/details, the home next-match strip and admin views read published state per request. */
function revalidateMatchViews() {
  revalidatePath('/[locale]', 'page');
  revalidatePath('/[locale]/matches', 'page');
  revalidatePath('/[locale]/matches/[slug]', 'page');
  revalidatePath('/[locale]/admin/matches', 'page');
  revalidatePath('/[locale]/admin/matches/[id]', 'page');
}

async function snapshot(actor: Principal, id: string): Promise<AdminMatch> {
  const current = await getMatchForAdmin(getDb(), actor, id);
  if (!current) throw new DomainError('not_found');
  return current;
}

/** Loads the current admin record (e.g. after a conflict), keeping the caller's unsaved values client-side. */
export async function loadMatchAction(input: { id: string }): Promise<ActionResult<AdminMatch>> {
  return run(input, { capability: 'matches.edit', intent: 'read', action: 'match.read' }, async (actor) => {
    const { id } = parseInput(idSchema, input);
    return snapshot(actor, id);
  });
}

/** Creates a draft fixture; the start is given as local date/time in an explicit IANA zone. */
export async function createMatchAction(input: CreateMatchInput): Promise<ActionResult<{ id: string }>> {
  return run(input, { capability: 'matches.edit', action: 'match.create' }, async (actor) => {
    // Once the operational authority is enabled, old action URLs cannot create a
    // second independent schedule. Existing website archive entries stay editable.
    if (getServerEnv().LOGI_EVENT_WRITE_ENABLED) throw new DomainError('invalid_state');
    const result = await createMatch(getDb(), actor, input);
    revalidateMatchViews();
    return { id: result.id };
  });
}

export async function updateMatchAction(input: UpdateMatchInput): Promise<ActionResult<AdminMatch>> {
  return run(input, { capability: 'matches.edit', action: 'match.update' }, async (actor) => {
    const result = await updateMatch(getDb(), actor, input);
    revalidateMatchViews();
    return snapshot(actor, result.id);
  });
}

type Transition = (db: ReturnType<typeof getDb>, actor: Principal, input: MatchTargetInput) => Promise<{ id: string }>;

function transition(capability: Capability, action: string, apply: Transition) {
  return (input: MatchTargetInput) =>
    run(input, { capability, action }, async (actor) => {
      const result = await apply(getDb(), actor, input);
      revalidateMatchViews();
      return snapshot(actor, result.id);
    });
}

export async function publishMatchAction(input: MatchTargetInput): Promise<ActionResult<AdminMatch>> {
  return transition('matches.publish', 'match.publish', publishMatch)(input);
}

export async function unpublishMatchAction(input: MatchTargetInput): Promise<ActionResult<AdminMatch>> {
  return transition('matches.publish', 'match.unpublish', unpublishMatch)(input);
}

export async function cancelMatchAction(input: MatchTargetInput): Promise<ActionResult<AdminMatch>> {
  return transition('matches.edit', 'match.cancel', cancelMatch)(input);
}

export async function markMatchLiveAction(input: MatchTargetInput): Promise<ActionResult<AdminMatch>> {
  return transition('matches.edit', 'match.live', markLive)(input);
}

/** Postpones; the first original start is kept and shown publicly. A new start is optional. */
export async function postponeMatchAction(input: PostponeMatchInput): Promise<ActionResult<AdminMatch>> {
  return run(input, { capability: 'matches.edit', action: 'match.postpone' }, async (actor) => {
    const result = await postponeMatch(getDb(), actor, input);
    revalidateMatchViews();
    return snapshot(actor, result.id);
  });
}

export async function rescheduleMatchAction(input: RescheduleMatchInput): Promise<ActionResult<AdminMatch>> {
  return run(input, { capability: 'matches.edit', action: 'match.reschedule' }, async (actor) => {
    const result = await rescheduleMatch(getDb(), actor, input);
    revalidateMatchViews();
    return snapshot(actor, result.id);
  });
}

/** Records or changes the result (nullable scores, outcome, verification, source, rounds). */
export async function recordMatchResultAction(input: RecordResultInput): Promise<ActionResult<AdminMatch>> {
  return run(input, { capability: 'matches.edit', action: 'match.result' }, async (actor) => {
    const result = await recordResult(getDb(), actor, input);
    revalidateMatchViews();
    return snapshot(actor, result.id);
  });
}

/** Deletes a draft (unpublished) match with its result, rounds and recaps. */
export async function deleteMatchAction(input: MatchTargetInput): Promise<ActionResult<{ id: string }>> {
  return run(input, { capability: 'matches.edit', action: 'match.delete' }, async (actor) => {
    const result = await deleteMatch(getDb(), actor, input);
    revalidateMatchViews();
    return result;
  });
}

// --- Per-locale recap (independent draft/live revisions) ------------------------------

export type RecapCoverInput = { assetId: string; alt: string; caption: string; decorative: boolean } | null;

async function recapDetail(actor: Principal, matchId: string, locale: 'cs' | 'en'): Promise<ProseAdminDetail> {
  return (await snapshot(actor, matchId)).recapDetail[locale];
}

function recapLocale(input: unknown): 'cs' | 'en' | null {
  const value = typeof input === 'object' && input !== null ? (input as { locale?: unknown }).locale : null;
  return value === 'cs' || value === 'en' ? value : null;
}

/** Saves a new draft revision of exactly one locale's recap (never publishes). */
export async function saveMatchRecapAction(input: {
  matchId: string;
  locale: 'cs' | 'en';
  expectedVersion: number;
  body: unknown;
  cover: RecapCoverInput;
}): Promise<ActionResult<ProseAdminDetail>> {
  return run(
    input,
    { capability: 'matches.edit', action: 'prose.save', locale: recapLocale(input) },
    async (actor) => {
      const target = parseInput(recapTargetSchema, input);
      await saveProseDraft(getDb(), actor, {
        owner: { kind: 'match', id: target.matchId },
        locale: target.locale,
        expectedVersion: target.expectedVersion,
        body: input.body,
        cover: input.cover,
        kind: 'save',
      });
      return recapDetail(actor, target.matchId, target.locale);
    },
    'matchId',
  );
}

/** Publishes the current draft of one locale; the other locale is untouched. */
export async function publishMatchRecapAction(input: { matchId: string; locale: 'cs' | 'en'; expectedVersion: number }): Promise<ActionResult<ProseAdminDetail>> {
  return run(
    input,
    { capability: 'matches.publish', action: 'prose.publish', locale: recapLocale(input) },
    async (actor) => {
      const target = parseInput(recapTargetSchema, input);
      await publishProse(getDb(), actor, { owner: { kind: 'match', id: target.matchId }, locale: target.locale, expectedVersion: target.expectedVersion });
      revalidateMatchViews();
      return recapDetail(actor, target.matchId, target.locale);
    },
    'matchId',
  );
}

export async function unpublishMatchRecapAction(input: { matchId: string; locale: 'cs' | 'en'; expectedVersion: number }): Promise<ActionResult<ProseAdminDetail>> {
  return run(
    input,
    { capability: 'matches.publish', action: 'prose.unpublish', locale: recapLocale(input) },
    async (actor) => {
      const target = parseInput(recapTargetSchema, input);
      await unpublishProse(getDb(), actor, { owner: { kind: 'match', id: target.matchId }, locale: target.locale, expectedVersion: target.expectedVersion });
      revalidateMatchViews();
      return recapDetail(actor, target.matchId, target.locale);
    },
    'matchId',
  );
}

/** Imports (or replaces) the CRCON statistics of an HLL match from a configured server or an uploaded scoreboard. */
export async function importMatchStatisticsAction(input: ImportStatisticsInput): Promise<ActionResult<MatchStatisticsView>> {
  return run(
    input,
    { capability: 'matches.edit', action: 'match.statistics.import' },
    async (actor) => {
      const result = await importMatchStatistics(getDb(), actor, input);
      revalidateMatchViews();
      return result;
    },
    'matchId',
  );
}

export async function updateMatchStatisticsSettingsAction(input: StatisticsSettingsInput): Promise<ActionResult<MatchStatisticsView>> {
  return run(
    input,
    { capability: 'matches.edit', action: 'match.statistics.update' },
    async (actor) => {
      const result = await updateMatchStatisticsSettings(getDb(), actor, input);
      revalidateMatchViews();
      return result;
    },
    'matchId',
  );
}

export async function removeMatchStatisticsAction(input: { matchId: string }): Promise<ActionResult<{ matchId: string }>> {
  return run(
    input,
    { capability: 'matches.edit', action: 'match.statistics.remove' },
    async (actor) => {
      const result = await removeMatchStatistics(getDb(), actor, input);
      revalidateMatchViews();
      return result;
    },
    'matchId',
  );
}
