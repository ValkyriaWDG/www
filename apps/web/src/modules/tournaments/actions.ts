'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { DomainError, ok, toActionError, type ActionResult } from '@/lib/result';
import type { Capability } from '@/modules/access/capabilities';
import type { AccessIntent, Principal } from '@/modules/access/types';
import { auditEntityId, guardServerAction } from '@/modules/audit/action-guard';
import { parseInput } from '@/modules/prose/domain';
import { publishProse, saveProseDraft, unpublishProse } from '@/modules/prose/service';
import type { ProseAdminDetail } from '@/modules/prose/types';
import { getTournamentForAdmin } from './queries';
import type { CreateTournamentInput, TournamentTargetInput, UpdateTournamentInput } from './schemas';
import { createTournament, deleteTournament, publishTournament, unpublishTournament, updateTournament } from './service';
import type { AdminTournament } from './types';

/*
 * Server actions of the tournament administration. Every action authorizes on the server
 * (`guardServerAction`) before touching input, validates with zod (envelope here, full
 * rules in the domain service) and returns a safe `ActionResult` with stable error codes.
 */

const idSchema = z.object({ id: z.uuid() });
const descriptionTargetSchema = z.object({
  tournamentId: z.uuid(),
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
      entityType: 'tournament',
      entityId: rawId(input, idKey),
      locale: guard.locale ?? null,
    });
    return ok(await body(actor));
  } catch (error) {
    return toActionError(error, guard.action);
  }
}

/** Public tournament pages, linked match details and the admin views read state per request. */
function revalidateTournamentViews() {
  revalidatePath('/[locale]/[game]/tournaments', 'page');
  revalidatePath('/[locale]/[game]/tournaments/[slug]', 'page');
  revalidatePath('/[locale]/[game]/matches/[slug]', 'page');
  revalidatePath('/[locale]/admin/tournaments', 'page');
  revalidatePath('/[locale]/admin/tournaments/[id]', 'page');
}

async function snapshot(actor: Principal, id: string): Promise<AdminTournament> {
  const current = await getTournamentForAdmin(getDb(), actor, id);
  if (!current) throw new DomainError('not_found');
  return current;
}

/** Loads the current admin record (e.g. after a conflict), keeping unsaved values client-side. */
export async function loadTournamentAction(input: { id: string }): Promise<ActionResult<AdminTournament>> {
  return run(input, { capability: 'matches.edit', intent: 'read', action: 'tournament.read' }, async (actor) => {
    const { id } = parseInput(idSchema, input);
    return snapshot(actor, id);
  });
}

export async function createTournamentAction(input: CreateTournamentInput): Promise<ActionResult<{ id: string }>> {
  return run(input, { capability: 'matches.edit', action: 'tournament.create' }, async (actor) => {
    const result = await createTournament(getDb(), actor, input);
    revalidateTournamentViews();
    return { id: result.id };
  });
}

export async function updateTournamentAction(input: UpdateTournamentInput): Promise<ActionResult<AdminTournament>> {
  return run(input, { capability: 'matches.edit', action: 'tournament.update' }, async (actor) => {
    const result = await updateTournament(getDb(), actor, input);
    revalidateTournamentViews();
    return snapshot(actor, result.id);
  });
}

export async function publishTournamentAction(input: TournamentTargetInput): Promise<ActionResult<AdminTournament>> {
  return run(input, { capability: 'matches.publish', action: 'tournament.publish' }, async (actor) => {
    const result = await publishTournament(getDb(), actor, input);
    revalidateTournamentViews();
    return snapshot(actor, result.id);
  });
}

export async function unpublishTournamentAction(input: TournamentTargetInput): Promise<ActionResult<AdminTournament>> {
  return run(input, { capability: 'matches.publish', action: 'tournament.unpublish' }, async (actor) => {
    const result = await unpublishTournament(getDb(), actor, input);
    revalidateTournamentViews();
    return snapshot(actor, result.id);
  });
}

/** Deletes an unpublished tournament with its descriptions; linked matches are unlinked. */
export async function deleteTournamentAction(input: TournamentTargetInput): Promise<ActionResult<{ id: string }>> {
  return run(input, { capability: 'matches.edit', action: 'tournament.delete' }, async (actor) => {
    const result = await deleteTournament(getDb(), actor, input);
    revalidateTournamentViews();
    return result;
  });
}

// --- Per-locale description (independent draft/live revisions) ------------------------

function descriptionLocale(input: unknown): 'cs' | 'en' | null {
  const value = typeof input === 'object' && input !== null ? (input as { locale?: unknown }).locale : null;
  return value === 'cs' || value === 'en' ? value : null;
}

async function descriptionDetail(actor: Principal, tournamentId: string, locale: 'cs' | 'en'): Promise<ProseAdminDetail> {
  return (await snapshot(actor, tournamentId)).descriptionDetail[locale];
}

/** Saves a new draft revision of exactly one locale's description (never publishes). */
export async function saveTournamentDescriptionAction(input: {
  tournamentId: string;
  locale: 'cs' | 'en';
  expectedVersion: number;
  body: unknown;
}): Promise<ActionResult<ProseAdminDetail>> {
  return run(
    input,
    { capability: 'matches.edit', action: 'prose.save', locale: descriptionLocale(input) },
    async (actor) => {
      const target = parseInput(descriptionTargetSchema, input);
      await saveProseDraft(getDb(), actor, {
        owner: { kind: 'tournament', id: target.tournamentId },
        locale: target.locale,
        expectedVersion: target.expectedVersion,
        body: input.body,
        cover: null,
        kind: 'save',
      });
      return descriptionDetail(actor, target.tournamentId, target.locale);
    },
    'tournamentId',
  );
}

export async function publishTournamentDescriptionAction(input: { tournamentId: string; locale: 'cs' | 'en'; expectedVersion: number }): Promise<ActionResult<ProseAdminDetail>> {
  return run(
    input,
    { capability: 'matches.publish', action: 'prose.publish', locale: descriptionLocale(input) },
    async (actor) => {
      const target = parseInput(descriptionTargetSchema, input);
      await publishProse(getDb(), actor, { owner: { kind: 'tournament', id: target.tournamentId }, locale: target.locale, expectedVersion: target.expectedVersion });
      revalidateTournamentViews();
      return descriptionDetail(actor, target.tournamentId, target.locale);
    },
    'tournamentId',
  );
}

export async function unpublishTournamentDescriptionAction(input: { tournamentId: string; locale: 'cs' | 'en'; expectedVersion: number }): Promise<ActionResult<ProseAdminDetail>> {
  return run(
    input,
    { capability: 'matches.publish', action: 'prose.unpublish', locale: descriptionLocale(input) },
    async (actor) => {
      const target = parseInput(descriptionTargetSchema, input);
      await unpublishProse(getDb(), actor, { owner: { kind: 'tournament', id: target.tournamentId }, locale: target.locale, expectedVersion: target.expectedVersion });
      revalidateTournamentViews();
      return descriptionDetail(actor, target.tournamentId, target.locale);
    },
    'tournamentId',
  );
}
