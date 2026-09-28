'use server';

import { getDb } from '@/lib/db';
import { ok, toActionError, type ActionResult } from '@/lib/result';
import { requireCapability } from '@/modules/access/server';
import { saveManualMeta, type ManualMetaInput } from './admin';

/**
 * Saves a Field Manual article's shared metadata. The actor is resolved with write intent
 * before the use case authorizes the article's game scope and validates the input again.
 */
export async function saveManualMetaAction(input: ManualMetaInput): Promise<ActionResult<{ documentId: string }>> {
  try {
    const actor = await requireCapability('content.edit', 'write');
    return ok(await saveManualMeta(getDb(), actor, input));
  } catch (error) {
    return toActionError(error, 'manual.meta.update');
  }
}
