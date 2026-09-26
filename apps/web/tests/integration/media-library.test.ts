import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { asset, auditEvent } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessDeniedError, type Actor } from '@/modules/access/types';
import { createDocument, saveDraft } from '@/modules/content/editor';
import { sampleBody, seedTestUsers, testActors } from '@/modules/content/testing';
import { UPLOADS_PER_HOUR, deleteAsset, getAsset, listAssets, updateAssetMetadata, uploadImage } from '@/modules/media/library';
import { handleUploadRequest, MAX_UPLOAD_REQUEST_BYTES } from '@/modules/media/upload-handler';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let root: string;
const actors = testActors();
const ORIGIN = 'https://valkyriawdg.cz';

const png = (width = 120, height = 80) =>
  sharp({ create: { width, height, channels: 3, background: { r: 30, g: 80, b: 140 } } }).png().toBuffer();

beforeAll(async () => {
  t = await createTestDatabase();
  await seedTestUsers(t.db);
  root = await mkdtemp(path.join(os.tmpdir(), 'valkyria-media-int-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await t.drop();
});

const upload = async (actor: Actor, overrides: Partial<Parameters<typeof uploadImage>[2]> = {}) =>
  uploadImage(t.db, actor, { bytes: await png(), filename: 'foto.png', scope: 'editorial', ...overrides }, { mediaRoot: root });

describe('media library', () => {
  it('stores re-encoded variants in the documented layout and records the asset', async () => {
    const dto = await upload(actors.editorCs, {
      filename: '../../etc/Titulní foto.png',
      provenance: 'Vlastní snímek',
      rights: 'CC BY 4.0',
      defaultAltCs: 'Tank v lese',
      defaultAltEn: 'Tank in a forest',
    });
    expect(dto).toMatchObject({
      scope: 'editorial',
      originalFilename: 'Titulní foto.png',
      sourceFormat: 'png',
      width: 120,
      height: 80,
      defaultAlt: { cs: 'Tank v lese', en: 'Tank in a forest' },
      urls: { full: `/api/media/${dto.id}/full`, thumb: `/api/media/${dto.id}/thumb` },
      usageCount: 0,
      publishedUse: false,
      owner: { userId: actors.editorCs.userId },
    });
    for (const variant of ['full', 'thumb']) {
      const file = path.join(root, dto.id, `${variant}.webp`);
      expect((await stat(file)).isFile()).toBe(true);
      expect((await sharp(file).metadata()).format).toBe('webp');
    }
    const [row] = await t.db.select().from(asset).where(eq(asset.id, dto.id));
    expect(row!.variants).toMatchObject({ full: { key: `${dto.id}/full.webp`, mime: 'image/webp' }, thumb: { key: `${dto.id}/thumb.webp` } });
    const audit = await t.db.select().from(auditEvent).where(and(eq(auditEvent.action, 'media.upload'), eq(auditEvent.entityId, dto.id)));
    expect(audit).toHaveLength(1);
  });

  it('rejects hostile uploads without storing anything', async () => {
    const before = (await t.db.select().from(asset)).length;
    const cases: [Buffer, string][] = [
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), 'unsupported_media'],
      [Buffer.from('<!doctype html><script>alert(1)</script>'), 'unsupported_media'],
      [Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('garbage')]), 'unsupported_media'],
      [Buffer.from('GIF89a\x02\x00\x02\x00\x80\x00\x00!\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00;', 'latin1'), 'unsupported_media'],
    ];
    for (const [bytes, code] of cases) {
      await expect(upload(actors.editorCs, { bytes, filename: 'photo.jpg' })).rejects.toMatchObject({ code });
    }
    const oversized = Buffer.alloc(15 * 1024 * 1024 + 1);
    oversized.set([0xff, 0xd8, 0xff]);
    await expect(upload(actors.editorCs, { bytes: oversized })).rejects.toMatchObject({ code: 'payload_too_large' });
    await expect(upload(actors.editorCs, { bytes: await png(6500, 6500) })).rejects.toMatchObject({ code: 'payload_too_large' });
    expect((await t.db.select().from(asset)).length).toBe(before);
  }, 60_000);

  it('enforces scope in both directions', async () => {
    await expect(upload(actors.editorCs, { scope: 'match' })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(upload(actors.matchManager, { scope: 'editorial' })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(upload(actors.member)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(upload({ kind: 'anonymous' })).rejects.toMatchObject({ code: 'unauthenticated' });
    const matchAsset = await upload(actors.matchManager, { scope: 'match' });
    const editorial = await upload(actors.editorCs);

    const editorList = await listAssets(t.db, actors.editorCs, { pageSize: 48 });
    expect(editorList.items.every((item) => item.scope === 'editorial')).toBe(true);
    expect(editorList.items.some((item) => item.id === matchAsset.id)).toBe(false);
    const managerList = await listAssets(t.db, actors.matchManager, {});
    expect(managerList.items.map((item) => item.id)).toEqual([matchAsset.id]);
    await expect(listAssets(t.db, actors.matchManager, { scope: 'editorial' })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(listAssets(t.db, actors.member, {})).rejects.toBeInstanceOf(AccessDeniedError);

    await expect(getAsset(t.db, actors.matchManager, { assetId: editorial.id })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(updateAssetMetadata(t.db, actors.editorCs, { assetId: matchAsset.id, rights: 'x' })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(deleteAsset(t.db, actors.editorCs, { assetId: matchAsset.id }, { mediaRoot: root })).rejects.toBeInstanceOf(AccessDeniedError);
    const denied = await t.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.action, 'media.delete'), eq(auditEvent.outcome, 'denied'), eq(auditEvent.entityId, matchAsset.id)));
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ actorUserId: actors.editorCs.userId, capability: 'media.match.manage' });
    await expect(stat(path.join(root, matchAsset.id, 'full.webp'))).resolves.toBeTruthy();
    const admin = await listAssets(t.db, actors.administrator, { pageSize: 48 });
    expect(new Set(admin.items.map((item) => item.scope))).toEqual(new Set(['editorial', 'match']));
  });

  it('searches, reports usage and refuses to delete referenced assets', async () => {
    const used = await upload(actors.editorCs, { defaultCaptionCs: 'Unikátní popisek 42' });
    const unused = await upload(actors.editorCs);
    const post = await createDocument(t.db, actors.editorCs, { kind: 'news', locale: 'cs', title: 'Používá obrázek', fields: { body: sampleBody('Text', used.id) } });

    const found = await listAssets(t.db, actors.editorCs, { q: 'unikátní POPISEK' });
    expect(found.items.map((item) => item.id)).toEqual([used.id]);
    expect(found.items[0]!.usageCount).toBe(1);
    const inUse = await listAssets(t.db, actors.editorCs, { inUse: true, pageSize: 48 });
    expect(inUse.items.map((item) => item.id)).toContain(used.id);
    expect(inUse.items.map((item) => item.id)).not.toContain(unused.id);
    const detail = await getAsset(t.db, actors.editorCs, { assetId: used.id });
    expect(detail.references).toEqual([{ kind: 'content', entityId: post.documentId, translationId: post.translationId, locale: 'cs', published: false }]);

    await expect(deleteAsset(t.db, actors.editorCs, { assetId: used.id }, { mediaRoot: root })).rejects.toMatchObject({ code: 'in_use' });
    // Once the draft no longer references it, deletion succeeds and files disappear.
    await saveDraft(t.db, actors.editorCs, { translationId: post.translationId, expectedVersion: post.version, fields: { body: sampleBody('Bez obrázku') } });
    await deleteAsset(t.db, actors.editorCs, { assetId: used.id }, { mediaRoot: root });
    await expect(stat(path.join(root, used.id))).rejects.toThrow();
    await expect(getAsset(t.db, actors.editorCs, { assetId: used.id })).rejects.toMatchObject({ code: 'not_found' });

    const updated = await updateAssetMetadata(t.db, actors.editorCs, { assetId: unused.id, defaultAltEn: 'Updated default' });
    expect(updated.defaultAlt.en).toBe('Updated default');
  });

  it('rate-limits uploads per user per hour', async () => {
    const values = Array.from({ length: UPLOADS_PER_HOUR }, (_, index) => ({
      scope: 'editorial' as const,
      state: 'ready' as const,
      ownerUserId: actors.editorEn.userId,
      originalFilename: `bulk-${index}.png`,
      sourceFormat: 'png',
      width: 1,
      height: 1,
      bytes: 1,
      sha256: 'b'.repeat(64),
    }));
    await t.db.insert(asset).values(values);
    await expect(upload(actors.editorEn)).rejects.toMatchObject({ code: 'rate_limited' });
  });
});

describe('upload route handler', () => {
  const deps = (actor: Actor | Error) => ({
    db: t.db,
    requireActor: async () => {
      if (actor instanceof Error) throw actor;
      return actor;
    },
    mediaRoot: root,
    allowedOrigins: [ORIGIN],
  });

  async function formRequest(options: { scope?: string; origin?: string | null; file?: Blob | null; headers?: Record<string, string> } = {}) {
    const form = new FormData();
    if (options.file !== null) form.set('file', options.file ?? new Blob([new Uint8Array(await png())], { type: 'image/png' }), 'foto.png');
    form.set('defaultAltCs', 'Popis');
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
    return new Request(`https://valkyriawdg.cz/api/media/upload?scope=${options.scope ?? 'editorial'}`, { method: 'POST', body: form, headers });
  }

  it('accepts an authorized same-origin multipart upload', async () => {
    const response = await handleUploadRequest(await formRequest(), deps(actors.editorCs));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { ok: boolean; asset: { id: string; defaultAlt: { cs: string } } };
    expect(body.ok).toBe(true);
    expect(body.asset.defaultAlt.cs).toBe('Popis');
  });

  it('rejects cross-site, unauthorized, malformed and oversized requests with stable codes', async () => {
    const cases: [Request, Actor | Error, number, string][] = [
      [await formRequest({ origin: 'https://evil.example' }), actors.editorCs, 403, 'forbidden'],
      [await formRequest({ origin: null }), actors.editorCs, 403, 'forbidden'],
      [await formRequest({ headers: { 'sec-fetch-site': 'cross-site' } }), actors.editorCs, 403, 'forbidden'],
      [await formRequest({ scope: 'global' }), actors.editorCs, 400, 'validation'],
      [await formRequest(), new AccessDeniedError('unauthenticated'), 401, 'unauthenticated'],
      [await formRequest({ scope: 'match' }), new AccessDeniedError('forbidden', 'media.match.manage'), 403, 'forbidden'],
      [await formRequest({ file: null }), actors.editorCs, 400, 'validation'],
      [await formRequest({ file: new Blob(['<svg/>'], { type: 'image/svg+xml' }) }), actors.editorCs, 415, 'unsupported_media'],
    ];
    for (const [request, actor, status, code] of cases) {
      const response = await handleUploadRequest(request, deps(actor));
      expect({ status: response.status, code: ((await response.json()) as { code: string }).code }).toEqual({ status, code });
    }
  });

  it('enforces the size limit from the header and while streaming', async () => {
    const declared = new Request('https://valkyriawdg.cz/api/media/upload?scope=editorial', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(MAX_UPLOAD_REQUEST_BYTES + 1) },
      body: 'x',
    });
    expect((await handleUploadRequest(declared, deps(actors.editorCs))).status).toBe(413);
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_UPLOAD_REQUEST_BYTES + chunk.length) controller.close();
        else {
          sent += chunk.length;
          controller.enqueue(chunk);
        }
      },
    });
    const streamed = new Request('https://valkyriawdg.cz/api/media/upload?scope=editorial', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'multipart/form-data; boundary=x' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const response = await handleUploadRequest(streamed, deps(actors.editorCs));
    expect(response.status).toBe(413);
    expect(sent).toBeLessThan(MAX_UPLOAD_REQUEST_BYTES + 3 * chunk.length);
  });
});
