import { auditEvent, siteSetting } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, type TestActors } from '@/fixtures/test-actors';
import { DomainError } from '@/lib/result';
import { AccessDeniedError } from '@/modules/access/types';
import { getPublicSiteConfig, type SiteConfigDefaults } from '@/modules/settings/public';
import { getSettingsForAdmin, updateSetting } from '@/modules/settings/service';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let actors: TestActors;
const originalOrigins = process.env.BACKGROUND_MEDIA_ALLOWED_ORIGINS;

beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
});
afterEach(() => {
  if (originalOrigins === undefined) delete process.env.BACKGROUND_MEDIA_ALLOWED_ORIGINS;
  else process.env.BACKGROUND_MEDIA_ALLOWED_ORIGINS = originalOrigins;
});
afterAll(async () => {
  await t.drop();
});

const defaults: SiteConfigDefaults = {
  discordInviteUrl: 'https://discord.gg/synthetic-default',
  hllWebsiteUrl: 'https://valkyriahll.cz/',
  hllMatchArchiveUrl: 'https://valkyriahll.cz/matches',
  background: { posterUrl: null, mp4Url: '/media/default-loop.mp4', webmUrl: null },
};

async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (e: unknown) => e,
  );
}
async function expectDomain(promise: Promise<unknown>, code: string, field?: string) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  if (field) expect(Object.keys((error as DomainError).fieldErrors ?? {}).join(',')).toContain(field);
}

async function version(key: string) {
  const [row] = await t.db.select().from(siteSetting).where(eq(siteSetting.key, key));
  return row?.version ?? 0;
}

describe('site settings administration', () => {
  it('denies editors, match managers, members and anonymous visitors', async () => {
    for (const actor of [actors.editor, actors.matchManager, actors.member]) {
      expect(await failure(getSettingsForAdmin(t.db, actor))).toBeInstanceOf(AccessDeniedError);
      expect(
        await failure(updateSetting(t.db, actor, { key: 'community.discordInviteUrl', expectedVersion: 0, value: 'https://discord.gg/hijack' })),
      ).toBeInstanceOf(AccessDeniedError);
    }
    expect(await failure(getSettingsForAdmin(t.db, actors.anonymous))).toBeInstanceOf(AccessDeniedError);
    expect(await version('community.discordInviteUrl')).toBe(0);
  });

  it('stores an allowlisted value with optimistic concurrency and reflects it publicly', async () => {
    const saved = await updateSetting(t.db, actors.administrator, {
      key: 'community.discordInviteUrl',
      expectedVersion: 0,
      value: 'https://discord.com/invite/synthetic-override',
    });
    expect(saved).toMatchObject({ version: 1, value: 'https://discord.com/invite/synthetic-override' });
    await expectDomain(
      updateSetting(t.db, actors.administrator, { key: 'community.discordInviteUrl', expectedVersion: 0, value: 'https://discord.gg/stale' }),
      'conflict',
    );
    const config = await getPublicSiteConfig(t.db, defaults);
    expect(config.discordInviteUrl).toBe('https://discord.com/invite/synthetic-override');
    expect(config.hllWebsiteUrl).toBe('https://valkyriahll.cz/');

    const cleared = await updateSetting(t.db, actors.administrator, { key: 'community.discordInviteUrl', expectedVersion: 1, value: null });
    expect(cleared).toMatchObject({ value: null, version: 0 });
    expect((await getPublicSiteConfig(t.db, defaults)).discordInviteUrl).toBe('https://discord.gg/synthetic-default');
  });

  it('rejects unknown and system keys and never lists system settings', async () => {
    await t.db.insert(siteSetting).values({ key: 'system.publisher_heartbeat', value: { at: new Date().toISOString() } });
    await expectDomain(updateSetting(t.db, actors.administrator, { key: 'system.publisher_heartbeat', expectedVersion: 1, value: {} }), 'validation', 'key');
    await expectDomain(updateSetting(t.db, actors.administrator, { key: 'arbitrary.setting', expectedVersion: 0, value: 'x' }), 'validation', 'key');
    const settings = await getSettingsForAdmin(t.db, actors.administrator);
    expect(settings.map((s) => s.key)).toEqual(['community.discordInviteUrl', 'community.links', 'background.media', 'servers.presentation']);
    expect(JSON.stringify(settings)).not.toContain('system.');
  });

  it('requires HTTPS community links and Discord invite hosts', async () => {
    await expectDomain(updateSetting(t.db, actors.administrator, { key: 'community.discordInviteUrl', expectedVersion: 0, value: 'http://discord.gg/x' }), 'validation');
    await expectDomain(
      updateSetting(t.db, actors.administrator, { key: 'community.discordInviteUrl', expectedVersion: 0, value: 'https://example.org/invite/x' }),
      'validation',
    );
    await expectDomain(
      updateSetting(t.db, actors.administrator, { key: 'community.links', expectedVersion: 0, value: [{ kind: 'youtube', url: 'http://example.org', label: 'YT' }] }),
      'validation',
    );
    const links = [{ kind: 'website', url: 'https://example.org/synthetic', label: 'Synthetic website' }];
    await updateSetting(t.db, actors.administrator, { key: 'community.links', expectedVersion: 0, value: links });
    expect((await getPublicSiteConfig(t.db, defaults)).communityLinks).toEqual(links);
  });

  it('enforces background origins and provenance, and ignores stale stored overrides', async () => {
    process.env.BACKGROUND_MEDIA_ALLOWED_ORIGINS = '';
    await expectDomain(
      updateSetting(t.db, actors.administrator, {
        key: 'background.media',
        expectedVersion: 0,
        value: { mp4Url: 'https://media.example.org/loop.mp4', provenance: 'Synthetic' },
      }),
      'validation',
      'mp4Url',
    );
    process.env.BACKGROUND_MEDIA_ALLOWED_ORIGINS = 'https://media.example.org';
    await expectDomain(
      updateSetting(t.db, actors.administrator, { key: 'background.media', expectedVersion: 0, value: { mp4Url: 'https://media.example.org/loop.mp4' } }),
      'validation',
      'provenance',
    );
    await expectDomain(
      updateSetting(t.db, actors.administrator, {
        key: 'background.media',
        expectedVersion: 0,
        value: { webmUrl: 'https://other.example.org/loop.webm', provenance: 'Synthetic' },
      }),
      'validation',
      'webmUrl',
    );
    await updateSetting(t.db, actors.administrator, {
      key: 'background.media',
      expectedVersion: 0,
      value: {
        posterUrl: '/media/poster.webp',
        mp4Url: 'https://media.example.org/loop.mp4',
        webmUrl: 'https://media.example.org/loop.webm',
        focalX: 30,
        focalY: 70,
        provenance: 'Synthetic owner-approved capture',
      },
    });
    expect((await getPublicSiteConfig(t.db, defaults)).background).toEqual({
      posterUrl: '/media/poster.webp',
      sources: [
        { src: 'https://media.example.org/loop.webm', type: 'video/webm' },
        { src: 'https://media.example.org/loop.mp4', type: 'video/mp4' },
      ],
      focalPoint: { x: 30, y: 70 },
    });

    // Removing the origin from the allowlist invalidates the stored override at read time.
    process.env.BACKGROUND_MEDIA_ALLOWED_ORIGINS = '';
    expect((await getPublicSiteConfig(t.db, defaults)).background).toEqual({
      posterUrl: null,
      sources: [{ src: '/media/default-loop.mp4', type: 'video/mp4' }],
      focalPoint: { x: 50, y: 50 },
    });
    const admin = await getSettingsForAdmin(t.db, actors.administrator);
    expect(admin.find((s) => s.key === 'background.media')).toMatchObject({ invalid: true, value: null, version: 1 });
  });

  it('records a redacted audit summary without the stored values', async () => {
    const events = await t.db.select().from(auditEvent).where(eq(auditEvent.action, 'settings.update'));
    expect(events.length).toBeGreaterThan(0);
    const json = JSON.stringify(events.map((e) => e.summary));
    for (const secret of ['https://', 'synthetic-override', 'Synthetic owner-approved capture', 'Synthetic website']) expect(json).not.toContain(secret);
    expect(events.find((e) => e.entityId === 'background.media')?.summary).toMatchObject({ key: 'background.media', version: 1 });
    const denied = await t.db.select().from(auditEvent).where(eq(auditEvent.outcome, 'denied'));
    expect(denied.some((e) => e.action === 'settings.update' && e.actorUserId === actors.editor.userId)).toBe(true);
  });

  it('falls back to environment defaults when the database is unavailable', async () => {
    const broken = { select: () => ({ from: () => ({ where: () => Promise.reject(new Error('connection refused')) }) }) };
    const config = await getPublicSiteConfig(broken as never, defaults);
    expect(config).toMatchObject({ discordInviteUrl: 'https://discord.gg/synthetic-default', communityLinks: [] });
  });
});
