import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/locale-switch/route';
import { resetDbForTests } from '@/lib/db';
import { resetServerEnvForTests } from '@/lib/env';
import { addTranslation, createDocument, saveDraft } from '@/modules/content/editor';
import { resolveLocaleSwitch } from '@/modules/content/locale-switch';
import { resolveNewsCounterpart } from '@/modules/content/public';
import { publishTranslation } from '@/modules/content/publication';
import { sampleBody, seedTestUsers, testActors } from '@/modules/content/testing';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
const { editorCs, editorEn } = testActors();
const previousUrl = process.env.DATABASE_URL;

async function publishedCzech(slug: string) {
  const created = await createDocument(t.db, editorCs, {
    kind: 'news',
    locale: 'cs',
    title: 'Článek',
    slug,
    fields: { excerpt: 'Shrnutí', body: sampleBody('Text.') },
  });
  await publishTranslation(t.db, editorCs, { translationId: created.translationId, expectedVersion: created.version });
  return created;
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedTestUsers(t.db);
  const both = await publishedCzech('prepinac-oba');
  const en = await addTranslation(t.db, editorEn, { documentId: both.documentId, locale: 'en', slug: 'switch-both' });
  const saved = await saveDraft(t.db, editorEn, {
    translationId: en.translationId,
    expectedVersion: en.version,
    fields: { title: 'Article', excerpt: 'Summary', body: sampleBody('Text.') },
  });
  await publishTranslation(t.db, editorEn, { translationId: en.translationId, expectedVersion: saved.version });
  const czechOnly = await publishedCzech('jen-cestina');
  await addTranslation(t.db, editorEn, { documentId: czechOnly.documentId, locale: 'en', slug: 'english-draft-only' });
  await createDocument(t.db, editorCs, { kind: 'news', locale: 'cs', title: 'Koncept', slug: 'jen-koncept' });
  // Route handler uses the process-wide pool: point it at this test database.
  process.env.DATABASE_URL = t.url;
  resetServerEnvForTests();
  await resetDbForTests();
});

afterAll(async () => {
  await resetDbForTests();
  process.env.DATABASE_URL = previousUrl;
  resetServerEnvForTests();
  await t.drop();
});

const resolver = (from: 'cs' | 'en', slug: string, to: 'cs' | 'en') => resolveNewsCounterpart(from, slug, to, t.db);

describe('locale switch with published counterparts (PostgreSQL)', () => {
  it('uses the real published slug of the other translation', async () => {
    expect(await resolveLocaleSwitch({ to: 'en', from: '/cs/news/prepinac-oba' }, resolver)).toBe('/en/news/switch-both');
    expect(await resolveLocaleSwitch({ to: 'cs', from: '/en/news/switch-both' }, resolver)).toBe('/cs/news/prepinac-oba');
  });

  it('sends a missing English article to the English list with a source notice', async () => {
    expect(await resolveLocaleSwitch({ to: 'en', from: '/cs/news/jen-cestina' }, resolver)).toBe('/en/news?missing=cs%3Ajen-cestina');
  });

  it('never reveals drafts: unpublished sources and draft counterparts fall back to the list', async () => {
    expect(await resolveLocaleSwitch({ to: 'en', from: '/cs/news/jen-koncept' }, resolver)).toBe('/en/news');
    expect(await resolveLocaleSwitch({ to: 'cs', from: '/en/news/english-draft-only' }, resolver)).toBe('/cs/news');
  });

  it('responds 307 with a relative Location and no-store from the route handler', async () => {
    const response = await GET(new Request('http://localhost/api/locale-switch?to=en&from=%2Fcs%2Fnews%2Fprepinac-oba'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/en/news/switch-both');
    expect(response.headers.get('cache-control')).toBe('no-store');

    const hostile = await GET(new Request('http://localhost/api/locale-switch?to=en&from=%2F%2Fevil.example%2Fx'));
    expect(hostile.headers.get('location')).toBe('/en');
    const filtered = await GET(new Request('http://localhost/api/locale-switch?to=cs&from=%2Fen%2Fnews%3Fq%3Dx%26page%3D3%26token%3Dsecret'));
    expect(filtered.headers.get('location')).toBe('/cs/news?q=x');
  });
});
