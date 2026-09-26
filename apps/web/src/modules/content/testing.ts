import { asset, authUser, taxonomyTerm, type AssetScope, type Executor } from '@valkyria/db';
import { randomUUID } from 'node:crypto';
import type { AppRole } from '@valkyria/db';
import { testPrincipal } from '@/modules/access/testing';
import type { Principal } from '@/modules/access/types';
import type { RichTextDocument } from './rich-text/schema';

/**
 * Synthetic fixtures for content/media integration tests. Never imported by application
 * code; identities are fake and use non-deliverable `.invalid` addresses.
 */

export const TEST_USER_IDS = {
  editorCs: '00000000-0000-4000-8000-00000000c501',
  editorEn: '00000000-0000-4000-8000-00000000c502',
  administrator: '00000000-0000-4000-8000-00000000c503',
  matchManager: '00000000-0000-4000-8000-00000000c504',
  member: '00000000-0000-4000-8000-00000000c505',
  localAdmin: '00000000-0000-4000-8000-00000000c506',
} as const;

type TestUserKey = keyof typeof TEST_USER_IDS;

const ROLES: Record<TestUserKey, AppRole[]> = {
  editorCs: ['editor'],
  editorEn: ['editor'],
  administrator: ['administrator'],
  matchManager: ['match_manager'],
  member: ['member'],
  localAdmin: ['administrator'],
};

const LABELS: Record<TestUserKey, string> = {
  editorCs: 'Synthetická redaktorka',
  editorEn: 'Synthetic English editor',
  administrator: 'Synthetic administrator',
  matchManager: 'Synthetic match manager',
  member: 'Synthetic member',
  localAdmin: 'Synthetic recovery admin',
};

export const LOCAL_GRANT = { id: '00000000-0000-4000-8000-00000000d001', version: 3 } as const;

export async function seedTestUsers(db: Executor): Promise<void> {
  await db
    .insert(authUser)
    .values(
      (Object.keys(TEST_USER_IDS) as TestUserKey[]).map((key) => ({
        id: TEST_USER_IDS[key],
        name: LABELS[key],
        email: `synthetic-${key.toLowerCase()}@accounts.invalid`,
      })),
    )
    .onConflictDoNothing();
}

/** Verified synthetic principals with write intent (see `testPrincipal`). */
export function testActors(): Record<TestUserKey, Principal> {
  const result = {} as Record<TestUserKey, Principal>;
  for (const key of Object.keys(TEST_USER_IDS) as TestUserKey[]) {
    result[key] = testPrincipal(ROLES[key], {
      userId: TEST_USER_IDS[key],
      label: LABELS[key],
      ...(key === 'localAdmin' ? { source: 'local_admin' as const, assurance: 'mfa' as const, localGrant: { ...LOCAL_GRANT } } : {}),
    });
  }
  return result;
}

export async function seedTaxonomy(db: Executor): Promise<void> {
  await db
    .insert(taxonomyTerm)
    .values([
      { kind: 'category', key: 'announcements', labelCs: 'Oznámení', labelEn: 'Announcements' },
      { kind: 'category', key: 'match-reports', labelCs: 'Reporty ze zápasů', labelEn: 'Match reports' },
      { kind: 'tag', key: 'tournament', labelCs: 'Turnaj', labelEn: 'Tournament' },
      { kind: 'tag', key: 'recruitment', labelCs: 'Nábor', labelEn: 'Recruitment' },
    ])
    .onConflictDoNothing();
}

/** Inserts a ready asset row without files (content tests that do not deliver bytes). */
export async function insertTestAsset(db: Executor, options: { scope?: AssetScope; ownerUserId?: string | null } = {}): Promise<string> {
  const id = randomUUID();
  await db.insert(asset).values({
    id,
    scope: options.scope ?? 'editorial',
    state: 'ready',
    ownerUserId: options.ownerUserId ?? null,
    originalFilename: 'synthetic.png',
    sourceFormat: 'png',
    width: 1600,
    height: 900,
    bytes: 1234,
    sha256: 'a'.repeat(64),
    variants: {
      full: { key: `${id}/full.webp`, width: 1600, height: 900, bytes: 1000, mime: 'image/webp' },
      thumb: { key: `${id}/thumb.webp`, width: 480, height: 270, bytes: 200, mime: 'image/webp' },
    },
  });
  return id;
}

/** A small valid rich-text body; optionally with an inline image. */
export function sampleBody(text: string, imageAssetId?: string): RichTextDocument {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Úvod' }] },
      { type: 'paragraph', content: [{ type: 'text', text }] },
      ...(imageAssetId
        ? [{ type: 'image' as const, attrs: { assetId: imageAssetId, alt: 'Ilustrační obrázek', caption: 'Popisek', decorative: false, align: 'center' as const } }]
        : []),
    ],
  };
}
