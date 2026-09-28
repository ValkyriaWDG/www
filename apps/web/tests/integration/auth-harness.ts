import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { authAccount, authSession, authUser, guildMembership, localAdminGrant, type Database, type Game, type LocalGrantRole } from '@valkyria/db';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import type { AccessEnv } from '@/modules/access/config';
import { createAuth, type Auth, type AuthConfig } from '@/modules/auth/auth';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

export const TEST_ORIGIN = 'http://localhost:3000';
export const TEST_SECRET = 'integration-only-secret-value-0123456789abcdef';
export const GUILD_ID = '100000000000000001';
export const ROLE = {
  member: '200000000000000001',
  editor: '200000000000000002',
  matchManager: '200000000000000003',
  administrator: '200000000000000004',
} as const;
export const ROLE_MAPPING_JSON = JSON.stringify({
  [ROLE.member]: ['member'],
  [ROLE.editor]: ['editor'],
  [ROLE.matchManager]: ['match_manager'],
  [ROLE.administrator]: ['administrator'],
});

export function testAccessEnv(overrides: Partial<AccessEnv> = {}): AccessEnv {
  return {
    DISCORD_GUILD_ID: GUILD_ID,
    DISCORD_BOT_TOKEN: 'synthetic-bot-token',
    DISCORD_API_BASE_URL: 'https://discord.test/api/v10',
    DISCORD_ROLE_MAPPING_JSON: ROLE_MAPPING_JSON,
    LOCAL_ADMIN_LOGIN_ENABLED: true,
    ...overrides,
  };
}

export function testAuthConfig(overrides: Partial<AuthConfig> = {}, access: Partial<AccessEnv> = {}): AuthConfig {
  return {
    nodeEnv: 'test',
    appUrl: TEST_ORIGIN,
    authUrl: TEST_ORIGIN,
    secret: TEST_SECRET,
    discordClientId: '100000000000000099',
    discordClientSecret: 'synthetic-client-secret',
    access: testAccessEnv(access),
    ...overrides,
  };
}

/** Random synthetic snowflake (never a real Discord ID). */
export function syntheticSnowflake(prefix = '3'): string {
  let digits = prefix;
  while (digits.length < 18) digits += String(randomInt(0, 10));
  return digits;
}

export type DiscordMemberState = { status: 'present'; roles: string[] } | { status: 'absent' } | { status: 'error'; httpStatus: number; retryAfter?: string };

/** Fetch stub for the Discord REST boundary: only the configured synthetic guild exists. */
export function createDiscordFetch(members: Map<string, DiscordMemberState>, calls: string[] = []) {
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.pathname);
    const match = url.pathname.match(/^\/api\/v10\/guilds\/(\d+)\/members\/(\d+)$/);
    if (!match) return Response.json({ message: '404: Not Found', code: 0 }, { status: 404 });
    const [, guildId, userId] = match;
    if (guildId !== GUILD_ID) return Response.json({ message: 'Unknown Guild', code: 10004 }, { status: 404 });
    const state = members.get(userId!);
    if (!state || state.status === 'absent') return Response.json({ message: 'Unknown Member', code: 10007 }, { status: 404 });
    if (state.status === 'error') {
      const headers = state.retryAfter ? { 'Retry-After': state.retryAfter } : undefined;
      return Response.json({ message: 'synthetic failure', retry_after: state.retryAfter ? Number(state.retryAfter) : undefined }, { status: state.httpStatus, headers });
    }
    return Response.json({ roles: state.roles, user: { id: userId } }, { status: 200 });
  };
  return impl as typeof fetch;
}

export type Harness = {
  database: TestDatabase;
  db: Database;
  auth: Auth;
  config: AuthConfig;
  members: Map<string, DiscordMemberState>;
  discordCalls: string[];
  request: (path: string, init?: RequestOptions) => Promise<Response>;
  close: () => Promise<void>;
};

export type RequestOptions = {
  method?: string;
  body?: unknown;
  cookies?: CookieJar;
  ip?: string;
  headers?: Record<string, string>;
  origin?: string | null;
};

export async function createHarness(options: { config?: Partial<AuthConfig>; access?: Partial<AccessEnv> } = {}): Promise<Harness> {
  const database = await createTestDatabase();
  const config = testAuthConfig(options.config, options.access);
  const members = new Map<string, DiscordMemberState>();
  const discordCalls: string[] = [];
  const fetchImpl = createDiscordFetch(members, discordCalls);
  const auth = createAuth(database.db, config, { fetchImpl, discord: { sleep: async () => undefined } });
  const request = async (path: string, init: RequestOptions = {}) => {
    const headers = new Headers(init.headers);
    headers.set('x-forwarded-for', init.ip ?? '198.51.100.10');
    if (init.origin !== null) headers.set('origin', init.origin ?? TEST_ORIGIN);
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    const cookieHeader = init.cookies?.header();
    if (cookieHeader) headers.set('cookie', cookieHeader);
    const response = await auth.handler(
      new Request(`${TEST_ORIGIN}/api/auth${path}`, {
        method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: 'manual',
      }),
    );
    init.cookies?.absorb(response);
    return response;
  };
  return { database, db: database.db, auth, config, members, discordCalls, request, close: () => database.drop() };
}

/** Minimal cookie jar honouring Max-Age=0 deletions. */
export class CookieJar {
  readonly values = new Map<string, string>();
  absorb(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';').map((part) => part.trim());
      const index = pair!.indexOf('=');
      const name = pair!.slice(0, index);
      const value = pair!.slice(index + 1);
      const expired = attributes.some((attribute) => /^max-age=0$/i.test(attribute)) || value === '';
      if (expired) this.values.delete(name);
      else this.values.set(name, value);
    }
  }
  header(): string | undefined {
    if (this.values.size === 0) return undefined;
    return [...this.values].map(([name, value]) => `${name}=${value}`).join('; ');
  }
  has(name: string) {
    return this.values.has(name);
  }
}

// --- Synthetic identities -------------------------------------------------------------

export async function insertDiscordUser(db: Database, options: { name?: string; discordUserId?: string } = {}) {
  const userId = randomUUID();
  const discordUserId = options.discordUserId ?? syntheticSnowflake();
  await db.insert(authUser).values({
    id: userId,
    name: options.name ?? 'Synthetic Member',
    email: `discord-${discordUserId}@accounts.invalid`,
    emailVerified: false,
  });
  await db.insert(authAccount).values({ id: randomUUID(), accountId: discordUserId, providerId: 'discord', userId });
  return { userId, discordUserId };
}

export async function insertLocalAdmin(
  db: Database,
  options: { password?: string; roles?: LocalGrantRole[]; twoFactorEnabled?: boolean; email?: string; expiresAt?: Date | null; games?: Game[] | null } = {},
) {
  const userId = randomUUID();
  const email = options.email ?? `recovery-${userId.slice(0, 8)}@example.test`;
  const password = options.password ?? 'correct horse battery staple 42';
  await db.insert(authUser).values({ id: userId, name: 'Recovery Operator', email, emailVerified: false, twoFactorEnabled: options.twoFactorEnabled ?? false });
  await db.insert(authAccount).values({
    id: randomUUID(),
    accountId: userId,
    providerId: 'credential',
    userId,
    password: await hashPassword(password),
  });
  const [grant] = await db
    .insert(localAdminGrant)
    .values({ userId, roles: options.roles ?? ['administrator'], games: options.games ?? null, version: 1, provisionedBy: 'test-operator', expiresAt: options.expiresAt ?? null })
    .returning();
  return { userId, email, password, grantId: grant!.id };
}

export async function insertSession(db: Database, userId: string, assurance: string, expiresInMs = 3_600_000) {
  const id = randomUUID();
  const token = randomUUID().replaceAll('-', '');
  const expiresAt = new Date(Date.now() + expiresInMs);
  await db.insert(authSession).values({ id, token, userId, assurance, expiresAt });
  return { id, token, userId, assurance, expiresAt };
}

export async function sessionCount(db: Database, userId: string): Promise<number> {
  const rows = await db.select({ id: authSession.id }).from(authSession).where(eq(authSession.userId, userId));
  return rows.length;
}

export async function membershipRow(db: Database, discordUserId: string) {
  const [row] = await db.select().from(guildMembership).where(eq(guildMembership.discordUserId, discordUserId));
  return row ?? null;
}

// --- RFC 6238 TOTP (independent of the library under test) ----------------------------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 input.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totp(key: Buffer, at = Date.now(), period = 30, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / period)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(code % 10 ** digits).padStart(digits, '0');
}

/** Extracts the TOTP key bytes from an `otpauth://` URI returned by `/two-factor/enable`. */
export function totpKeyFromUri(uri: string): Buffer {
  const secret = new URL(uri).searchParams.get('secret');
  if (!secret) throw new Error('otpauth URI without secret');
  return base32Decode(secret);
}
