import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const ROLE_SYNC_PATH = '/api/integrations/discord/role-sync';
export const MAX_BODY_BYTES = 65_536;
export const ENVELOPE_WINDOW_MS = 300_000;
export const NONCE_RETENTION_MS = 900_000;
const snowflake = z.string().regex(/^[1-9][0-9]{0,19}$/);

/** Independent implementation of the bot v1 contract; no bot runtime dependency. */
export const roleSyncEventSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.uuid(),
  guildId: snowflake,
  userId: snowflake,
  roleIds: z.array(snowflake).max(250).refine((roles) => new Set(roles).size === roles.length),
  membershipState: z.enum(['present', 'left']),
  observedAt: z.iso.datetime({ offset: false }),
  sequence: z.string().regex(/^[1-9][0-9]{0,29}$/),
}).strict().refine((event) => event.membershipState !== 'left' || event.roleIds.length === 0);

export type RoleSyncEvent = z.infer<typeof roleSyncEventSchema>;
export type ReceiverConfig = { enabled: boolean; producer: string; guildId: string; keys: Readonly<Record<string, string>> };
export type VerifiedEnvelope = { event: RoleSyncEvent; producer: string; nonce: string; digest: string; timestamp: number };

export class RoleSyncError extends Error {
  constructor(readonly code: 'DISABLED' | 'INVALID_REQUEST' | 'UNAUTHORIZED' | 'INVALID_EVENT' | 'BODY_TOO_LARGE' | 'BODY_TIMEOUT') {
    super(code);
  }
}

export function validReceiverConfig(config: ReceiverConfig): boolean {
  const keys = Object.entries(config.keys);
  return /^[A-Za-z0-9_-]{1,64}$/.test(config.producer) && snowflake.safeParse(config.guildId).success &&
    keys.length >= 1 && keys.length <= 2 && keys.every(([id, secret]) => /^[A-Za-z0-9_-]{1,64}$/.test(id) && Buffer.byteLength(secret, 'utf8') >= 32);
}

export function verifyEnvelope(
  input: { method: string; path: string; headers: Headers; body: Uint8Array }, config: ReceiverConfig, now: Date,
): VerifiedEnvelope {
  if (!config.enabled) throw new RoleSyncError('DISABLED');
  if (!validReceiverConfig(config)) throw new RoleSyncError('UNAUTHORIZED');
  if (input.method !== 'POST' || input.path !== ROLE_SYNC_PATH) throw new RoleSyncError('INVALID_REQUEST');
  if (input.body.byteLength > MAX_BODY_BYTES) throw new RoleSyncError('BODY_TOO_LARGE');
  const keyId = input.headers.get('x-valkyria-key-id') ?? '';
  const timestamp = input.headers.get('x-valkyria-timestamp') ?? '';
  const nonce = input.headers.get('x-valkyria-nonce') ?? '';
  const signature = input.headers.get('x-valkyria-signature') ?? '';
  const secret = Object.hasOwn(config.keys, keyId) ? config.keys[keyId] : undefined;
  if (!secret || !/^[0-9]{1,12}$/.test(timestamp) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature) ||
      Math.abs(now.getTime() - Number(timestamp) * 1000) > ENVELOPE_WINDOW_MS) throw new RoleSyncError('UNAUTHORIZED');
  const expected = createHmac('sha256', secret).update(`POST\n${ROLE_SYNC_PATH}\n${keyId}\n${timestamp}\n${nonce}\n`).update(input.body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new RoleSyncError('UNAUTHORIZED');
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.body)); }
  catch { throw new RoleSyncError('INVALID_EVENT'); }
  const parsed = roleSyncEventSchema.safeParse(value);
  if (!parsed.success || parsed.data.guildId !== config.guildId || new Date(parsed.data.observedAt).getTime() > now.getTime() + ENVELOPE_WINDOW_MS) {
    throw new RoleSyncError('INVALID_EVENT');
  }
  return { event: parsed.data, producer: config.producer, nonce, digest: createHash('sha256').update(input.body).digest('hex'), timestamp: Number(timestamp) * 1000 };
}
