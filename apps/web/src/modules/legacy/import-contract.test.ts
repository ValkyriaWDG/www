import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBundleFile, sourceHash } from './import-contract';
import { normalizeLegacyMatch } from './import-match';

const match = { id: 901, date: '27/09/2020 19:30', completed: false, teams: { home: { name: 'VLK', score: 0, side: 'allies' }, away: { name: 'SYN', score: 0, side: 'axis' } }, league: { name: 'Friendly' }, format: 'best of 1' };

describe('legacy migration contracts', () => {
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
