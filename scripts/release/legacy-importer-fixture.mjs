import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Synthetic 8x8 orange PNG, generated with the pinned Sharp version. No game,
// legacy-site or production content is used by the image packaging rehearsal.
export const IMPORTER_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWP438CAFWEXHbQSAKmzX8F8AFWUAAAAAElFTkSuQmCC', 'base64');
export const IMPORTER_SLUG = 'synthetic-container-import';
const mediaId = 'f1c7a0e0-0000-4000-8000-00000000b001';

export function writeLegacyImporterFixture(directory) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'source.png'), IMPORTER_PNG);
  const bundle = {
    schemaVersion: 1, sourceOrigin: 'https://valkyriahll.cz', observedAt: '2026-09-29T00:00:00Z', sourceRevision: 'synthetic-container-packaging-test',
    documents: [{
      kind: 'news', legacyId: IMPORTER_SLUG, slug: IMPORTER_SLUG, game: 'hell-let-loose', locale: 'cs', sourceLanguage: 'cs',
      sourceUrl: 'https://valkyriahll.cz/clanky/' + IMPORTER_SLUG, sourcePublishedOn: '2020-01-01', sourceModifiedOn: null,
      title: 'Synthetic container import', excerpt: 'Synthetic fixture for CLI, PostgreSQL and native media verification.', authorLabel: 'Synthetic fixture', credits: '',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Synthetic packaging verification content.' }] }] },
      coverAssetId: mediaId, tags: [], metadata: {}, warnings: [],
    }],
    media: [{ id: mediaId, sourceUrl: 'https://valkyriahll.cz/images/synthetic-container-import.png', relativeFile: 'source.png', sha256: createHash('sha256').update(IMPORTER_PNG).digest('hex'), bytes: IMPORTER_PNG.length, alt: 'Synthetic orange square', role: 'cover', rightsStatus: 'legacy-published-owner-migration' }],
    matches: [], scoreboardSources: [], warnings: [],
  };
  const bytes = Buffer.from(JSON.stringify(bundle) + '\n');
  writeFileSync(path.join(directory, 'bundle.json'), bytes);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), mediaSha256: bundle.media[0].sha256 };
}
