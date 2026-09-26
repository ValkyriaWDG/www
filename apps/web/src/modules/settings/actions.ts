'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { DomainError, ok, toActionError, type ActionResult } from '@/lib/result';
import { guardServerAction } from '@/modules/audit/action-guard';
import { parseInput } from '@/modules/prose/domain';
import { isSettingKey, SETTING_KEYS, settingSchema } from './schemas';
import { getSettingsForAdmin, updateSetting, type AdminSetting } from './service';

/*
 * "Save settings" for administrators/owners (`settings.manage`). Editors and match
 * managers are denied on the server. All changed keys are validated first (so every
 * invalid field is reported at once), then written in ONE transaction: either every
 * changed setting goes live or none does. Each key keeps its own optimistic version.
 */

const changesSchema = z.object({
  changes: z
    .array(
      z.object({
        key: z.enum(SETTING_KEYS),
        expectedVersion: z.number().int().min(0),
        /** `null` removes the override so the operator default applies again. */
        value: z.unknown(),
      }),
    )
    .min(1)
    .max(SETTING_KEYS.length)
    .refine((changes) => new Set(changes.map((change) => change.key)).size === changes.length, 'duplicates'),
});

export type SettingChange = { key: (typeof SETTING_KEYS)[number]; expectedVersion: number; value: unknown };

function prefixed(key: string, error: unknown): Record<string, string> {
  if (!(error instanceof DomainError) || error.code !== 'validation') throw error;
  const result: Record<string, string> = {};
  for (const [path, code] of Object.entries(error.fieldErrors ?? { _: 'invalid' })) result[path === '_' ? key : `${key}.${path}`] = code;
  return result;
}

/** Current stored settings (e.g. after a conflict); the form keeps the user's unsaved values. */
export async function loadSettingsAction(): Promise<ActionResult<AdminSetting[]>> {
  try {
    const actor = await guardServerAction('settings.manage', 'read', { action: 'settings.read', entityType: 'site_setting' });
    return ok(await getSettingsForAdmin(getDb(), actor));
  } catch (error) {
    return toActionError(error, 'settings.read');
  }
}

export async function saveSettingsAction(input: { changes: SettingChange[] }): Promise<ActionResult<AdminSetting[]>> {
  try {
    const actor = await guardServerAction('settings.manage', 'write', { action: 'settings.update', entityType: 'site_setting' });
    const { changes } = parseInput(changesSchema, input);
    const fieldErrors: Record<string, string> = {};
    for (const change of changes) {
      if (!isSettingKey(change.key) || change.value === null || change.value === undefined) continue;
      try {
        parseInput(settingSchema(change.key), change.value);
      } catch (error) {
        Object.assign(fieldErrors, prefixed(change.key, error));
      }
    }
    if (Object.keys(fieldErrors).length > 0) throw new DomainError('validation', 'Invalid settings.', fieldErrors);

    const db = getDb();
    await db.transaction(async (tx) => {
      for (const change of changes) {
        try {
          await updateSetting(tx, actor, change);
        } catch (error) {
          if (error instanceof DomainError && error.code === 'conflict') throw new DomainError('conflict', 'Setting changed meanwhile.', { [change.key]: 'conflict' });
          throw error;
        }
      }
    });
    // The shell (Discord CTA, footer, background) renders these values on every public page.
    revalidatePath('/[locale]', 'layout');
    return ok(await getSettingsForAdmin(db, actor));
  } catch (error) {
    return toActionError(error, 'settings.update');
  }
}
