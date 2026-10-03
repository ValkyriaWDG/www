import { createHmac } from 'node:crypto';
import { auditEvent } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from '@/lib/db';
import { resetServerEnvForTests } from '@/lib/env';
import { requireCapability } from '@/modules/access/server';
import { AccessDeniedError } from '@/modules/access/types';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { resetAuthForTests } from '@/modules/auth/auth';
import { getHeaderAccountState } from '@/modules/auth/header-state';
import { createTestDatabase, type TestDatabase } from '../support/test-db';
import { createDiscordFetch, insertDiscordUser, insertSession, ROLE, ROLE_MAPPING_JSON, TEST_SECRET, type DiscordMemberState } from './auth-harness';

const requestHeaders = { current: new Headers() };
const HLL_EDITOR_ROLE = '200000000000000005';
const WDG_EDITOR_ROLE = '200000000000000006';

vi.mock('next/headers', () => ({
  headers: async () => requestHeaders.current,
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
}));

let database: TestDatabase;
const members = new Map<string, DiscordMemberState>();
const savedEnv = { ...process.env };

beforeAll(async () => {
  database = await createTestDatabase();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: database.url,
    APP_URL: 'http://localhost:3000',
    BETTER_AUTH_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: TEST_SECRET,
    DISCORD_GUILD_ID: '100000000000000001',
    DISCORD_BOT_TOKEN: 'synthetic-bot-token',
    DISCORD_CLIENT_ID: '100000000000000099',
    DISCORD_CLIENT_SECRET: 'synthetic-client-secret',
    DISCORD_API_BASE_URL: 'https://discord.test/api/v10',
    DISCORD_ROLE_MAPPING_JSON: JSON.stringify({
      ...JSON.parse(ROLE_MAPPING_JSON),
      [HLL_EDITOR_ROLE]: { roles: ['editor'], games: ['hell-let-loose'] },
      [WDG_EDITOR_ROLE]: { roles: ['editor'], games: ['wardogs'] },
    }),
    LOCAL_ADMIN_LOGIN_ENABLED: 'false',
  });
  resetServerEnvForTests();
  await resetDbForTests();
  resetAuthForTests();
  vi.stubGlobal('fetch', createDiscordFetch(members));
});

afterAll(async () => {
  vi.unstubAllGlobals();
  resetAuthForTests();
  await resetDbForTests();
  process.env = savedEnv;
  resetServerEnvForTests();
  await database.drop();
});

beforeEach(() => {
  requestHeaders.current = new Headers();
});

function cookieFor(token: string, secret = TEST_SECRET) {
  const signature = createHmac('sha256', secret).update(token).digest('base64');
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

async function signedInAs(roles: string[] | 'outage') {
  const identity = await insertDiscordUser(database.db, { name: 'Synthetic Request User' });
  members.set(identity.discordUserId, roles === 'outage' ? { status: 'error', httpStatus: 503 } : { status: 'present', roles });
  const session = await insertSession(database.db, identity.userId, 'discord');
  requestHeaders.current = new Headers({ cookie: cookieFor(session.token) });
  return identity;
}

async function denial(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AccessDeniedError) return error.code;
    throw error;
  }
  return null;
}

describe('requireCapability on the request path', () => {
  it('denies anonymous requests as unauthenticated', async () => {
    expect(await denial(requireCapability('admin.access', 'read'))).toBe('unauthenticated');
  });

  it('denies a forged session cookie', async () => {
    const identity = await insertDiscordUser(database.db);
    members.set(identity.discordUserId, { status: 'present', roles: [ROLE.administrator] });
    const session = await insertSession(database.db, identity.userId, 'discord');
    requestHeaders.current = new Headers({ cookie: cookieFor(session.token, 'not-the-server-secret-value-0000000000') });
    expect(await denial(requireCapability('admin.access', 'read'))).toBe('unauthenticated');
  });

  it('denies a member without administrative roles as forbidden', async () => {
    await signedInAs([ROLE.member]);
    expect(await denial(requireCapability('admin.access', 'read'))).toBe('forbidden');
  });

  it('keeps editors out of match and settings capabilities', async () => {
    await signedInAs([ROLE.editor]);
    const principal = await requireCapability('content.publish', 'write');
    expect(principal).toMatchObject({ source: 'discord', intent: 'write', roles: ['editor'] });
    expect(await denial(requireCapability('matches.publish', 'write'))).toBe('forbidden');
    expect(await denial(requireCapability('media.match.manage', 'write'))).toBe('forbidden');
    expect(await denial(requireCapability('settings.manage', 'read'))).toBe('forbidden');
  });

  it('never trusts role data supplied by the browser', async () => {
    await signedInAs([ROLE.member]);
    requestHeaders.current.set('x-valkyria-roles', 'administrator');
    requestHeaders.current.append('cookie', 'roles=administrator');
    expect(await denial(requireCapability('admin.access', 'read'))).toBe('forbidden');
  });

  it('fails closed during a Discord outage', async () => {
    await signedInAs('outage');
    expect(await denial(requireCapability('content.edit', 'write'))).toBe('stale_authorization');
  });
});

describe('admin page guard', () => {
  it('redirects anonymous visitors to the localized login with the page as returnTo', async () => {
    const error = await requireAdminPage({ locale: 'en', path: '/admin/settings', capability: 'settings.manage' }).catch((thrown: unknown) => thrown);
    expect(String((error as { digest?: string }).digest)).toContain(`/en/login?returnTo=${encodeURIComponent('/en/admin/settings')}`);
  });

  it('denies an editor on the settings page and audits the denial', async () => {
    const editor = await signedInAs([ROLE.editor]);
    const access = await requireAdminPage({ locale: 'cs', path: '/admin/settings', capability: 'settings.manage' });
    expect(access).toMatchObject({ ok: false, code: 'forbidden' });
    const audits = await database.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.action, 'access.denied'), eq(auditEvent.actorUserId, editor.userId)));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ capability: 'settings.manage', outcome: 'denied', actorLabel: 'Synthetic Request User' });
  });

  it('allows an administrator', async () => {
    await signedInAs([ROLE.administrator]);
    const access = await requireAdminPage({ locale: 'cs', path: '/admin/audit', capability: 'audit.read' });
    expect(access.ok).toBe(true);
  });

  it.each(['cs', 'en'] as const)('denies an HLL-only editor on community pages in %s and audits the denial', async (locale) => {
    const editor = await signedInAs([HLL_EDITOR_ROLE]);
    const access = await requireAdminPage({ locale, path: '/admin/content', capability: 'content.edit', game: null });
    expect(access).toMatchObject({ ok: false, code: 'forbidden' });
    const audits = await database.db.select().from(auditEvent).where(and(eq(auditEvent.action, 'access.denied'), eq(auditEvent.actorUserId, editor.userId)));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ capability: 'content.edit', outcome: 'denied', summary: { reason: 'game_scope' } });
  });

  it.each(['cs', 'en'] as const)('denies a Wardogs-only editor on the HLL manual in %s', async (locale) => {
    await signedInAs([WDG_EDITOR_ROLE]);
    for (const path of ['/admin/manual', '/admin/manual/new']) {
      const access = await requireAdminPage({ locale, path, capability: 'content.edit', game: 'hell-let-loose' });
      expect(access).toMatchObject({ ok: false, code: 'forbidden' });
    }
  });

  it('allows an HLL-only editor into the manual while retaining broader content capability checks', async () => {
    await signedInAs([HLL_EDITOR_ROLE]);
    expect((await requireAdminPage({ locale: 'cs', path: '/admin/manual', capability: 'content.edit', game: 'hell-let-loose' })).ok).toBe(true);
    expect((await requireAdminPage({ locale: 'cs', path: '/admin/news', capability: 'content.edit' })).ok).toBe(true);
  });

  it('allows a platform-wide editor into both community pages and the manual', async () => {
    await signedInAs([ROLE.editor]);
    expect((await requireAdminPage({ locale: 'en', path: '/admin/content', capability: 'content.edit', game: null })).ok).toBe(true);
    expect((await requireAdminPage({ locale: 'en', path: '/admin/manual', capability: 'content.edit', game: 'hell-let-loose' })).ok).toBe(true);
  });
});

describe('header account state', () => {
  it('reports signed-out, member and admin states without throwing', async () => {
    expect(await getHeaderAccountState()).toEqual({ state: 'signed_out' });
    await signedInAs([ROLE.member]);
    expect(await getHeaderAccountState()).toEqual({ state: 'signed_in', label: 'Synthetic Request User', canAdmin: false });
    await signedInAs([ROLE.editor]);
    expect(await getHeaderAccountState()).toEqual({ state: 'signed_in', label: 'Synthetic Request User', canAdmin: true });
  });

  it('degrades to canAdmin false during a Discord outage', async () => {
    await signedInAs('outage');
    expect(await getHeaderAccountState()).toMatchObject({ state: 'signed_in', canAdmin: false });
  });
});
