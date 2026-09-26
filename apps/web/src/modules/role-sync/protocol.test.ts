import { createHmac, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ROLE_SYNC_PATH, verifyEnvelope, type ReceiverConfig } from './protocol';

const now = new Date('2026-09-26T12:00:00.000Z');
const secret = 'synthetic-key-material-not-a-live-secret';
const config: ReceiverConfig = { enabled: true, producer: 'fixture-bot', guildId: '111111111111111111', keys: { current: secret } };
const event = { schemaVersion: 1, eventId: randomUUID(), guildId: config.guildId, userId: '222222222222222222', roleIds: ['333333333333333333'], membershipState: 'present', observedAt: now.toISOString(), sequence: '900719925474099300001' };

function envelope(value: unknown = event, body = JSON.stringify(value), timestamp = String(now.getTime() / 1000)) {
  const nonce = 'a'.repeat(32);
  const signature = createHmac('sha256', secret).update(`POST\n${ROLE_SYNC_PATH}\ncurrent\n${timestamp}\n${nonce}\n${body}`).digest('hex');
  return { method: 'POST', path: ROLE_SYNC_PATH, body: Buffer.from(body), headers: new Headers({ 'x-valkyria-key-id': 'current', 'x-valkyria-timestamp': timestamp, 'x-valkyria-nonce': nonce, 'x-valkyria-signature': signature }) };
}

describe('role-sync wire authentication', () => {
  it('accepts exact UTF-8 bytes and preserves 30-digit decimal ordering without Number', () => {
    expect(verifyEnvelope(envelope(), config, now).event).toEqual(event);
  });
  it('binds method, path, raw body and key ID', () => {
    const signed = envelope();
    for (const tampered of [{ ...signed, method: 'GET' }, { ...signed, path: `${ROLE_SYNC_PATH}?x=1` }, { ...signed, body: Buffer.from(`${signed.body.toString()} `) }]) {
      expect(() => verifyEnvelope(tampered, config, now)).toThrow();
    }
    signed.headers.set('x-valkyria-key-id', 'previous');
    expect(() => verifyEnvelope(signed, { ...config, keys: { previous: secret } }, now)).toThrow();
  });
  it.each([
    { ...event, guildId: '999999999999999999' },
    { ...event, userId: 222222222222222222 },
    { ...event, roleIds: [event.roleIds[0], event.roleIds[0]] },
    { ...event, membershipState: 'left' },
    { ...event, email: 'synthetic@example.invalid' },
    { ...event, sequence: '0' },
    { ...event, observedAt: new Date(now.getTime() + 300_001).toISOString() },
  ])('rejects malformed or foreign-guild projection %#', (value) => {
    expect(() => verifyEnvelope(envelope(value), config, now)).toThrow();
  });
  it('rejects stale/future envelopes, but old observations remain usable for invalidation', () => {
    expect(() => verifyEnvelope(envelope(event, JSON.stringify(event), String(now.getTime() / 1000 - 301)), config, now)).toThrow();
    expect(() => verifyEnvelope(envelope(event, JSON.stringify(event), String(now.getTime() / 1000 + 301)), config, now)).toThrow();
    expect(verifyEnvelope(envelope({ ...event, observedAt: '2026-01-01T00:00:00.000Z' }), config, now).event.observedAt).toBe('2026-01-01T00:00:00.000Z');
  });
  it('rejects oversize, invalid UTF-8, and disabled configurations', () => {
    expect(() => verifyEnvelope(envelope(event, 'x'.repeat(65_537)), config, now)).toThrow();
    expect(() => verifyEnvelope({ ...envelope(), body: Buffer.from([0xff]) }, config, now)).toThrow();
    expect(() => verifyEnvelope(envelope(), { ...config, enabled: false }, now)).toThrow();
  });
});
