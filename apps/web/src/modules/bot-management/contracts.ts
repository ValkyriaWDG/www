import { z } from 'zod';

export const revision = z.string().regex(/^(?:0|[1-9][0-9]{0,18})$/).refine((value) => BigInt(value) <= 9223372036854775807n);
export const snowflake = z.string().regex(/^[1-9][0-9]{16,19}$/);
const printable = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);
export const presentationSchema = z.object({
  defaultLocale: z.enum(['cs', 'en']),
  serverLabels: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/), z.string().trim().min(1).max(60).refine((value) => printable(value) && !/[<>@]/.test(value))).refine((value) => Object.keys(value).length <= 100),
}).strict();
const snapshot = z.object({ revision, settings: presentationSchema }).strict();
const applyState = z.enum(['applied', 'pending', 'error', 'unknown']);
export const settingsSchema = z.object({ schemaVersion: z.literal(1), desired: snapshot, effective: snapshot.nullable(), applyState }).strict().refine((value) => value.applyState !== 'applied' || (value.effective?.revision === value.desired.revision && JSON.stringify(Object.entries(value.effective.settings.serverLabels).sort()) === JSON.stringify(Object.entries(value.desired.settings.serverLabels).sort()) && value.effective.settings.defaultLocale === value.desired.settings.defaultLocale));
export const updateSchema = z.object({ expectedRevision: revision, settings: presentationSchema, reason: z.string().trim().min(1).max(200).refine(printable) }).strict();
export const wireUpdateSchema = updateSchema.extend({ correlationId: z.uuid() });
const observedState = z.enum(['healthy', 'degraded', 'unknown', 'stale']);
export const statusSchema = z.object({
  schemaVersion: z.literal(1), observedAt: z.iso.datetime(),
  runtime: z.object({
    build: z.object({ version: z.string().max(80).regex(/^(?:unknown|\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?)$/), revision: z.string().regex(/^(?:unknown|[a-f0-9]{40})$/) }).strict(),
    startedAt: z.iso.datetime(), observedAt: z.iso.datetime(), discord: z.enum(['connected', 'disconnected', 'unknown']), database: z.enum(['available', 'unavailable', 'unknown']), lease: z.enum(['held', 'lost', 'unknown']), state: observedState,
  }).strict(),
  configuration: z.object({ desiredRevision: revision, effectiveRevision: revision.nullable(), applyState }).strict(),
  roleSync: z.object({ enabled: z.boolean(), state: z.enum(['healthy', 'degraded', 'unknown', 'stale', 'disabled']), pending: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), failed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), oldestPendingAt: z.iso.datetime().nullable(), lastDeliveredAt: z.iso.datetime().nullable() }).strict(),
}).strict();
export type BotSettings = z.infer<typeof settingsSchema>;
export type BotStatus = z.infer<typeof statusSchema>;
export type SettingsUpdate = z.infer<typeof updateSchema>;
export type WireUpdate = z.infer<typeof wireUpdateSchema>;
export type BotErrorCode = 'disabled' | 'unavailable' | 'forbidden' | 'discord_required' | 'conflict' | 'invalid' | 'rate_limited' | 'unknown_outcome';
export class BotError extends Error { constructor(public readonly code: BotErrorCode) { super(code); } }
export type BotView = { enabled: boolean; canConfigure: boolean; status: BotStatus | null; settings: BotSettings | null; receivedAt: string; error: BotErrorCode | null };
