import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { asset, auditEvent } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrincipal } from '@/modules/access/testing';
import { AccessDeniedError } from '@/modules/access/types';
import { seedTestUsers, testActors, TEST_USER_IDS } from '@/modules/content/testing';
import { deliverMedia } from '@/modules/media/delivery';
import { EDITORIAL_TEMPLATE_IDS, importedEditorialTemplates, importEditorialTemplate, listEditorialTemplates } from '@/modules/media/templates';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let root: string;
const actors = testActors();

beforeAll(async () => {
  t = await createTestDatabase();
  await seedTestUsers(t.db);
  root = await mkdtemp(path.join(os.tmpdir(), 'valkyria-templates-int-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await t.drop();
});

const count = async () => (await t.db.select().from(asset)).length;

describe('editorial template backgrounds', () => {
  it('lists the eight shipped text-free scenes with bilingual default alt text', () => {
    const templates = listEditorialTemplates();
    expect(templates.map((template) => template.id)).toEqual([...EDITORIAL_TEMPLATE_IDS]);
    expect(new Set(templates.map((template) => template.game))).toEqual(new Set(['hll', 'wardogs', 'community']));
    for (const template of templates) {
      expect(template.alt.cs).toMatch(/^Ilustrace: /);
      expect(template.alt.en).toMatch(/^Illustration: /);
      expect(template.preview).toBe(`/images/editorial/${template.id}-480x270.webp`);
    }
  });

  it('imports a template as an ordinary private editorial asset and reuses it afterwards', async () => {
    const first = await importEditorialTemplate(t.db, actors.editorCs, { templateId: 'hll-infantry' }, { mediaRoot: root });
    expect(first.created).toBe(true);
    const shipped = await readFile(path.join(process.cwd(), 'public/images/editorial/hll-infantry-1920x1080.webp'));
    const sha256 = createHash('sha256').update(shipped).digest('hex');
    expect(first.asset).toMatchObject({
      scope: 'editorial',
      originalFilename: 'valkyria-hll-infantry.webp',
      width: 1920,
      height: 1080,
      defaultAlt: { cs: expect.stringMatching(/^Ilustrace: americký pěšák/), en: expect.stringMatching(/^Illustration: US infantryman/) },
      usageCount: 0,
      publishedUse: false,
    });
    const [row] = await t.db.select().from(asset).where(eq(asset.id, first.asset.id));
    expect(row!.sha256).toBe(sha256);
    expect(row!.provenance).toContain(sha256);
    expect(row!.rights).toMatch(/AI-created/);
    expect(await t.db.select().from(auditEvent).where(and(eq(auditEvent.action, 'media.upload'), eq(auditEvent.entityId, first.asset.id)))).toHaveLength(1);

    // Unused library media stays private: the anonymous public route does not serve it.
    const anonymous = await deliverMedia(new Request('https://site.example/api/media/x/full'), { assetId: first.asset.id, variant: 'full' }, {
      db: t.db, mediaRoot: root, resolveActor: async () => ({ kind: 'anonymous' }),
    });
    expect(anonymous.status).toBe(404);

    const before = await count();
    const again = await importEditorialTemplate(t.db, actors.editorEn, { templateId: 'hll-infantry' }, { mediaRoot: root });
    expect(again).toMatchObject({ created: false, asset: { id: first.asset.id } });
    expect(await count()).toBe(before);
    expect(await importedEditorialTemplates(t.db, actors.administrator)).toEqual({ 'hll-infantry': first.asset.id });
  });

  it('denies match managers, members and game-scoped editors without storing anything', async () => {
    const hllEditor = testPrincipal(['editor'], { userId: TEST_USER_IDS.editorEn, label: 'Synthetic HLL editor', games: ['hell-let-loose'] });
    const before = await count();
    for (const actor of [actors.matchManager, actors.member, hllEditor]) {
      await expect(importEditorialTemplate(t.db, actor, { templateId: 'wdg-blue' }, { mediaRoot: root })).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(importedEditorialTemplates(t.db, actor)).rejects.toBeInstanceOf(AccessDeniedError);
    }
    expect(await count()).toBe(before);
  });

  it.each(['../hub', 'hub.webp', 'constructor', '__proto__', '', 'HLL-INFANTRY'])('rejects the unknown template id %j', async (templateId) => {
    await expect(importEditorialTemplate(t.db, actors.editorCs, { templateId }, { mediaRoot: root })).rejects.toMatchObject({ code: 'validation' });
  });
});
