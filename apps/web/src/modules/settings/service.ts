import 'server-only';
import { siteSetting, type Executor } from '@valkyria/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DomainError } from '@/lib/result';
import { actorUserId } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { authorize, isUniqueViolation, parseInput } from '@/modules/prose/domain';
import { isSettingKey, SETTING_KEYS, settingSchema, type SettingKey, type SettingValue } from './schemas';

export type AdminSetting<K extends SettingKey = SettingKey> = {
  key: K;
  /** Stored override, or `null` when the environment default applies. */
  value: SettingValue<K> | null;
  /** `0` when no override is stored (pass as `expectedVersion` for the first write). */
  version: number;
  updatedAt: string | null;
  /** Stored value no longer passes validation (e.g. an origin was removed from the allowlist). */
  invalid: boolean;
};

/** All allowlisted settings with their stored overrides. Requires `settings.manage`. */
export async function getSettingsForAdmin(db: Executor, actor: Actor): Promise<AdminSetting[]> {
  await authorize(db, actor, 'settings.manage', { intent: 'read', action: 'settings.read', entityType: 'site_setting' });
  const rows = await db
    .select()
    .from(siteSetting)
    .where(inArray(siteSetting.key, [...SETTING_KEYS]));
  return SETTING_KEYS.map((key) => {
    const row = rows.find((candidate) => candidate.key === key);
    if (!row) return { key, value: null, version: 0, updatedAt: null, invalid: false };
    const parsed = settingSchema(key).safeParse(row.value);
    return {
      key,
      value: parsed.success ? parsed.data : null,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
      invalid: !parsed.success,
    };
  });
}

const updateSettingSchema = z.object({
  key: z.string(),
  expectedVersion: z.number().int().min(0),
  /** `null` removes the override so the environment default applies again. */
  value: z.unknown(),
});
export type UpdateSettingInput = z.input<typeof updateSettingSchema>;

/** Shape-only description for the audit log: never URLs, labels, server names or provenance text. */
function redactedShape(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { cleared: true };
  if (Array.isArray(value)) return { items: value.length, kinds: value.map((item) => (item as { kind?: unknown; game?: unknown }).kind ?? (item as { game?: unknown }).game ?? null) };
  if (typeof value === 'object') {
    const fields = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== null && item !== '').map(([field]) => field);
    return { fields };
  }
  return { type: typeof value };
}

/**
 * Validates and stores one allowlisted setting with optimistic concurrency. Requires
 * `settings.manage` (administrators); editors and match managers are denied. Unknown and
 * `system.*` keys are rejected. The audit summary records only the value's shape.
 */
export async function updateSetting(db: Executor, actor: Actor, input: UpdateSettingInput): Promise<AdminSetting> {
  await authorize(db, actor, 'settings.manage', { intent: 'write', action: 'settings.update', entityType: 'site_setting' });
  const data = parseInput(updateSettingSchema, input);
  if (!isSettingKey(data.key)) throw new DomainError('validation', 'Unknown setting.', { key: 'unknown_setting' });
  const key = data.key;
  const value = data.value === null || data.value === undefined ? null : parseInput(settingSchema(key), data.value);

  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select().from(siteSetting).where(eq(siteSetting.key, key)).for('update');
      const currentVersion = current?.version ?? 0;
      if (currentVersion !== data.expectedVersion) throw new DomainError('conflict');
      const now = new Date();
      let result: AdminSetting;
      if (value === null) {
        if (current) await tx.delete(siteSetting).where(and(eq(siteSetting.key, key), eq(siteSetting.version, currentVersion)));
        result = { key, value: null, version: 0, updatedAt: null, invalid: false };
      } else if (current) {
        const [row] = await tx
          .update(siteSetting)
          .set({ value, version: sql`${siteSetting.version} + 1`, updatedBy: actorUserId(actor), updatedAt: now })
          .where(and(eq(siteSetting.key, key), eq(siteSetting.version, currentVersion)))
          .returning();
        result = { key, value, version: row!.version, updatedAt: row!.updatedAt.toISOString(), invalid: false };
      } else {
        const [row] = await tx.insert(siteSetting).values({ key, value, version: 1, updatedBy: actorUserId(actor), updatedAt: now }).returning();
        result = { key, value, version: row!.version, updatedAt: row!.updatedAt.toISOString(), invalid: false };
      }
      await recordAudit(tx, {
        actor,
        action: 'settings.update',
        outcome: 'success',
        capability: 'settings.manage',
        entityType: 'site_setting',
        entityId: key,
        summary: { key, previousVersion: currentVersion, version: result.version, ...redactedShape(value) },
      });
      return result;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError('conflict');
    throw error;
  }
}
