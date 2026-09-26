import { createHmac } from 'node:crypto';

const HASH_PREFIX = 'h1:';
const DOMAIN = 'valkyria-2fa-backup-code:';

/**
 * One-time recovery codes are stored only as keyed hashes (HMAC-SHA256 with the auth
 * secret). Better Auth's backup-code store receives the plaintext codes once at
 * generation (`encrypt`), which we hash; the verification endpoint's submitted code is
 * hashed by a `before` hook, so the library compares hash to hash and removes the used
 * hash (single use). Plaintext codes are shown to the user once and never persisted.
 */
export function createHashedBackupCodeStore(secret: string) {
  const hashCode = (code: string) =>
    `${HASH_PREFIX}${createHmac('sha256', secret).update(DOMAIN + code.trim()).digest('base64url')}`;
  return {
    hashCode,
    storeBackupCodes: {
      encrypt: async (json: string): Promise<string> => {
        const parsed: unknown = JSON.parse(json);
        if (!Array.isArray(parsed)) throw new Error('Unexpected backup code payload.');
        return JSON.stringify(parsed.map((code) => (typeof code === 'string' && code.startsWith(HASH_PREFIX) ? code : hashCode(String(code)))));
      },
      decrypt: async (stored: string): Promise<string> => stored,
    },
  };
}

export function isHashedBackupCodeList(stored: string): boolean {
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string' && item.startsWith(HASH_PREFIX));
  } catch {
    return false;
  }
}
