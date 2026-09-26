'use server';

import { z } from 'zod';
import { getDb } from '@/lib/db';
import { ok, toActionError, type ActionResult } from '@/lib/result';
import type { Capability } from '@/modules/access/capabilities';
import { requireCapability } from '@/modules/access/server';
import type { AccessIntent } from '@/modules/access/types';
import {
  addTranslation,
  archiveDocument,
  createDocument,
  deleteDocument,
  duplicateDocument,
  getEditorState,
  listRevisions,
  restoreRevision,
  saveDraft,
  unarchiveDocument,
  type CreateDocumentResult,
  type SaveDraftResult,
} from './editor';
import {
  addTranslationSchema,
  createDocumentSchema,
  documentVersionSchema,
  duplicateDocumentSchema,
  listRevisionsSchema,
  parseInput,
  reapproveSchema,
  restoreRevisionSchema,
  saveDraftSchema,
  scheduleIdSchema,
  scheduleSchema,
  translationVersionSchema,
  uuidSchema,
  type AddTranslationInput,
  type CreateDocumentInput,
  type DocumentVersionInput,
  type ReapproveInput,
  type RestoreRevisionInput,
  type SaveDraftInput,
  type ScheduleInput,
  type TranslationVersionInput,
} from './inputs';
import { publishTranslation, unpublishTranslation } from './publication';
import { cancelSchedule, reapproveSchedule, scheduleTranslation, type ScheduleResult } from './schedule';
import type { DocumentEditorState, PublishResult, RevisionSummary, ScheduleDTO, TranslationMutationResult } from './types';

/**
 * Server actions of the editorial administration. Every action is a public POST
 * endpoint: it resolves the actor from the session and asserts the capability with the
 * required intent (writes need a ≤60 s role snapshot) BEFORE validating input with the
 * exported schemas and calling the use case (which authorizes and validates again).
 * Results are `ActionResult` values with stable machine codes; raw errors never leak.
 */

async function run<T>(
  context: string,
  capability: Capability,
  intent: AccessIntent,
  body: (actor: Awaited<ReturnType<typeof requireCapability>>) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const actor = await requireCapability(capability, intent);
    return ok(await body(actor));
  } catch (error) {
    return toActionError(error, context);
  }
}

/** Creates a news post and its first draft in the chosen content language. */
export async function createNewsAction(input: CreateDocumentInput): Promise<ActionResult<CreateDocumentResult>> {
  return run('content.create', 'content.edit', 'write', (actor) => createDocument(getDb(), actor, parseInput(createDocumentSchema, input)));
}

/** Adds the other language as an EMPTY draft (never copies or translates text). */
export async function addTranslationAction(input: AddTranslationInput): Promise<ActionResult<TranslationMutationResult & { slug: string }>> {
  return run('content.translation.create', 'content.edit', 'write', (actor) => addTranslation(getDb(), actor, parseInput(addTranslationSchema, input)));
}

/** Manual save or debounced autosave of exactly one translation's draft; never publishes. */
export async function saveDraftAction(input: SaveDraftInput): Promise<ActionResult<SaveDraftResult>> {
  return run('content.save', 'content.edit', 'write', (actor) => saveDraft(getDb(), actor, parseInput(saveDraftSchema, input)));
}

/** Restores a revision of the same translation into a new draft revision (live is unchanged). */
export async function restoreRevisionAction(input: RestoreRevisionInput): Promise<ActionResult<TranslationMutationResult>> {
  return run('content.revision.restore', 'content.edit', 'write', (actor) => restoreRevision(getDb(), actor, parseInput(restoreRevisionSchema, input)));
}

/** Fresh editor state (conflict review, reload latest, state refresh after a mutation). */
export async function getEditorStateAction(input: { documentId: string }): Promise<ActionResult<DocumentEditorState>> {
  return run('content.read', 'content.read_private', 'read', (actor) =>
    getEditorState(getDb(), actor, { documentId: parseInput(z.object({ documentId: uuidSchema }), input).documentId }),
  );
}

export async function listRevisionsAction(input: { translationId: string }): Promise<ActionResult<RevisionSummary[]>> {
  return run('content.revisions', 'content.read_private', 'read', (actor) => listRevisions(getDb(), actor, parseInput(listRevisionsSchema, input)));
}

/** Publishes (or updates) the CURRENT saved draft of exactly this translation. */
export async function publishTranslationAction(input: TranslationVersionInput): Promise<ActionResult<PublishResult & { supersededScheduleId: string | null }>> {
  return run('content.publish', 'content.publish', 'write', (actor) => publishTranslation(getDb(), actor, parseInput(translationVersionSchema, input)));
}

/** Removes only this translation's live version; the other language stays as it is. */
export async function unpublishTranslationAction(input: TranslationVersionInput): Promise<ActionResult<PublishResult>> {
  return run('content.unpublish', 'content.publish', 'write', (actor) => unpublishTranslation(getDb(), actor, parseInput(translationVersionSchema, input)));
}

export async function scheduleTranslationAction(input: ScheduleInput): Promise<ActionResult<ScheduleResult>> {
  return run('content.schedule', 'content.publish', 'write', (actor) => scheduleTranslation(getDb(), actor, parseInput(scheduleSchema, input)));
}

export async function cancelScheduleAction(input: { scheduleId: string }): Promise<ActionResult<ScheduleDTO>> {
  return run('content.schedule.cancel', 'content.publish', 'write', (actor) => cancelSchedule(getDb(), actor, parseInput(scheduleIdSchema, input)));
}

export async function reapproveScheduleAction(input: ReapproveInput): Promise<ActionResult<ScheduleResult>> {
  return run('content.schedule.reapprove', 'content.publish', 'write', (actor) => reapproveSchedule(getDb(), actor, parseInput(reapproveSchema, input)));
}

export async function duplicateDocumentAction(input: { documentId: string }): Promise<ActionResult<{ documentId: string; translations: Partial<Record<'cs' | 'en', string>> }>> {
  return run('content.duplicate', 'content.edit', 'write', (actor) => duplicateDocument(getDb(), actor, parseInput(duplicateDocumentSchema, input)));
}

export async function archiveDocumentAction(input: DocumentVersionInput): Promise<ActionResult<{ documentId: string; version: number; cancelledSchedules: number }>> {
  return run('content.archive', 'content.publish', 'write', (actor) => archiveDocument(getDb(), actor, parseInput(documentVersionSchema, input)));
}

export async function unarchiveDocumentAction(input: DocumentVersionInput): Promise<ActionResult<{ documentId: string; version: number }>> {
  return run('content.unarchive', 'content.publish', 'write', (actor) => unarchiveDocument(getDb(), actor, parseInput(documentVersionSchema, input)));
}

export async function deleteDocumentAction(input: DocumentVersionInput): Promise<ActionResult<{ documentId: string }>> {
  return run('content.delete', 'content.publish', 'write', (actor) => deleteDocument(getDb(), actor, parseInput(documentVersionSchema, input)));
}
