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
import { getMemberForAdmin } from './queries';
import type { CreateMemberInput, MemberTargetInput, UpdateMemberInput } from './schemas';
import { confirmConsent, createMemberProfile, hideProfile, publishProfile, updateMemberProfile, withdrawConsent } from './service';
import type { AdminMember, MemberMutationResult } from './types';

/*
 * Server actions of the member publication editor. Authorization happens on the server
 * for every call (members.edit / members.publish); match managers and members are denied.
 * Returned records are the admin projection; raw Discord identifiers never leave here.
 */

/** Admin member projection without the linked auth user id (not needed by the editor UI). */
export type AdminMemberView = Omit<AdminMember, 'userId'>;

const idSchema = z.object({ id: z.uuid() });
const consentSchema = z.object({ confirmed: z.literal(true, { error: 'consent_checkbox_required' }) });
const bioTargetSchema =z.object({ memberId: z.uuid(), locale: z.enum(['cs', 'en']), expectedVersion: z.number().int().min(0) });

type Guard = { capability: Capability; intent?: AccessIntent; action: string; locale?: 'cs' | 'en' | null };

async function run<T>(input: unknown, guard: Guard, body: (actor: Principal) => Promise<T>, idKey = 'id'): Promise<ActionResult<T>> {
  try {
    const raw = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[idKey] : null;
    const actor = await guardServerAction(guard.capability, guard.intent ?? 'write', {
      action: guard.action,
      entityType: 'member_profile',
      entityId: auditEntityId(raw),
      locale: guard.locale ?? null,
    });
    return ok(await body(actor));
  } catch (error) {
    return toActionError(error, guard.action);
  }
}

function revalidateMemberViews() {
  revalidatePath('/[locale]/members', 'page');
  revalidatePath('/[locale]/members/[slug]', 'page');
  revalidatePath('/[locale]/admin/members', 'page');
  revalidatePath('/[locale]/admin/members/[id]', 'page');
}

async function snapshot(actor: Principal, id: string): Promise<AdminMemberView> {
  const current = await getMemberForAdmin(getDb(), actor, id);
  if (!current) throw new DomainError('not_found');
  const { userId: _userId, ...view } = current;
  return view;
}

export async function loadMemberAction(input: { id: string }): Promise<ActionResult<AdminMemberView>> {
  return run(input, { capability: 'members.edit', intent: 'read', action: 'member.read' }, async (actor) => {
    const { id } = parseInput(idSchema, input);
    return snapshot(actor, id);
  });
}

/** Creates a draft profile; it stays private until consent is recorded and it is published. */
export async function createMemberAction(input: CreateMemberInput): Promise<ActionResult<{ id: string }>> {
  return run(input, { capability: 'members.edit', action: 'member.create' }, async (actor) => {
    const result = await createMemberProfile(getDb(), actor, input);
    revalidateMemberViews();
    return { id: result.id };
  });
}

export async function updateMemberAction(input: UpdateMemberInput): Promise<ActionResult<AdminMemberView>> {
  return run(input, { capability: 'members.edit', action: 'member.update' }, async (actor) => {
    const result = await updateMemberProfile(getDb(), actor, input);
    revalidateMemberViews();
    return snapshot(actor, result.id);
  });
}

type Change = (db: ReturnType<typeof getDb>, actor: Principal, input: MemberTargetInput) => Promise<MemberMutationResult>;

function change(capability: Capability, action: string, apply: Change) {
  return (input: MemberTargetInput) =>
    run(input, { capability, action }, async (actor) => {
      const result = await apply(getDb(), actor, input);
      revalidateMemberViews();
      return snapshot(actor, result.id);
    });
}

/** Records the member's explicit publication consent (audited as `member.consent.confirm`). */
export async function confirmMemberConsentAction(input: MemberTargetInput & { confirmed: boolean }): Promise<ActionResult<AdminMemberView>> {
  return run(input, { capability: 'members.edit', action: 'member.consent.confirm' }, async (actor) => {
    // The explicit confirmation checkbox is required server-side too, not only in the UI.
    parseInput(consentSchema, { confirmed: input?.confirmed });
    const result = await confirmConsent(getDb(), actor, { id: input.id, expectedVersion: input.expectedVersion });
    revalidateMemberViews();
    return snapshot(actor, result.id);
  });
}

/** Withdraws consent; a published profile is hidden in the same transaction. */
export async function withdrawMemberConsentAction(input: MemberTargetInput): Promise<ActionResult<AdminMemberView>> {
  return change('members.edit', 'member.consent.withdraw', withdrawConsent)(input);
}

/** Publishes the profile; the domain refuses without recorded consent (`consent_required`). */
export async function publishMemberAction(input: MemberTargetInput): Promise<ActionResult<AdminMemberView>> {
  return change('members.publish', 'member.publish', publishProfile)(input);
}

export async function hideMemberAction(input: MemberTargetInput): Promise<ActionResult<AdminMemberView>> {
  return change('members.publish', 'member.hide', hideProfile)(input);
}

// --- Per-locale biography (independent draft/live revisions) --------------------------

function bioLocale(input: unknown): 'cs' | 'en' | null {
  const value = typeof input === 'object' && input !== null ? (input as { locale?: unknown }).locale : null;
  return value === 'cs' || value === 'en' ? value : null;
}

async function bioDetail(actor: Principal, memberId: string, locale: 'cs' | 'en'): Promise<ProseAdminDetail> {
  return (await snapshot(actor, memberId)).biographyDetail[locale];
}

export async function saveMemberBioAction(input: { memberId: string; locale: 'cs' | 'en'; expectedVersion: number; body: unknown }): Promise<ActionResult<ProseAdminDetail>> {
  return run(
    input,
    { capability: 'members.edit', action: 'prose.save', locale: bioLocale(input) },
    async (actor) => {
      const target = parseInput(bioTargetSchema, input);
      await saveProseDraft(getDb(), actor, {
        owner: { kind: 'member', id: target.memberId },
        locale: target.locale,
        expectedVersion: target.expectedVersion,
        body: input.body,
        cover: null,
        kind: 'save',
      });
      return bioDetail(actor, target.memberId, target.locale);
    },
    'memberId',
  );
}

export async function publishMemberBioAction(input: { memberId: string; locale: 'cs' | 'en'; expectedVersion: number }): Promise<ActionResult<ProseAdminDetail>> {
  return run(
    input,
    { capability: 'members.publish', action: 'prose.publish', locale: bioLocale(input) },
    async (actor) => {
      const target = parseInput(bioTargetSchema, input);
      await publishProse(getDb(), actor, { owner: { kind: 'member', id: target.memberId }, locale: target.locale, expectedVersion: target.expectedVersion });
      revalidateMemberViews();
      return bioDetail(actor, target.memberId, target.locale);
    },
    'memberId',
  );
}

export async function unpublishMemberBioAction(input: { memberId: string; locale: 'cs' | 'en'; expectedVersion: number }): Promise<ActionResult<ProseAdminDetail>> {
  return run(
    input,
    { capability: 'members.publish', action: 'prose.unpublish', locale: bioLocale(input) },
    async (actor) => {
      const target = parseInput(bioTargetSchema, input);
      await unpublishProse(getDb(), actor, { owner: { kind: 'member', id: target.memberId }, locale: target.locale, expectedVersion: target.expectedVersion });
      revalidateMemberViews();
      return bioDetail(actor, target.memberId, target.locale);
    },
    'memberId',
  );
}
