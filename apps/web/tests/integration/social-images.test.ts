import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDocument, saveDraft } from '@/modules/content/editor';
import { publishTranslation, unpublishTranslation } from '@/modules/content/publication';
import { sampleBody, seedTestUsers, testActors } from '@/modules/content/testing';
import { socialImageResponse, type SocialDeps } from '@/modules/social/handler';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let db: TestDatabase;
const actor = testActors().editorCs;
const renderer = vi.fn<SocialDeps['render']>(async (card) => new TextEncoder().encode(card.title));
const request = new Request('https://site.example/api/social/cs/news/public-article', { headers: { Cookie: 'irrelevant=admin' } });
let deps: SocialDeps;

beforeAll(async () => {
  db = await createTestDatabase();
  await seedTestUsers(db.db);
  deps = { db: () => db.db, mediaRoot: '/not-used', siteOrigin: 'https://social-test.example', render: renderer };
});
afterAll(async () => { await db.drop(); });

describe('actual social handler with real publication persistence', () => {
  it('keeps draft edits private and rechecks publication before cached image delivery', async () => {
    const created = await createDocument(db.db, actor, {
      kind: 'news', locale: 'cs', title: 'Published title', slug: 'public-article',
      fields: { excerpt: 'Summary', body: sampleBody('Public body') },
    });
    const params = { locale: 'cs', kind: 'news', slug: ['public-article'] };
    expect((await socialImageResponse(request, params, deps)).status).toBe(404);
    const published = await publishTranslation(db.db, actor, { translationId: created.translationId, expectedVersion: created.version });
    expect(await (await socialImageResponse(request, params, deps)).text()).toBe('Published title');
    const saved = await saveDraft(db.db, actor, { translationId: created.translationId, expectedVersion: published.version, fields: { title: 'PRIVATE DRAFT', slug: 'new-slug' } });
    expect(await (await socialImageResponse(request, params, deps)).text()).toBe('Published title');
    expect((await socialImageResponse(request, { ...params, slug: ['new-slug'] }, deps)).status).toBe(404);
    expect((await socialImageResponse(request, { ...params, locale: 'en' }, deps)).status).toBe(404);
    const unpublished = await unpublishTranslation(db.db, actor, { translationId: created.translationId, expectedVersion: saved.version });
    const withdrawn = await socialImageResponse(request, params, deps);
    expect(withdrawn.status).toBe(404);
    expect(withdrawn.headers.get('Cache-Control')).toBe('no-store');
    expect(renderer.mock.calls.some(([card]) => card.title === 'PRIVATE DRAFT')).toBe(false);
    await publishTranslation(db.db, actor, { translationId: created.translationId, expectedVersion: unpublished.version });
    expect(await (await socialImageResponse(request, { ...params, slug: ['new-slug'] }, deps)).text()).toBe('PRIVATE DRAFT');
  });

  it('does not connect to persistence for fixed site/list cards or malformed paths', async () => {
    const failingDb = vi.fn(() => { throw new Error('Database credentials must not be exposed'); });
    const isolated = { ...deps, db: failingDb };
    expect((await socialImageResponse(request, { locale: 'cs', kind: 'site' }, isolated)).status).toBe(200);
    expect((await socialImageResponse(request, { locale: 'cs', kind: 'news', slug: ['../../private'] }, isolated)).status).toBe(404);
    expect(failingDb).not.toHaveBeenCalled();
    const unavailable = await socialImageResponse(request, { locale: 'cs', kind: 'news', slug: ['known-slug'] }, isolated);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).toBe('Service unavailable');
    expect(unavailable.headers.get('Cache-Control')).toBe('no-store');
  });

  it('selects fixed HLL artwork without persistence and cannot override an entity game', async () => {
    const scopedRenderer = vi.fn<SocialDeps['render']>(async (card) => new TextEncoder().encode(card.theme));
    const scoped = { ...deps, render: scopedRenderer, siteOrigin: 'https://scope-test.example' };
    const failingDb = vi.fn(() => { throw new Error('No database for fixed cards'); });
    const hllRequest = new Request('https://site.example/api/social/cs/site?game=hll');
    const response = await socialImageResponse(hllRequest, { locale: 'cs', kind: 'site' }, { ...scoped, db: failingDb });
    expect(await response.text()).toBe('hll');
    expect(failingDb).not.toHaveBeenCalled();
    expect((await socialImageResponse(new Request('https://site.example/api/social/cs/site?game=invalid'), { locale: 'cs', kind: 'site' }, scoped)).status).toBe(404);
    const created = await createDocument(db.db, actor, {
      kind: 'news', game: 'hell-let-loose', locale: 'cs', title: 'HLL scope', slug: 'hll-scope',
      fields: { excerpt: 'Summary', body: sampleBody('Public body') },
    });
    await publishTranslation(db.db, actor, { translationId: created.translationId, expectedVersion: created.version });
    const entity = await socialImageResponse(new Request('https://site.example/api/social/cs/news/hll-scope?game=wardogs'), { locale: 'cs', kind: 'news', slug: ['hll-scope'] }, scoped);
    expect(await entity.text()).toBe('hll');
    expect(scopedRenderer.mock.calls.at(-1)?.[0]).toMatchObject({ game: 'HELL LET LOOSE', theme: 'hll' });
  });
});
