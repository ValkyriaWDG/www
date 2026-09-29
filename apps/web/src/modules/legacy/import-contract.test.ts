import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processImage } from '@/modules/media/image';
import { importBundleSchema, readBundleFile, sourceHash } from './import-contract';
import { normalizeLegacyMatch } from './import-match';

const match = { id: 901, date: '27/09/2020 19:30', completed: false, teams: { home: { name: 'VLK', score: 0, side: 'allies' }, away: { name: 'SYN', score: 0, side: 'axis' } }, league: { name: 'Friendly' }, format: 'best of 1' };

describe('legacy migration contracts', () => {
  it('validates the exact image-rehearsal bundle and decodes both native media derivatives', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vlk-importer-image-fixture-'));
    try {
      const fixtureModule = new URL('../../../../../scripts/release/legacy-importer-fixture.mjs', import.meta.url);
      const { writeLegacyImporterFixture } = await import(fixtureModule.href);
      const fixture = writeLegacyImporterFixture(root);
      const bytes = await readFile(path.join(root, 'bundle.json'));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
      const bundle = importBundleSchema.parse(JSON.parse(bytes.toString('utf8')));
      expect(bundle.documents).toHaveLength(1);
      expect(bundle.media).toHaveLength(1);
      const media = bundle.media[0]!;
      expect(bundle.documents[0]!.coverAssetId).toBe(media.id);
      const input = await readBundleFile(root, { relativeFile: media.relativeFile!, bytes: media.bytes!, sha256: media.sha256! }, 15 * 1024 * 1024);
      const processed = await processImage(input);
      expect(processed).toMatchObject({ format: 'png', width: 8, height: 8 });
      for (const derivative of [processed.full, processed.thumb]) {
        expect(derivative).toMatchObject({ width: 8, height: 8 });
        expect(derivative.bytes).toBeGreaterThan(0);
        expect(await sharp(derivative.buffer).metadata()).toMatchObject({ format: 'webp', width: 8, height: 8 });
        expect((await sharp(derivative.buffer).raw().toBuffer()).length).toBeGreaterThan(0);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('uses stable source identities despite object key order but detects changed payloads', () => {
    expect(sourceHash({ a: 1, b: { y: 2, x: 3 } })).toBe(sourceHash({ b: { x: 3, y: 2 }, a: 1 }));
    expect(sourceHash({ score: 0 })).not.toBe(sourceHash({ score: 1 }));
  });
  it('preserves the verified fixed GMT+1 legacy parser unless the owner selects local Czech time', () => {
    expect(normalizeLegacyMatch(match).facts.startsAt).toEqual(new Date('2020-09-27T18:30:00Z'));
    expect(normalizeLegacyMatch(match, 'europe-prague').facts.startsAt).toEqual(new Date('2020-09-27T17:30:00Z'));
    expect(normalizeLegacyMatch({ ...match, date: '27/12/2020 19:30' }, 'europe-prague').facts.startsAt).toEqual(new Date('2020-12-27T18:30:00Z'));
    expect(() => normalizeLegacyMatch({ ...match, date: '31/02/2020 19:30' })).toThrow();
  });
  it('does not guess a reversed home team or accept credential-bearing VOD URLs', () => {
    expect(() => normalizeLegacyMatch({ ...match, teams: { ...match.teams, home: { name: 'SYN', score: 0 } } })).toThrow();
    expect(() => normalizeLegacyMatch({ ...match, links: [{ url: 'https://user:password@example.org/video' }] })).toThrow();
  });
  it('checks local file bounds and checksums and rejects traversal/absolute paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vlk-import-'));
    try {
      const bytes = Buffer.from('synthetic');
      await writeFile(path.join(root, 'input.json'), bytes);
      const file = { relativeFile: 'input.json', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      expect(await readBundleFile(root, file, 100)).toEqual(bytes);
      await expect(readBundleFile(root, { ...file, relativeFile: '../input.json' }, 100)).rejects.toThrow();
      await expect(readBundleFile(root, { ...file, relativeFile: 'C:/input.json' }, 100)).rejects.toThrow();
      await expect(readBundleFile(root, { ...file, sha256: '0'.repeat(64) }, 100)).rejects.toThrow();
      await expect(readBundleFile(root, file, 2)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
