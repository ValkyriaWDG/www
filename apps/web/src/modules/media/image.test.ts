import { mkdtemp, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '@/lib/result';
import { FULL_MAX_EDGE, MAX_UPLOAD_BYTES, THUMB_MAX_EDGE, detectImageFormat, processImage } from './image';
import { readVariant, resolveMediaRoot, variantKey, variantPath, writeVariants } from './storage';

const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 30 } } });

async function expectRejected(input: Buffer, code: DomainError['code']) {
  const error = await processImage(input).then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

describe('image intake', () => {
  it('detects formats by signature only', async () => {
    expect(detectImageFormat(await solid(4, 4).jpeg().toBuffer())).toBe('jpeg');
    expect(detectImageFormat(await solid(4, 4).png().toBuffer())).toBe('png');
    expect(detectImageFormat(await solid(4, 4).webp().toBuffer())).toBe('webp');
    expect(detectImageFormat(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it('re-encodes JPEG/PNG/WebP to bounded WebP variants', async () => {
    const large = await processImage(await solid(3000, 1500).png().toBuffer());
    expect(large).toMatchObject({ format: 'png', width: 3000, height: 1500 });
    expect(large.full).toMatchObject({ width: FULL_MAX_EDGE, height: 1200 });
    expect(large.thumb).toMatchObject({ width: THUMB_MAX_EDGE, height: 240 });
    expect((await sharp(large.full.buffer).metadata()).format).toBe('webp');
    const small = await processImage(await solid(300, 200).webp().toBuffer());
    expect(small.full).toMatchObject({ width: 300, height: 200 });
    expect(small.sha256).toMatch(/^[0-9a-f]{64}$/);
    const progressive = await processImage(await solid(640, 480).jpeg({ progressive: true, quality: 70 }).toBuffer());
    expect(progressive).toMatchObject({ format: 'jpeg', width: 640, height: 480 });
    // Zero padding after the end marker is tolerated (some encoders emit it).
    const padded = Buffer.concat([await solid(32, 32).jpeg().toBuffer(), Buffer.alloc(16)]);
    expect((await processImage(padded)).format).toBe('jpeg');
  });

  it('auto-rotates and strips EXIF/GPS metadata', async () => {
    const input = await solid(64, 48)
      .jpeg()
      .withExif({ IFD0: { Copyright: 'Synthetic owner' }, IFD3: { GPSMapDatum: 'SYNTHDATUM', GPSLatitudeRef: 'N', GPSLatitude: '50/1 5/1 0/1' } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(input).metadata()).exif?.toString('latin1')).toContain('SYNTHDATUM');
    const result = await processImage(input);
    expect(result).toMatchObject({ width: 48, height: 64 });
    for (const variant of [result.full, result.thumb]) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 48, height: 64 });
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(variant.buffer.toString('latin1')).not.toMatch(/SYNTHDATUM|Synthetic owner/);
    }
  });

  it('rejects hostile and unsupported files', async () => {
    await expectRejected(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'unsupported_media');
    await expectRejected(Buffer.from('<!doctype html><html><script>alert(1)</script></html>'), 'unsupported_media');
    await expectRejected(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'), 'unsupported_media');
    await expectRejected(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('garbage-not-a-png-chunk-stream')]), 'unsupported_media');
    const jpeg = await solid(200, 200).jpeg().toBuffer();
    await expectRejected(jpeg.subarray(0, Math.floor(jpeg.length / 2)), 'unsupported_media');
    await expectRejected(Buffer.concat([jpeg, Buffer.from('<html><script>alert(1)</script></html>')]), 'unsupported_media');
    const png = await solid(20, 20).png().toBuffer();
    await expectRejected(Buffer.concat([png, Buffer.from('PK\x03\x04zip-payload', 'latin1')]), 'unsupported_media');
    await expectRejected(Buffer.alloc(0), 'unsupported_media');
  });

  it('rejects oversized bytes, oversized edges and decompression bombs', async () => {
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    oversized.set([0xff, 0xd8, 0xff], 0);
    await expectRejected(oversized, 'payload_too_large');
    await expectRejected(await solid(12_001, 10).png().toBuffer(), 'payload_too_large');
    // ~42 MP, compresses to a tiny PNG: a classic decompression bomb.
    await expectRejected(await solid(6500, 6500).png({ compressionLevel: 9 }).toBuffer(), 'payload_too_large');
  }, 60_000);
});

describe('media storage layout', () => {
  let root: string;
  const id = '0b8f6c2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'valkyria-media-unit-'));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('uses server-generated keys under the root', async () => {
    expect(variantKey(id, 'full')).toBe(`${id}/full.webp`);
    expect(variantPath(root, id, 'thumb')).toBe(path.join(root, id, 'thumb.webp'));
    expect(resolveMediaRoot('')).toBe(path.resolve(process.cwd(), '.local/editorial-media'));
    await writeVariants(root, id, { full: Buffer.from('full-bytes'), thumb: Buffer.from('thumb-bytes') });
    expect((await readVariant(root, id, 'full'))?.toString()).toBe('full-bytes');
  });

  it('rejects traversal attempts and does not follow symlinks', async () => {
    for (const bad of ['../../etc/passwd', '..', `${id}/../x`, id.toUpperCase(), '']) {
      expect(() => variantPath(root, bad, 'full')).toThrow();
      expect(await readVariant(root, bad, 'full')).toBeNull();
    }
    expect(() => variantPath(root, id, '../x' as 'full')).toThrow();
    const linked = '1b8f6c2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
    const secret = path.join(root, 'secret.txt');
    await writeFile(secret, 'secret');
    await mkdir(path.join(root, linked));
    await symlink(secret, path.join(root, linked, 'full.webp'));
    expect(await readVariant(root, linked, 'full')).toBeNull();
  });
});
