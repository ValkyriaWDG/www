'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { DomainError, ok, toActionError, type ActionResult } from '@/lib/result';
import { guardServerAction } from '@/modules/audit/action-guard';
import type { LogiCommandInput, LogiCommandOutcome, LogiEventEditor } from './logi-command-contract';
import { loadLogiEventForEditor, submitLogiEventCommand } from './logi-command-service';

export async function submitLogiMatchAction(input: LogiCommandInput): Promise<ActionResult<LogiCommandOutcome>> {
  try {
    const actor = await guardServerAction('matches.edit', 'write', { action: 'logi.match.command', entityType: 'match', entityId: null });
    const result = await submitLogiEventCommand(getDb(), actor, input, getServerEnv());
    revalidatePath('/[locale]/admin/matches/logi', 'page');
    return ok(result);
  } catch (error) { return toActionError(error, 'logi.match.command'); }
}

export async function loadLogiMatchAction(input: { game: 'hll' | 'wardogs'; id: string }): Promise<ActionResult<LogiEventEditor>> {
  try {
    const actor = await guardServerAction('matches.edit', 'read', { action: 'logi.match.read', entityType: 'match', entityId: null });
    const checked = z.strictObject({ game: z.enum(['hll', 'wardogs']), id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/) }).safeParse(input);
    if (!checked.success) throw new DomainError('validation');
    return ok(await loadLogiEventForEditor(getDb(), actor, checked.data.game, checked.data.id, getServerEnv()));
  } catch (error) { return toActionError(error, 'logi.match.read'); }
}
