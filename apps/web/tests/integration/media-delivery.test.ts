import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { match, memberProfile } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as mediaRoute } from '@/app/api/media/[assetId]/[variant]/route';
import { resetDbForTests } from '@/lib/db';
import { resetServerEnvForTests } from '@/lib/env';
import type { Actor } from '@/modules/access/types';
import { addTranslation, archiveDocument, createDocument, saveDraft } from '@/modules/content/editor';
import { publishTranslation, unpublishTranslation } from '@/modules/content/publication';
import { sampleBody, seedTestUsers, testActors } from '@/modules/content/testing';
import { deliverMedia, PUBLIC_MEDIA_CACHE_CONTROL } from '@/modules/media/delivery';
import { deleteAsset, uploadImage } from '@/modules/media/library';
import { removeAssetFiles } from '@/modules/media/storage';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let root: string;
const actors = testActors();
const env = { DATABASE_URL: process.env.DATABASE_URL, EDITORIAL_MEDIA_ROOT: process.env.EDITORIAL_MEDIA_ROOT };

beforeAll(async () => {
  t = await createTestDatabase();
  await seedTestUsers(t.db);
  root = await mkdtemp(path.join(os.tmpdir(), 'valkyria-media-delivery-'));
});
afterAll(async () => {
  await resetDbForTests();
  process.env.DATABASE_URL = env.DATABASE_URL;
  process.env.EDITORIAL_MEDIA_ROOT = env.EDITORIAL_MEDIA_ROOT;
  resetServerEnvForTests();
  await rm(root, { recursive: true, force: true });
  await t.drop();
});

const anonymous: Actor = { kind: 'anonymous' };

function get(assetId: string, variant = 'full', actor: Actor = anonymous, headers: Record<string, string> = {}) {
  return deliverMedia(new Request(`http://localhost/api/media/${assetId}/${variant}`, { headers }), { assetId, variant }, {
    db: t.db,
    mediaRoot: root,
    resolveActor: async () => actor,
  });
}

async function newAsset(scope: 'editorial' | 'match' = 'editorial') {
  const bytes = await sharp({ create: { width: 90, height: 60, channels: 3, background: { r: 10, g: 120, b: 60 } } }).jpeg().toBuffer();
  const owner = scope === 'editorial' ? actors.editorCs : actors.matchManager;
  return uploadImage(t.db, owner, { bytes, filename: 'x.jpg', scope }, { mediaRoot: root });
}

let slugCounter = 0;
async function czechPost(options: { cover?: string; bodyImage?: string }) {
  const created = await createDocument(t.db, actors.editorCs, {
    kind: 'news',
    locale: 'cs',
    title: 'Mediální článek',
    slug: `media-${++slugCounter}`,
    fields: {
      excerpt: 'Shrnutí',
      body: sampleBody('Text', options.bodyImage),
      cover: options.cover ? { assetId: options.cover, alt: 'Obálka – koncept', caption: 'Soukromý popisek', decorative: false } : null,
    },
  });
  return created;
}

describe('publication-aware media delivery', () => {
  it('keeps draft-only assets private: anonymous 404, authorized editor private 200', async () => {
    const image = await newAsset();
    await czechPost({ cover: image.id });
    const anon = await get(image.id);
    expect(anon.status).toBe(404);
    expect(anon.headers.get('cache-control')).toBe('no-store');
    expect(await anon.text()).toBe('Not found');
    // Indistinguishable from a non-existent asset.
    const missing = await get('00000000-0000-4000-8000-00000000ffff');
    expect(missing.status).toBe(404);

    const editorResponse = await get(image.id, 'thumb', actors.editorCs);
    expect(editorResponse.status).toBe(200);
    expect(editorResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(editorResponse.headers.get('content-type')).toBe('image/webp');
    expect((await get(image.id, 'full', actors.matchManager)).status).toBe(404);
    expect((await get(image.id, 'full', actors.member)).status).toBe(404);
  });

  it('serves published assets publicly with cache headers and stops after the last unpublish', async () => {
    const image = await newAsset();
    const cs = await czechPost({ cover: image.id });
    const csLive = await publishTranslation(t.db, actors.editorCs, { translationId: cs.translationId, expectedVersion: cs.version });

    const response = await get(image.id);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(PUBLIC_MEDIA_CACHE_CONTROL);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toBe('inline');
    const etag = response.headers.get('etag');
    expect(etag).toMatch(/^"[0-9a-f]{32}-full"$/);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect((await sharp(bytes).metadata()).format).toBe('webp');
    // Only bytes are delivered: no draft alt/caption leaks through headers.
    expect(JSON.stringify([...response.headers.entries()])).not.toMatch(/Obálka|popisek/);
    const conditional = await get(image.id, 'full', anonymous, { 'if-none-match': etag! });
    expect(conditional.status).toBe(304);

    // English translation references the same asset in its body and is published too.
    const en = await addTranslation(t.db, actors.editorEn, { documentId: cs.documentId, locale: 'en', slug: `media-en-${slugCounter}` });
    const enSaved = await saveDraft(t.db, actors.editorEn, {
      translationId: en.translationId,
      expectedVersion: en.version,
      fields: { title: 'Media article', excerpt: 'Summary', body: sampleBody('Text', image.id) },
    });
    const enLive = await publishTranslation(t.db, actors.editorEn, { translationId: en.translationId, expectedVersion: enSaved.version });

    await unpublishTranslation(t.db, actors.editorCs, { translationId: cs.translationId, expectedVersion: csLive.version });
    expect((await get(image.id)).status).toBe(200); // still referenced by live English

    await unpublishTranslation(t.db, actors.editorEn, { translationId: en.translationId, expectedVersion: enLive.version });
    const gone = await get(image.id);
    expect(gone.status).toBe(404);
    expect((await get(image.id, 'full', anonymous, { 'if-none-match': etag! })).status).toBe(404);
  });

  it('stops public delivery when the document is archived and refuses to delete referenced assets', async () => {
    const image = await newAsset();
    const post = await czechPost({ bodyImage: image.id });
    await publishTranslation(t.db, actors.editorCs, { translationId: post.translationId, expectedVersion: post.version });
    expect((await get(image.id)).status).toBe(200);
    await expect(deleteAsset(t.db, actors.editorCs, { assetId: image.id }, { mediaRoot: root })).rejects.toMatchObject({ code: 'in_use' });
    await archiveDocument(t.db, actors.editorCs, { documentId: post.documentId, expectedDocumentVersion: 1 });
    expect((await get(image.id)).status).toBe(404);
    expect((await get(image.id, 'full', actors.editorCs)).status).toBe(200);
  });

  it('honours published match and consenting member references', async () => {
    const logo = await newAsset('match');
    const [fixture] = await t.db
      .insert(match)
      .values({ slug: 'synthetic-media-match', game: 'wardogs', opponentName: 'Synthetic Opponent', competitionType: 'friendly', startsAt: new Date('2026-10-04T18:00:00Z'), opponentLogoAssetId: logo.id })
      .returning();
    expect((await get(logo.id)).status).toBe(404);
    expect((await get(logo.id, 'full', actors.matchManager)).status).toBe(200);
    expect((await get(logo.id, 'full', actors.editorCs)).status).toBe(200); // content.read_private
    await t.db.update(match).set({ publication: 'published', publishedAt: new Date() }).where(eq(match.id, fixture!.id));
    expect((await get(logo.id)).status).toBe(200);
    await expect(deleteAsset(t.db, actors.matchManager, { assetId: logo.id }, { mediaRoot: root })).rejects.toMatchObject({ code: 'in_use' });

    const avatar = await newAsset();
    const [profile] = await t.db.insert(memberProfile).values({ slug: 'synthetic-avatar', displayName: 'Žofie Syntetická', avatarAssetId: avatar.id }).returning();
    expect((await get(avatar.id)).status).toBe(404);
    await t.db
      .update(memberProfile)
      .set({ state: 'published', consentConfirmedAt: new Date(), publishedAt: new Date() })
      .where(eq(memberProfile.id, profile!.id));
    expect((await get(avatar.id)).status).toBe(200);
  });

  it('rejects invalid identifiers, traversal attempts and missing files with 404', async () => {
    const image = await newAsset();
    const post = await czechPost({ cover: image.id });
    await publishTranslation(t.db, actors.editorCs, { translationId: post.translationId, expectedVersion: post.version });
    for (const [assetId, variant] of [
      ['../../etc/passwd', 'full'],
      ['..%2F..%2Fetc%2Fpasswd', 'full'],
      [image.id, '../full'],
      [image.id, 'original'],
      [image.id.toUpperCase(), 'full'],
      [`${image.id}/..`, 'full'],
    ]) {
      expect((await get(assetId!, variant!, actors.administrator)).status).toBe(404);
    }
    await removeAssetFiles(root, image.id);
    expect((await get(image.id)).status).toBe(404);
  });

  it('wires the route handler to the database and media root', async () => {
    const image = await newAsset();
    const post = await czechPost({ cover: image.id });
    process.env.DATABASE_URL = t.url;
    process.env.EDITORIAL_MEDIA_ROOT = root;
    resetServerEnvForTests();
    await resetDbForTests();
    const call = (variant: string) =>
      mediaRoute(new Request(`http://localhost/api/media/${image.id}/${variant}`), { params: Promise.resolve({ assetId: image.id, variant }) });
    expect((await call('full')).status).toBe(404); // anonymous until the auth slice resolves actors
    await publishTranslation(t.db, actors.editorCs, { translationId: post.translationId, expectedVersion: post.version });
    const response = await call('thumb');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(PUBLIC_MEDIA_CACHE_CONTROL);
  });
});
