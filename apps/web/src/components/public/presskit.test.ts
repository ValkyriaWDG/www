import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PRESSKIT_FLYING, PRESSKIT_KEY_ART, WARDOGS_MARK } from './presskit';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const publicDir = path.resolve(repo, 'apps/web/public');
type CatalogAsset = { id: string; path: string; width: number; height: number; alt: { cs: string; en: string } };
const catalog = JSON.parse(readFileSync(path.join(repo, 'assets/presskit/wardogs-january-2026/catalog.json'), 'utf8')) as { assets: CatalogAsset[] };
const manifest = JSON.parse(readFileSync(path.join(repo, 'assets/manifest.json'), 'utf8')) as { assets: { path: string; sha256: string }[] };
const original = (id: string) => catalog.assets.find((asset) => asset.id === id)!;
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('presskit placements', () => {
  for (const image of [PRESSKIT_KEY_ART, PRESSKIT_FLYING]) {
    it(`${image.id}: catalog alt text, original ratio and registered derivatives`, async () => {
      const source = original(image.id);
      expect(image.alt).toEqual(source.alt);
      expect(image.width / image.height).toBeCloseTo(source.width / source.height, 3);
      expect(image.sources.map((entry) => entry.width)).toEqual([...image.sources.map((entry) => entry.width)].sort((a, b) => a - b));
      for (const entry of image.sources) {
        const file = path.join(publicDir, entry.src);
        const meta = await sharp(file).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.width).toBe(entry.width);
        expect((meta.width ?? 0) / (meta.height ?? 1)).toBeCloseTo(source.width / source.height, 2);
        const registered = manifest.assets.find((asset) => asset.path === path.relative(repo, file));
        expect(registered?.sha256).toBe(sha256(file));
      }
    });
  }

  it('uses the unchanged white wordmark with its intrinsic size', () => {
    const source = original('fullmark-white');
    const copy = path.join(publicDir, WARDOGS_MARK.src);
    expect(sha256(copy)).toBe(sha256(path.join(repo, source.path)));
    expect({ width: WARDOGS_MARK.width, height: WARDOGS_MARK.height }).toEqual({ width: source.width, height: source.height });
    expect(manifest.assets.some((asset) => asset.path === path.relative(repo, copy))).toBe(true);
  });

  it('keeps the key art complete and labels no photo as a clan event', () => {
    expect(PRESSKIT_KEY_ART.fit).toBe('contain');
    for (const image of [PRESSKIT_KEY_ART, PRESSKIT_FLYING]) {
      expect(`${image.alt.cs} ${image.alt.en}`).not.toMatch(/valkyri/i);
    }
  });
});
